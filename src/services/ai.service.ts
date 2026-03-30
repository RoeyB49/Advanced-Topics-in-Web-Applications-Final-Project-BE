import fs from "fs";
import path from "path";
import Post from "../models/post.model";
import Comment from "../models/comment.model";
import animeCatalogSeed from "../data/anime-catalog.json";
import {
  generateGeminiResponseText,
  parseGeminiJsonObject,
} from "./ai/geminiClient.helper";
import {
  clearReplyDiversityHistory,
  finalizeChatResponse,
  shouldCacheChatResponse,
} from "./ai/replyDiversity.helper";
import { getCommunitySignalSummary } from "./ai/communitySignals.helper";

const AI_MIN_INTERVAL_MS = parseInt(process.env.AI_MIN_INTERVAL_MS || "1500", 10);
const AI_CACHE_TTL_MS = parseInt(process.env.AI_CACHE_TTL_MS || "300000", 10);
const AI_CHAT_MIN_INTERVAL_MS = parseInt(
  process.env.AI_CHAT_MIN_INTERVAL_MS || String(AI_MIN_INTERVAL_MS),
  10
);
const AI_CHAT_CACHE_TTL_MS = parseInt(
  process.env.AI_CHAT_CACHE_TTL_MS || String(AI_CACHE_TTL_MS),
  10
);
const AI_QUERY_CACHE_MAX_ENTRIES = parseInt(process.env.AI_QUERY_CACHE_MAX_ENTRIES || "400", 10);
const AI_CHAT_CACHE_MAX_ENTRIES = parseInt(process.env.AI_CHAT_CACHE_MAX_ENTRIES || "400", 10);
const AI_CHAT_VARIATION_WINDOW_MS = parseInt(
  process.env.AI_CHAT_VARIATION_WINDOW_MS || "120000",
  10
);
const AI_METRICS_HISTORY_TTL_MS = parseInt(
  process.env.AI_METRICS_HISTORY_TTL_MS || "21600000",
  10
);
const AI_METRICS_ROLLING_WINDOW_MS = parseInt(
  process.env.AI_METRICS_ROLLING_WINDOW_MS || "900000",
  10
);
const AI_CHAT_ALTERNATIVE_EXCLUDE_ROUNDS = parseInt(
  process.env.AI_CHAT_ALTERNATIVE_EXCLUDE_ROUNDS || "3",
  10
);
const AI_CHAT_REPLY_HISTORY_TTL_MS = parseInt(
  process.env.AI_CHAT_REPLY_HISTORY_TTL_MS || "1200000",
  10
);
const AI_CHAT_REPLY_HISTORY_MAX_ITEMS = parseInt(
  process.env.AI_CHAT_REPLY_HISTORY_MAX_ITEMS || "8",
  10
);
const AI_COMMUNITY_SIGNAL_TTL_MS = parseInt(
  process.env.AI_COMMUNITY_SIGNAL_TTL_MS || "300000",
  10
);
const AI_CHAT_GEMINI_TEMPERATURE = parseFloat(
  process.env.AI_CHAT_GEMINI_TEMPERATURE || "0.7"
);
const AI_CHAT_DISABLE_CACHE_WHEN_EXTERNAL =
  process.env.AI_CHAT_DISABLE_CACHE_WHEN_EXTERNAL !== "false";

const DEFAULT_GEMINI_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];

type CacheEntry = {
  insights: AnimeQueryInsights;
  keywords: string[];
  createdAt: number;
};

export type AnimeQueryInsights = {
  normalizedQuery: string;
  keywords: string[];
  detectedAnimeTitles: string[];
  detectedGenres: string[];
  sentimentHint: "positive" | "negative" | "mixed" | "neutral";
  intent: "recommendation" | "comparison" | "analysis" | "general-search";
  source: "gemini" | "fallback";
};

const queryCache = new Map<string, CacheEntry>();
let lastExternalRequestAt = 0;
const chatCache = new Map<string, { response: ChatRecommendationResponse; createdAt: number }>();
const lastGeminiChatRequestAtByUser = new Map<string, number>();

const getFromCacheIfFresh = <T extends { createdAt: number }>(
  cache: Map<string, T>,
  key: string,
  ttlMs: number
): T | null => {
  const cached = cache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.createdAt > ttlMs) {
    cache.delete(key);
    return null;
  }

  return cached;
};

const setCacheEntry = <T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  maxEntries: number
) => {
  if (cache.has(key)) {
    cache.delete(key);
  }

  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }
};

const resolveGeminiModelCandidates = (): string[] => {
  const preferred = (process.env.GEMINI_MODEL || process.env.AI_CHAT_MODEL || "").trim();
  const extra = (process.env.GEMINI_MODEL_CANDIDATES || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  const explicitModels = [preferred, ...extra].filter(Boolean);
  const models = explicitModels.length > 0
    ? explicitModels
    : DEFAULT_GEMINI_MODELS;

  return models
    .map((model) => model.trim())
    .filter(Boolean)
    .filter((model, index, array) => array.indexOf(model) === index);
};

const isGeminiModelNotFoundError = (error: any): boolean => {
  const status = Number(error?.response?.status);
  if (status === 404) {
    return true;
  }

  const message = String(error?.message || "").toLowerCase();
  return message.includes("not found") || message.includes("404");
};

const isGeminiRateLimitedError = (error: any): boolean => {
  return Number(error?.response?.status) === 429;
};

const summarizeGeminiError = (error: any): Record<string, unknown> => {
  return {
    status: Number(error?.response?.status || 0) || undefined,
    code: String(error?.code || "") || undefined,
    message: String(error?.message || "Gemini request failed"),
    model: error?.config?.url ? String(error.config.url).split("/models/")[1]?.split(":")[0] : undefined,
  };
};

const generateGeminiTextWithFallbackModel = async (params: {
  prompt: string;
  temperature: number;
  timeoutMs: number;
}): Promise<{ text: string; model: string }> => {
  const models = resolveGeminiModelCandidates();
  let lastError: any;

  for (const model of models) {
    try {
      const text = await generateGeminiResponseText({
        prompt: params.prompt,
        model,
        temperature: params.temperature,
        timeoutMs: params.timeoutMs,
      });
      return { text, model };
    } catch (error: any) {
      lastError = error;
      if (!isGeminiModelNotFoundError(error)) {
        throw error;
      }
      console.warn(`Gemini model '${model}' returned not-found, trying next candidate.`);
    }
  }

  throw lastError || new Error("Failed to call Gemini with all configured model candidates");
};

export type ChatRole = "user" | "assistant";

export type ChatMessageInput = {
  role: ChatRole;
  text: string;
};

export type AnimeRecommendation = {
  title: string;
  reason: string;
  genres: string[];
  mood: string;
  confidence: number;
};

export type ChatRecommendationResponse = {
  source: "gemini" | "fallback";
  reply: string;
  recommendations: AnimeRecommendation[];
  extractedPreferences: string[];
  debug?: {
    fallbackReason?: "external-disabled" | "missing-api-key" | "chat-rate-limited" | "gemini-error";
  };
  basedOn: {
    watchedCount: number;
    preferenceCount: number;
    userSignalCount: number;
  };
};

type FallbackReason = "external-disabled" | "missing-api-key" | "chat-rate-limited" | "gemini-error";

type AiAdvisorMetrics = {
  totalChatRequests: number;
  geminiResponses: number;
  fallbackResponses: number;
  fallbackReasons: Record<FallbackReason, number>;
  responsesWithRecommendations: number;
  repeatedRecommendationResponses: number;
};

type ChatMetricEvent = {
  createdAt: number;
  source: "gemini" | "fallback";
  fallbackReason?: FallbackReason;
  hasRecommendations: boolean;
  repeatedRecommendation: boolean;
};

type RecommendationRound = {
  titles: string[];
  createdAt: number;
};

type ChatRecommendationRequest = {
  userId: string;
  message: string;
  watchedAnimes?: string[];
  preferences?: string[];
  history?: ChatMessageInput[];
};

type AnimeCatalogEntry = {
  title: string;
  genres: string[];
  moods: string[];
  tags: string[];
};

type FallbackContext = {
  combinedTerms: string[];
  historyTerms: string[];
  signalTerms: string[];
};

type RecommendationBuildContext = {
  excludedTitles: Set<string>;
  responseVariantSeed: string;
};

const normalizeQuery = (query: string): string => query.trim().toLowerCase();

const normalizeCatalogEntries = (entries: unknown): AnimeCatalogEntry[] => {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      const parsed = entry as Partial<AnimeCatalogEntry>;
      const title = String(parsed.title || "").trim();
      const genres = Array.isArray(parsed.genres)
        ? parsed.genres.map((genre) => String(genre).trim().toLowerCase()).filter(Boolean)
        : [];
      const moods = Array.isArray(parsed.moods)
        ? parsed.moods.map((mood) => String(mood).trim().toLowerCase()).filter(Boolean)
        : [];
      const tags = Array.isArray(parsed.tags)
        ? parsed.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean)
        : [];

      return {
        title,
        genres,
        moods,
        tags,
      };
    })
    .filter((entry) => entry.title && entry.genres.length > 0);
};

let animeRecommendationCatalog: AnimeCatalogEntry[] = normalizeCatalogEntries(animeCatalogSeed);
let catalogKnownTitles: string[] = [];
let catalogKnownGenres: string[] = [];
let lastCatalogLoadedAt = Date.now();
let activeCatalogPath = "seed";
let activeCatalogMtimeMs = 0;

const refreshCatalogIndexes = () => {
  catalogKnownTitles = animeRecommendationCatalog
    .map((entry) => entry.title.toLowerCase())
    .filter((title, index, array) => array.indexOf(title) === index);

  catalogKnownGenres = animeRecommendationCatalog
    .flatMap((entry) => entry.genres)
    .map((genre) => genre.trim().toLowerCase())
    .filter((genre, index, array) => array.indexOf(genre) === index);
};

const resolveCatalogPathCandidates = (): string[] => {
  const fromEnv = process.env.AI_CATALOG_PATH?.trim();
  const candidates = [
    fromEnv,
    path.resolve(process.cwd(), "src/data/anime-catalog.json"),
    path.resolve(process.cwd(), "dist/data/anime-catalog.json"),
    path.resolve(__dirname, "../data/anime-catalog.json"),
  ].filter((value): value is string => Boolean(value));

  return candidates.filter((candidate, index, array) => array.indexOf(candidate) === index);
};

const maybeReloadCatalog = () => {
  let foundRuntimeCatalog = false;

  for (const candidatePath of resolveCatalogPathCandidates()) {
    try {
      if (!fs.existsSync(candidatePath)) {
        continue;
      }

      foundRuntimeCatalog = true;
      const stats = fs.statSync(candidatePath);
      const nextMtime = stats.mtimeMs;
      if (activeCatalogPath === candidatePath && activeCatalogMtimeMs === nextMtime) {
        return;
      }

      const raw = fs.readFileSync(candidatePath, "utf8");
      const parsed = JSON.parse(raw);
      const normalized = normalizeCatalogEntries(parsed);

      if (normalized.length > 0) {
        animeRecommendationCatalog = normalized;
        activeCatalogPath = candidatePath;
        activeCatalogMtimeMs = nextMtime;
        lastCatalogLoadedAt = Date.now();
        refreshCatalogIndexes();
      }
      return;
    } catch (error) {
      console.error("Failed to reload anime catalog:", error);
    }
  }

  if (!foundRuntimeCatalog && activeCatalogPath !== "seed") {
    animeRecommendationCatalog = normalizeCatalogEntries(animeCatalogSeed);
    activeCatalogPath = "seed";
    activeCatalogMtimeMs = 0;
    lastCatalogLoadedAt = Date.now();
    refreshCatalogIndexes();
  }
};

refreshCatalogIndexes();

const KNOWN_ANIME_TITLES = [
  "attack on titan",
  "one piece",
  "naruto",
  "bleach",
  "demon slayer",
  "jujutsu kaisen",
  "death note",
  "fullmetal alchemist",
  "my hero academia",
  "chainsaw man",
  "spy x family",
  "tokyo ghoul",
  "hunter x hunter",
  "vinland saga",
  "dragon ball",
  "solo leveling",
];

const KNOWN_GENRES = [
  "action",
  "adventure",
  "comedy",
  "drama",
  "fantasy",
  "romance",
  "horror",
  "mystery",
  "sci-fi",
  "slice of life",
  "thriller",
  "sports",
  "mecha",
  "shonen",
  "seinen",
  "isekai",
];

const RECENT_ALTERNATIVE_HINTS = [
  "something else",
  "new list",
  "different",
  "another",
  "more options",
  "give me more",
  "other picks",
  "fresh",
];

const FALLBACK_REASON_KEYS: FallbackReason[] = [
  "external-disabled",
  "missing-api-key",
  "chat-rate-limited",
  "gemini-error",
];

const aiAdvisorMetrics: AiAdvisorMetrics = {
  totalChatRequests: 0,
  geminiResponses: 0,
  fallbackResponses: 0,
  fallbackReasons: {
    "external-disabled": 0,
    "missing-api-key": 0,
    "chat-rate-limited": 0,
    "gemini-error": 0,
  },
  responsesWithRecommendations: 0,
  repeatedRecommendationResponses: 0,
};

const recommendationHistoryByUser = new Map<string, RecommendationRound[]>();
const chatMetricEvents: ChatMetricEvent[] = [];

const emptyFallbackReasonCounters = (): Record<FallbackReason, number> => ({
  "external-disabled": 0,
  "missing-api-key": 0,
  "chat-rate-limited": 0,
  "gemini-error": 0,
});

const pruneOldChatMetricEvents = () => {
  const cutoff = Date.now() - AI_METRICS_ROLLING_WINDOW_MS;
  while (chatMetricEvents.length > 0 && chatMetricEvents[0].createdAt < cutoff) {
    chatMetricEvents.shift();
  }
};

const getRollingWindowMetrics = () => {
  pruneOldChatMetricEvents();

  const fallbackReasons = emptyFallbackReasonCounters();
  let geminiResponses = 0;
  let fallbackResponses = 0;
  let responsesWithRecommendations = 0;
  let repeatedRecommendationResponses = 0;

  chatMetricEvents.forEach((event) => {
    if (event.source === "gemini") {
      geminiResponses += 1;
    } else {
      fallbackResponses += 1;
      if (event.fallbackReason) {
        fallbackReasons[event.fallbackReason] += 1;
      }
    }

    if (event.hasRecommendations) {
      responsesWithRecommendations += 1;
    }
    if (event.repeatedRecommendation) {
      repeatedRecommendationResponses += 1;
    }
  });

  const totalChatRequests = chatMetricEvents.length;
  const geminiUsageRate = totalChatRequests > 0
    ? Number(((geminiResponses / totalChatRequests) * 100).toFixed(2))
    : 0;
  const repetitionRate = responsesWithRecommendations > 0
    ? Number(((repeatedRecommendationResponses / responsesWithRecommendations) * 100).toFixed(2))
    : 0;

  return {
    windowMs: AI_METRICS_ROLLING_WINDOW_MS,
    totalChatRequests,
    geminiResponses,
    fallbackResponses,
    fallbackReasons,
    responsesWithRecommendations,
    repeatedRecommendationResponses,
    geminiUsageRate,
    repetitionRate,
  };
};

const pruneOldRecommendationHistory = () => {
  const now = Date.now();
  Array.from(recommendationHistoryByUser.entries()).forEach(([userId, rounds]) => {
    const freshRounds = rounds.filter((round) => now - round.createdAt <= AI_METRICS_HISTORY_TTL_MS);
    if (freshRounds.length === 0) {
      recommendationHistoryByUser.delete(userId);
      return;
    }
    recommendationHistoryByUser.set(userId, freshRounds);
  });
};

const getRecentRecommendationTitlesForUser = (userId: string, roundsToInclude = 1): string[] => {
  pruneOldRecommendationHistory();

  const rounds = recommendationHistoryByUser.get(userId) || [];
  return Array.from(new Set(
    rounds
      .slice(-Math.max(1, roundsToInclude))
      .flatMap((round) => round.titles)
  ));
};

const recordChatOutcomeMetrics = (userId: string, response: ChatRecommendationResponse) => {
  aiAdvisorMetrics.totalChatRequests += 1;

  if (response.source === "gemini") {
    aiAdvisorMetrics.geminiResponses += 1;
  } else {
    aiAdvisorMetrics.fallbackResponses += 1;
    const fallbackReason = response.debug?.fallbackReason;
    if (fallbackReason && FALLBACK_REASON_KEYS.includes(fallbackReason)) {
      aiAdvisorMetrics.fallbackReasons[fallbackReason] += 1;
    }
  }

  const currentTitles = response.recommendations.map((recommendation) => recommendation.title.toLowerCase());
  if (currentTitles.length > 0) {
    aiAdvisorMetrics.responsesWithRecommendations += 1;
  }

  pruneOldRecommendationHistory();

  const previousRounds = recommendationHistoryByUser.get(userId) || [];
  const previous = previousRounds[previousRounds.length - 1];
  let repeatedRecommendation = false;
  if (previous && previous.titles.length > 0 && currentTitles.length > 0) {
    const overlapCount = currentTitles.filter((title) => previous.titles.includes(title)).length;
    const overlapThreshold = currentTitles.length >= 3 ? 2 : 1;
    if (overlapCount >= overlapThreshold) {
      aiAdvisorMetrics.repeatedRecommendationResponses += 1;
      repeatedRecommendation = true;
    }
  }

  pruneOldChatMetricEvents();
  chatMetricEvents.push({
    createdAt: Date.now(),
    source: response.source,
    fallbackReason: response.debug?.fallbackReason,
    hasRecommendations: currentTitles.length > 0,
    repeatedRecommendation,
  });

  const nextRounds = [...previousRounds, {
    titles: currentTitles,
    createdAt: Date.now(),
  }]
    .slice(-Math.max(AI_CHAT_ALTERNATIVE_EXCLUDE_ROUNDS + 2, 6));

  recommendationHistoryByUser.set(userId, nextRounds);
};

export const getAiAdvisorMetrics = () => {
  const geminiUsageRate = aiAdvisorMetrics.totalChatRequests > 0
    ? Number(((aiAdvisorMetrics.geminiResponses / aiAdvisorMetrics.totalChatRequests) * 100).toFixed(2))
    : 0;
  const repetitionRate = aiAdvisorMetrics.responsesWithRecommendations > 0
    ? Number((
      (aiAdvisorMetrics.repeatedRecommendationResponses / aiAdvisorMetrics.responsesWithRecommendations) * 100
    ).toFixed(2))
    : 0;

  return {
    ...aiAdvisorMetrics,
    catalogSize: animeRecommendationCatalog.length,
    catalogPath: activeCatalogPath,
    catalogMtimeMs: activeCatalogMtimeMs,
    catalogLastLoadedAt: new Date(lastCatalogLoadedAt).toISOString(),
    geminiUsageRate,
    repetitionRate,
    rollingWindow: getRollingWindowMetrics(),
  };
};

export const resetAiAdvisorMetrics = () => {
  aiAdvisorMetrics.totalChatRequests = 0;
  aiAdvisorMetrics.geminiResponses = 0;
  aiAdvisorMetrics.fallbackResponses = 0;
  aiAdvisorMetrics.responsesWithRecommendations = 0;
  aiAdvisorMetrics.repeatedRecommendationResponses = 0;
  FALLBACK_REASON_KEYS.forEach((reason) => {
    aiAdvisorMetrics.fallbackReasons[reason] = 0;
  });

  recommendationHistoryByUser.clear();
  chatMetricEvents.length = 0;
  clearReplyDiversityHistory();

  return getAiAdvisorMetrics();
};

const extractFallbackKeywords = (query: string): string[] => {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "for",
    "is",
    "are",
    "of",
    "in",
    "on",
    "with"
  ]);

  return normalizeQuery(query)
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/gi, ""))
    .filter((word) => word.length > 1 && !stopWords.has(word));
};

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const TERM_SYNONYM_MAP: Record<string, string[]> = {
  thriller: ["thriller", "suspense", "tense", "mind game", "psychological"],
  mystery: ["mystery", "detective", "crime", "investigation"],
  action: ["action", "fight", "battle", "war", "intense"],
  drama: ["drama", "emotional", "character", "relationships"],
  comedy: ["comedy", "funny", "light", "humor"],
  sports: ["sports", "team", "competition", "tournament"],
  romance: ["romance", "love", "romcom"],
  fantasy: ["fantasy", "magic", "adventure", "journey"],
  "sci-fi": ["sci-fi", "science fiction", "time travel", "future"],
  dark: ["dark", "mature", "gritty", "serious"],
};

const extractSemanticTerms = (text: string): string[] => {
  const normalized = normalizeQuery(text);
  if (!normalized) {
    return [];
  }

  const directTerms = extractFallbackKeywords(normalized);
  const synonymMatches = Object.entries(TERM_SYNONYM_MAP)
    .filter(([, synonyms]) => synonyms.some((synonym) => normalized.includes(synonym)))
    .map(([canonicalTerm]) => canonicalTerm);

  return normalizeList([...directTerms, ...synonymMatches]);
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isRejectionStatementForTitle = (text: string, normalizedTitle: string): boolean => {
  if (!text.includes(normalizedTitle)) {
    return false;
  }

  const titleRegex = escapeRegex(normalizedTitle);
  const exclusionHints = [
    "don'?t want",
    "do not want",
    "not these",
    "not this",
    "not that",
    "remove",
    "exclude",
    "skip",
    "avoid",
    "not interested",
    "already watched",
    "watched",
    "seen",
    "beside",
    "besides",
    "except",
    "anything but",
    "other than",
    "without",
    "but not",
    "no",
  ].join("|");
  const rejectionRegex = new RegExp(
    `(?:${exclusionHints}).{0,45}${titleRegex}|${titleRegex}.{0,45}(?:${exclusionHints})`,
    "i"
  );

  return rejectionRegex.test(text);
};

const extractExplicitExcludedTitleCandidates = (message: string): string[] => {
  const normalizedMessage = normalizeQuery(message || "");
  if (!normalizedMessage) {
    return [];
  }

  const listPattern = /(?:not\s+these|not\s+this|not\s+that|exclude|without|except|remove)\s*:?(.*)$/i;
  const match = normalizedMessage.match(listPattern);
  if (!match || !match[1]) {
    return [];
  }

  const tail = match[1]
    .replace(/\b(just|only|please|pls)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!tail) {
    return [];
  }

  return tail
    .split(/,|\/|;|\band\b/)
    .map((part) => part.trim())
    .map((part) => part.replace(/^[:\-]+/, "").trim())
    .filter((part) => part.length >= 3);
};

const extractRejectedAnimeTitles = (
  message: string,
  history: ChatMessageInput[]
): string[] => {
  const normalizedMessage = normalizeQuery(message || "");
  const normalizedHistoryText = normalizeHistory(history, 40)
    .map((entry) => entry.text)
    .join(" ");
  const fullText = `${normalizedMessage} ${normalizedHistoryText}`.trim();

  if (!fullText) {
    return [];
  }

  maybeReloadCatalog();
  const catalogTitles = catalogKnownTitles;
  const explicitCandidates = extractExplicitExcludedTitleCandidates(message);
  const explicitMatchedTitles = explicitCandidates.flatMap((candidate) => {
    return catalogTitles.filter((title) => {
      return title.includes(candidate) || candidate.includes(title);
    });
  });

  const rejectionMatchedTitles = catalogTitles.filter((normalizedTitle) =>
    isRejectionStatementForTitle(fullText, normalizedTitle)
  );

  return normalizeList([...explicitMatchedTitles, ...rejectionMatchedTitles]);
};

const sanitizeRecommendations = (
  recommendations: AnimeRecommendation[],
  excludedTitles: Set<string>
): AnimeRecommendation[] => {
  const uniqueByTitle = new Set<string>();

  return recommendations
    .filter((recommendation) => recommendation.title && recommendation.reason)
    .map((recommendation) => ({
      ...recommendation,
      title: recommendation.title.trim(),
      reason: recommendation.reason.trim(),
      genres: normalizeList(recommendation.genres),
      mood: recommendation.mood.trim().toLowerCase() || "balanced",
      confidence: Math.max(1, Math.min(100, Math.round(recommendation.confidence || 60))),
    }))
    .filter((recommendation) => {
      const normalizedTitle = recommendation.title.toLowerCase();
      if (excludedTitles.has(normalizedTitle) || uniqueByTitle.has(normalizedTitle)) {
        return false;
      }
      uniqueByTitle.add(normalizedTitle);
      return true;
    })
    .slice(0, 5);
};

const filterRecommendationsByStrictGenres = (
  recommendations: AnimeRecommendation[],
  strictGenres: string[]
): AnimeRecommendation[] => {
  if (strictGenres.length === 0) {
    return recommendations;
  }

  return recommendations.filter((recommendation) => {
    return strictGenres.every((genre) => recommendation.genres.includes(genre));
  });
};

const detectTitles = (normalizedQuery: string): string[] => {
  maybeReloadCatalog();
  const knownTitles = normalizeList([...KNOWN_ANIME_TITLES, ...catalogKnownTitles]);
  return knownTitles.filter((title) => normalizedQuery.includes(title));
};

const detectGenres = (normalizedQuery: string): string[] => {
  maybeReloadCatalog();
  const knownGenres = normalizeList([...KNOWN_GENRES, ...catalogKnownGenres]);
  return knownGenres.filter((genre) => normalizedQuery.includes(genre));
};

const extractStrictGenreConstraints = (
  message: string,
  history: ChatMessageInput[] = []
): string[] => {
  const combinedText = normalizeQuery([
    message,
    ...history.slice(-4).map((entry) => entry.text),
  ].join(" "));

  if (!combinedText) {
    return [];
  }

  maybeReloadCatalog();
  const knownGenres = normalizeList([...KNOWN_GENRES, ...catalogKnownGenres]);
  return knownGenres.filter((genre) => {
    const genreRegex = escapeRegex(genre);
    const strictBefore = new RegExp(`\\b(?:just|only|strictly)\\s+${genreRegex}\\b`, "i");
    const strictAfter = new RegExp(`\\b${genreRegex}\\s+only\\b`, "i");
    return strictBefore.test(combinedText) || strictAfter.test(combinedText);
  });
};

const userAskedForAlternatives = (message: string, history: ChatMessageInput[]): boolean => {
  const fullText = [message, ...history.slice(-6).map((entry) => entry.text)].join(" ").toLowerCase();
  return RECENT_ALTERNATIVE_HINTS.some((hint) => fullText.includes(hint));
};

const extractAssistantMentionedTitles = (history: ChatMessageInput[] = []): Set<string> => {
  const assistantText = history
    .filter((entry) => entry.role === "assistant")
    .map((entry) => entry.text)
    .join(" ")
    .toLowerCase();

  return new Set(
    catalogKnownTitles.filter((title) => assistantText.includes(title))
  );
};

const inferSentimentHint = (
  normalizedQuery: string
): "positive" | "negative" | "mixed" | "neutral" => {
  const positiveWords = ["best", "love", "amazing", "great", "favorite", "masterpiece"];
  const negativeWords = ["worst", "hate", "bad", "boring", "overrated", "disappointing"];

  const hasPositive = positiveWords.some((word) => normalizedQuery.includes(word));
  const hasNegative = negativeWords.some((word) => normalizedQuery.includes(word));

  if (hasPositive && hasNegative) return "mixed";
  if (hasPositive) return "positive";
  if (hasNegative) return "negative";
  return "neutral";
};

const inferIntent = (
  normalizedQuery: string
): "recommendation" | "comparison" | "analysis" | "general-search" => {
  if (/recommend|suggest|similar to|what should i watch/.test(normalizedQuery)) {
    return "recommendation";
  }

  if (/vs\b|versus|compare|better than/.test(normalizedQuery)) {
    return "comparison";
  }

  if (/review|analy|theme|character|ending|arc|story/.test(normalizedQuery)) {
    return "analysis";
  }

  return "general-search";
};

const buildFallbackInsights = (normalizedQuery: string): AnimeQueryInsights => {
  const keywords = extractFallbackKeywords(normalizedQuery);

  return {
    normalizedQuery,
    keywords,
    detectedAnimeTitles: detectTitles(normalizedQuery),
    detectedGenres: detectGenres(normalizedQuery),
    sentimentHint: inferSentimentHint(normalizedQuery),
    intent: inferIntent(normalizedQuery),
    source: "fallback",
  };
};

const buildGeminiPrompt = (normalizedQuery: string) => {
  return [
    "You analyze anime review search queries for a social app.",
    "Return only valid JSON with this exact schema:",
    "{",
    '  "keywords": string[],',
    '  "detectedAnimeTitles": string[],',
    '  "detectedGenres": string[],',
    '  "sentimentHint": "positive"|"negative"|"mixed"|"neutral",',
    '  "intent": "recommendation"|"comparison"|"analysis"|"general-search"',
    "}",
    "Rules:",
    "- Use lowercase for strings.",
    "- keywords should be short searchable terms.",
    "- If uncertain, return empty arrays and neutral/general-search.",
    `Query: ${normalizedQuery}`,
  ].join("\n");
};

const normalizeList = (items: string[] = []) => {
  return items
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
};

const normalizeHistory = (
  history: ChatMessageInput[] = [],
  maxEntries = 20
): ChatMessageInput[] => {
  return history
    .filter((entry) => entry && typeof entry.text === "string" && entry.text.trim().length > 0)
    .slice(-Math.max(1, maxEntries))
    .map((entry) => ({
      role: entry.role === "assistant" ? "assistant" : "user",
      text: entry.text.trim().toLowerCase(),
    }));
};

const buildUserSignals = async (userId: string) => {
  const [authoredPosts, likedPosts, recentComments] = await Promise.all([
    Post.find({ author: userId }).sort({ createdAt: -1 }).limit(8).select("text").lean(),
    Post.find({ likes: userId }).sort({ createdAt: -1 }).limit(8).select("text").lean(),
    Comment.find({ author: userId }).sort({ createdAt: -1 }).limit(8).select("text").lean(),
  ]);

  const snippets = [
    ...authoredPosts.map((post) => post.text),
    ...likedPosts.map((post) => post.text),
    ...recentComments.map((comment) => comment.text),
  ].filter(Boolean);

  const inferredPreferences = KNOWN_GENRES.filter((genre) =>
    snippets.some((snippet) => snippet.toLowerCase().includes(genre))
  );

  return {
    snippets: snippets.slice(0, 12),
    inferredPreferences,
  };
};

const rankRecommendations = (
  combinedTerms: string[],
  excludedTitles: Set<string>,
  seed: string
): AnimeRecommendation[] => {
  maybeReloadCatalog();
  const seedHash = hashString(seed);
  const scored = animeRecommendationCatalog.map((entry) => {
    const matchCount = combinedTerms.reduce((score, term) => {
      const inGenres = entry.genres.some((genre) => genre.includes(term) || term.includes(genre));
      const inTags = entry.tags.some((tag) => tag.includes(term) || term.includes(tag));
      const inMoods = entry.moods.some((mood) => mood.includes(term) || term.includes(mood));
      const inTitle = entry.title.toLowerCase().includes(term);
      return score + Number(inGenres || inTags || inMoods || inTitle);
    }, 0);

    const tieBreaker = hashString(`${seedHash}:${entry.title}`) % 1000;
    const explorationBoost = (hashString(`${seed}:explore:${entry.title}`) % 100) / 200;

    return {
      entry,
      matchCount,
      tieBreaker,
      score: matchCount + explorationBoost,
    };
  })
    .filter(({ entry }) => !excludedTitles.has(entry.title.toLowerCase()))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.tieBreaker - a.tieBreaker;
    });

  const topPool = scored.slice(0, Math.min(10, scored.length));
  const selected: typeof topPool = [];
  const usedGenres = new Set<string>();

  topPool.forEach((candidate) => {
    if (selected.length >= 4) {
      return;
    }

    const hasFreshGenre = candidate.entry.genres.some((genre) => !usedGenres.has(genre));
    if (hasFreshGenre || selected.length < 2) {
      selected.push(candidate);
      candidate.entry.genres.forEach((genre) => usedGenres.add(genre));
    }
  });

  if (selected.length < 4) {
    topPool.forEach((candidate) => {
      if (selected.length >= 4 || selected.some((item) => item.entry.title === candidate.entry.title)) {
        return;
      }
      selected.push(candidate);
    });
  }

  return selected.map(({ entry, matchCount, score }) => ({
    title: entry.title,
    reason: `Matches your vibe for ${entry.tags.slice(0, 2).join(" and ")} with a ${entry.moods[0]} tone.`,
    genres: entry.genres,
    mood: entry.moods[0],
    confidence: Math.max(45, Math.min(97, Math.round(52 + matchCount * 7 + score * 4))),
  }));
};

const buildFallbackChatRecommendations = async (
  payload: ChatRecommendationRequest,
  context: RecommendationBuildContext
): Promise<ChatRecommendationResponse> => {
  const normalizedMessage = normalizeQuery(payload.message);
  const normalizedHistory = normalizeHistory(payload.history, 12);
  const watched = normalizeList(payload.watchedAnimes);
  const preferences = normalizeList(payload.preferences);
  const signals = await buildUserSignals(payload.userId);
  const communitySignals = await getCommunitySignalSummary({
    ttlMs: AI_COMMUNITY_SIGNAL_TTL_MS,
    maybeReloadCatalog,
    detectGenres,
    detectTitles,
  });

  const extractedFromMessage = extractSemanticTerms(normalizedMessage);
  const messageDetectedTitles = detectTitles(normalizedMessage);
  const titleDrivenTerms = normalizeList(
    messageDetectedTitles.flatMap((detectedTitle) => {
      const catalogMatch = animeRecommendationCatalog.find(
        (entry) => entry.title.toLowerCase() === detectedTitle
      );

      if (!catalogMatch) {
        return [];
      }

      return [
        ...catalogMatch.genres,
        ...catalogMatch.moods,
        ...catalogMatch.tags,
      ];
    })
  );
  const historyTerms = extractSemanticTerms(normalizedHistory.map((entry) => entry.text).join(" "));
  const signalTerms = extractSemanticTerms(signals.snippets.join(" "));
  const communityTerms = normalizeList([
    ...communitySignals.topGenres,
    ...communitySignals.topTitles,
    ...extractSemanticTerms(communitySignals.sampleSnippets.join(" ")),
  ]);
  const combinedTerms = normalizeList([
    ...extractedFromMessage,
    ...titleDrivenTerms,
    ...historyTerms,
    ...signalTerms,
    ...communityTerms,
    ...preferences,
    ...signals.inferredPreferences,
  ]);

  const fallbackContext: FallbackContext = {
    combinedTerms,
    historyTerms,
    signalTerms,
  };

  const strictGenres = extractStrictGenreConstraints(payload.message, normalizedHistory);

  let recommendations = rankRecommendations(
    fallbackContext.combinedTerms,
    context.excludedTitles,
    context.responseVariantSeed
  );

  if (strictGenres.length > 0) {
    recommendations = recommendations.filter((recommendation) => {
      return strictGenres.every((genre) => recommendation.genres.includes(genre));
    });
  }

  const topGenres = normalizeList(
    recommendations.flatMap((recommendation) => recommendation.genres)
  ).slice(0, 4);

  const replyTemplates = [
    `I matched your request to ${recommendations
      .map((recommendation) => recommendation.title)
      .join(", ")}. These lean into ${topGenres.join(", ")} vibes based on your recent activity.`,
    `For your current mood, I would start with ${recommendations
      .map((recommendation) => recommendation.title)
      .join(", ")}. They line up with ${topGenres.join(", ")} and your chat context.`,
    `I pulled ${recommendations
      .map((recommendation) => recommendation.title)
      .join(", ")} from your taste profile. The strongest overlap is ${topGenres.join(", ")} plus themes from your recent posts/comments.`,
  ];
  const replyTemplateIndex = hashString(
    `${normalizedMessage}:${normalizedHistory.length}:${fallbackContext.signalTerms.join("|")}`
  ) % replyTemplates.length;

  return {
    source: "fallback",
    reply:
      recommendations.length > 0
        ? strictGenres.length > 0
          ? `Here are only ${strictGenres.join(" and ")} picks: ${recommendations
            .map((recommendation) => recommendation.title)
            .join(", ")}.`
          : replyTemplates[replyTemplateIndex]
        : "I need a bit more detail about your favorite genres or anime to recommend confidently.",
    recommendations,
    extractedPreferences: normalizeList([...preferences, ...signals.inferredPreferences]),
    basedOn: {
      watchedCount: watched.length,
      preferenceCount: preferences.length,
      userSignalCount: signals.snippets.length,
    },
  };
};

const withFallbackReason = (
  response: ChatRecommendationResponse,
  reason: "external-disabled" | "missing-api-key" | "chat-rate-limited" | "gemini-error"
): ChatRecommendationResponse => ({
  ...response,
  debug: {
    fallbackReason: reason,
  },
});

const buildGeminiChatPrompt = (payload: {
  message: string;
  watchedAnimes: string[];
  preferences: string[];
  userSignals: string[];
  history: ChatMessageInput[];
  excludedTitles: string[];
  recentAssistantTitles: string[];
  wantsAlternatives: boolean;
}) => {
  const historyText = payload.history
    .slice(-6)
    .map((entry) => `${entry.role}: ${entry.text}`)
    .join("\n");

  return [
    "You are an anime recommendation assistant for an anime reviews app.",
    "Speak naturally like a human expert fan, warm and conversational.",
    "Use user watched anime, preferences and recent in-app text signals to personalize recommendations.",
    "Return only valid JSON in this schema:",
    "{",
    '  "reply": string,',
    '  "extractedPreferences": string[],',
    '  "recommendations": [',
    "    {",
    '      "title": string,',
    '      "reason": string,',
    '      "genres": string[],',
    '      "mood": string,',
    '      "confidence": number',
    "    }",
    "  ]",
    "}",
    "Rules:",
    "- Recommend 3-5 anime.",
    "- Avoid watched anime in recommendations.",
    "- Never recommend anime from the excluded list.",
    "- If user asks for alternatives, do not repeat titles already suggested in this chat.",
    "- Write `reply` naturally (2-6 sentences), as if chatting directly with the user.",
    "- Make reasons specific (theme, pacing, tone, or character writing), not generic.",
    "- Confidence must be 1-100.",
    "- Keep titles as canonical names.",
    `User asks for alternatives now: ${payload.wantsAlternatives ? "yes" : "no"}`,
    `User message: ${payload.message}`,
    `Watched anime: ${payload.watchedAnimes.join(", ") || "none"}`,
    `Titles suggested earlier in this chat: ${payload.recentAssistantTitles.join(", ") || "none"}`,
    `Excluded anime (must not appear): ${payload.excludedTitles.join(", ") || "none"}`,
    `Stated preferences: ${payload.preferences.join(", ") || "none"}`,
    `User in-app signals: ${payload.userSignals.join(" || ") || "none"}`,
    `Recent chat history:\n${historyText || "none"}`,
  ].join("\n");
};

const parseGeminiChatResponse = (
  textResponse: string,
  fallback: ChatRecommendationResponse,
  excludedTitles: Set<string>,
  strictGenres: string[]
): ChatRecommendationResponse => {
  const parsed = parseGeminiJsonObject<any>(textResponse);

  const recommendations = Array.isArray(parsed?.recommendations)
    ? parsed.recommendations
        .map((entry: any) => ({
          title: String(entry?.title || "").trim(),
          reason: String(entry?.reason || "").trim(),
          genres: Array.isArray(entry?.genres)
            ? normalizeList(entry.genres.map((genre: unknown) => String(genre)))
            : [],
          mood: String(entry?.mood || "balanced").trim().toLowerCase(),
          confidence: Number(entry?.confidence) || 60,
        }))
        .filter((entry: AnimeRecommendation) => entry.title && entry.reason)
        .slice(0, 5)
    : [];

  const safeGeminiRecommendations = filterRecommendationsByStrictGenres(
    sanitizeRecommendations(recommendations, excludedTitles),
    strictGenres
  );
  const safeFallbackRecommendations = filterRecommendationsByStrictGenres(
    sanitizeRecommendations(fallback.recommendations, excludedTitles),
    strictGenres
  );

  const extractedPreferences = Array.isArray(parsed?.extractedPreferences)
    ? normalizeList(parsed.extractedPreferences.map((item: unknown) => String(item)))
    : fallback.extractedPreferences;

  return {
    source: "gemini",
    reply: String(parsed?.reply || ""),
    recommendations:
      safeGeminiRecommendations.length > 0
        ? safeGeminiRecommendations
        : safeFallbackRecommendations,
    extractedPreferences,
    basedOn: fallback.basedOn,
  };
};

const analyzeChatWithGemini = async (
  payload: ChatRecommendationRequest,
  userSignals: string[],
  fallback: ChatRecommendationResponse,
  excludedTitles: Set<string>,
  recentAssistantTitles: string[],
  wantsAlternatives: boolean,
  strictGenres: string[]
): Promise<ChatRecommendationResponse> => {
  const prompt = buildGeminiChatPrompt({
    message: payload.message,
    watchedAnimes: normalizeList(payload.watchedAnimes),
    preferences: normalizeList(payload.preferences),
    userSignals,
    history: (payload.history || []).filter((entry) => entry && entry.text).slice(-8),
    excludedTitles: Array.from(excludedTitles),
    recentAssistantTitles,
    wantsAlternatives,
  });

  const geminiResponse = await generateGeminiTextWithFallbackModel({
    prompt,
    temperature: AI_CHAT_GEMINI_TEMPERATURE,
    timeoutMs: 12000,
  });

  const textResponse = geminiResponse.text;

  return parseGeminiChatResponse(textResponse, fallback, excludedTitles, strictGenres);
};

const parseGeminiInsights = (
  normalizedQuery: string,
  textResponse: string,
  fallback: AnimeQueryInsights
): AnimeQueryInsights => {
  const parsed = parseGeminiJsonObject<any>(textResponse);

  const keywords =
    Array.isArray(parsed?.keywords) && parsed.keywords.length > 0
      ? parsed.keywords.map((value: string) => String(value).toLowerCase())
      : fallback.keywords;

  const detectedAnimeTitles =
    Array.isArray(parsed?.detectedAnimeTitles) && parsed.detectedAnimeTitles.length > 0
      ? parsed.detectedAnimeTitles.map((value: string) => String(value).toLowerCase())
      : fallback.detectedAnimeTitles;

  const detectedGenres =
    Array.isArray(parsed?.detectedGenres) && parsed.detectedGenres.length > 0
      ? parsed.detectedGenres.map((value: string) => String(value).toLowerCase())
      : fallback.detectedGenres;

  const sentimentHint =
    parsed?.sentimentHint === "positive" ||
    parsed?.sentimentHint === "negative" ||
    parsed?.sentimentHint === "mixed" ||
    parsed?.sentimentHint === "neutral"
      ? parsed.sentimentHint
      : fallback.sentimentHint;

  const intent =
    parsed?.intent === "recommendation" ||
    parsed?.intent === "comparison" ||
    parsed?.intent === "analysis" ||
    parsed?.intent === "general-search"
      ? parsed.intent
      : fallback.intent;

  return {
    normalizedQuery,
    keywords,
    detectedAnimeTitles,
    detectedGenres,
    sentimentHint,
    intent,
    source: "gemini",
  };
};

const analyzeWithGemini = async (normalizedQuery: string): Promise<AnimeQueryInsights> => {
  const prompt = buildGeminiPrompt(normalizedQuery);
  const fallback = buildFallbackInsights(normalizedQuery);

  const geminiResponse = await generateGeminiTextWithFallbackModel({
    prompt,
    temperature: 0.2,
    timeoutMs: 10000,
  });

  const textResponse = geminiResponse.text;

  return parseGeminiInsights(normalizedQuery, textResponse, fallback);
};

/**
 * Analyzes a search query with an external AI service to get search terms.
 * @param query The user's natural language query.
 * @returns A list of keywords to search for.
 */
export const analyzeAnimeQuery = async (query: string): Promise<AnimeQueryInsights> => {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return {
      normalizedQuery: "",
      keywords: [],
      detectedAnimeTitles: [],
      detectedGenres: [],
      sentimentHint: "neutral",
      intent: "general-search",
      source: "fallback",
    };
  }

  const cached = getFromCacheIfFresh(queryCache, normalized, AI_CACHE_TTL_MS);
  if (cached) {
    return cached.insights;
  }

  const now = Date.now();
  const shouldCallExternal =
    process.env.AI_EXTERNAL_ENABLED === "true" &&
    now - lastExternalRequestAt >= AI_MIN_INTERVAL_MS;

  try {
    if (shouldCallExternal) {
      lastExternalRequestAt = now;
      const externalInsights = await analyzeWithGemini(normalized);

      setCacheEntry(queryCache, normalized, {
        insights: externalInsights,
        keywords: externalInsights.keywords,
        createdAt: Date.now()
      }, AI_QUERY_CACHE_MAX_ENTRIES);

      return externalInsights;
    }

    const fallback = buildFallbackInsights(normalized);
    setCacheEntry(queryCache, normalized, {
      insights: fallback,
      keywords: fallback.keywords,
      createdAt: Date.now()
    }, AI_QUERY_CACHE_MAX_ENTRIES);
    return fallback;
  } catch (error) {
    console.error("Error contacting AI service:", error);
    const fallback = buildFallbackInsights(normalized);
    setCacheEntry(queryCache, normalized, {
      insights: fallback,
      keywords: fallback.keywords,
      createdAt: Date.now()
    }, AI_QUERY_CACHE_MAX_ENTRIES);
    return fallback;
  }
};

/**
 * Searches posts based on a natural language query.
 * @param query The user's natural language query.
 * @returns A list of posts that match the query.
 */
export const searchPosts = async (query: string) => {
  const insights = await analyzeAnimeQuery(query);
  const searchTerms = insights.keywords;

  return findPostsBySearchTerms(searchTerms);
};

const findPostsBySearchTerms = async (searchTerms: string[]) => {
  if (!searchTerms.length) {
    return [];
  }

  const searchRegex = new RegExp(searchTerms.join("|"), "i");

  const posts = await Post.find({
    $or: [{ text: searchRegex }, { "author.username": searchRegex }],
  }).populate("author", "username profileImage");

  return posts;
};

export const searchPostsWithInsights = async (query: string) => {
  const insights = await analyzeAnimeQuery(query);
  const posts = await findPostsBySearchTerms(insights.keywords);

  return {
    query: insights.normalizedQuery,
    ai: {
      source: insights.source,
      intent: insights.intent,
      sentimentHint: insights.sentimentHint,
      detectedAnimeTitles: insights.detectedAnimeTitles,
      detectedGenres: insights.detectedGenres,
      keywords: insights.keywords,
    },
    posts,
  };
};

export const getAnimeRecommendationChat = async (
  payload: ChatRecommendationRequest
): Promise<ChatRecommendationResponse> => {
  maybeReloadCatalog();
  const normalizedMessage = normalizeQuery(payload.message || "");
  if (!normalizedMessage) {
    throw new Error("message is required");
  }

  const watched = normalizeList(payload.watchedAnimes);
  const preferences = normalizeList(payload.preferences);
  const history = normalizeHistory(payload.history, 20);
  const rejectedTitles = extractRejectedAnimeTitles(payload.message, payload.history || []);
  const wantsAlternatives = userAskedForAlternatives(normalizedMessage, history);
  const assistantMentionedTitles = extractAssistantMentionedTitles(history);
  const recentRecommendedTitles = wantsAlternatives
    ? getRecentRecommendationTitlesForUser(payload.userId, AI_CHAT_ALTERNATIVE_EXCLUDE_ROUNDS)
    : [];
  const excludedTitles = new Set([
    ...watched,
    ...rejectedTitles,
    ...(wantsAlternatives ? Array.from(assistantMentionedTitles) : []),
    ...recentRecommendedTitles,
  ]);
  const historyFingerprint = history
    .slice(-8)
    .map((entry) => `${entry.role}:${extractSemanticTerms(entry.text).slice(0, 4).join(",")}`)
    .join("|");

  const cacheKey = JSON.stringify({
    userId: payload.userId,
    message: normalizedMessage,
    watched,
    preferences,
    historyFingerprint,
    rejectedTitles,
    wantsAlternatives,
  });

  const externalEnabled = process.env.AI_EXTERNAL_ENABLED === "true";
  const hasGeminiApiKey = Boolean(process.env.GEMINI_API_KEY);
  const canUseCache =
    !wantsAlternatives &&
    !(AI_CHAT_DISABLE_CACHE_WHEN_EXTERNAL && externalEnabled && hasGeminiApiKey);

  const cached = canUseCache
    ? getFromCacheIfFresh(chatCache, cacheKey, AI_CHAT_CACHE_TTL_MS)
    : null;
  if (cached) {
    return finalizeChatResponse({
      userId: payload.userId,
      response: cached.response,
      responseSeed: `${cacheKey}:cached`,
      replyHistoryTtlMs: AI_CHAT_REPLY_HISTORY_TTL_MS,
      replyHistoryMaxItems: AI_CHAT_REPLY_HISTORY_MAX_ITEMS,
      recordChatOutcomeMetrics,
      normalizeQuery,
      normalizeList,
      hashString,
    });
  }

  const signals = await buildUserSignals(payload.userId);
  const seedWindow = Math.floor(Date.now() / Math.max(AI_CHAT_VARIATION_WINDOW_MS, 5000));
  const responseVariantSeed = [
    payload.userId,
    normalizedMessage,
    historyFingerprint,
    String(seedWindow),
    wantsAlternatives ? "alt" : "default",
  ].join(":");

  const fallback = await buildFallbackChatRecommendations(payload, {
    excludedTitles,
    responseVariantSeed,
  });
  const strictGenres = extractStrictGenreConstraints(payload.message, history);

  try {
    if (externalEnabled && hasGeminiApiKey) {
      const now = Date.now();
      const lastGeminiAt = lastGeminiChatRequestAtByUser.get(payload.userId) || 0;
      if (now - lastGeminiAt < AI_CHAT_MIN_INTERVAL_MS) {
        const throttledFallback = withFallbackReason(fallback, "chat-rate-limited");
        const finalizedThrottledFallback = finalizeChatResponse({
          userId: payload.userId,
          response: throttledFallback,
          responseSeed: `${cacheKey}:chat-rate-limited-local`,
          replyHistoryTtlMs: AI_CHAT_REPLY_HISTORY_TTL_MS,
          replyHistoryMaxItems: AI_CHAT_REPLY_HISTORY_MAX_ITEMS,
          recordChatOutcomeMetrics,
          normalizeQuery,
          normalizeList,
          hashString,
        });

        if (canUseCache) {
          setCacheEntry(
            chatCache,
            cacheKey,
            { response: finalizedThrottledFallback, createdAt: Date.now() },
            AI_CHAT_CACHE_MAX_ENTRIES
          );
        }

        return finalizedThrottledFallback;
      }

      lastGeminiChatRequestAtByUser.set(payload.userId, now);
      const result = await analyzeChatWithGemini(
        payload,
        signals.snippets,
        fallback,
        excludedTitles,
        Array.from(assistantMentionedTitles),
        wantsAlternatives,
        strictGenres
      );
      const geminiReply = String(result.reply || "").trim();
      const hasGeminiReply = geminiReply.length > 0;
      const withReply = hasGeminiReply
        ? result
        : {
          ...result,
          reply: result.recommendations.length > 0
            ? `Here are ${strictGenres.length > 0 ? `only ${strictGenres.join(" and ")} ` : ""}picks that fit what you asked for: ${result.recommendations.map((item) => item.title).join(", ")}.`
            : "I could not find enough matching titles right now. Share one or two examples and I will recalibrate.",
        };
      const finalizedResult = finalizeChatResponse({
        userId: payload.userId,
        response: withReply,
        responseSeed: `${cacheKey}:gemini`,
        replyHistoryTtlMs: AI_CHAT_REPLY_HISTORY_TTL_MS,
        replyHistoryMaxItems: AI_CHAT_REPLY_HISTORY_MAX_ITEMS,
        recordChatOutcomeMetrics,
        normalizeQuery,
        normalizeList,
        hashString,
      });

      if (canUseCache && shouldCacheChatResponse(finalizedResult)) {
        setCacheEntry(
          chatCache,
          cacheKey,
          { response: finalizedResult, createdAt: Date.now() },
          AI_CHAT_CACHE_MAX_ENTRIES
        );
      }
      return finalizedResult;
    }
  } catch (error) {
    const fallbackReason = isGeminiRateLimitedError(error) ? "chat-rate-limited" : "gemini-error";
    console.error("Error contacting Gemini for recommendation chat:", summarizeGeminiError(error));
    const fallbackWithReason = withFallbackReason(fallback, fallbackReason);
    const finalizedFallbackError = finalizeChatResponse({
      userId: payload.userId,
      response: fallbackWithReason,
      responseSeed: `${cacheKey}:${fallbackReason}`,
      replyHistoryTtlMs: AI_CHAT_REPLY_HISTORY_TTL_MS,
      replyHistoryMaxItems: AI_CHAT_REPLY_HISTORY_MAX_ITEMS,
      recordChatOutcomeMetrics,
      normalizeQuery,
      normalizeList,
      hashString,
    });

    if (canUseCache) {
      setCacheEntry(
        chatCache,
        cacheKey,
        { response: finalizedFallbackError, createdAt: Date.now() },
        AI_CHAT_CACHE_MAX_ENTRIES
      );
    }
    return finalizedFallbackError;
  }

  const fallbackReason = !externalEnabled
    ? "external-disabled"
    : !hasGeminiApiKey
      ? "missing-api-key"
      : "gemini-error";

  const fallbackWithReason = withFallbackReason(fallback, fallbackReason);
  const finalizedFallback = finalizeChatResponse({
    userId: payload.userId,
    response: fallbackWithReason,
    responseSeed: `${cacheKey}:${fallbackReason}`,
    replyHistoryTtlMs: AI_CHAT_REPLY_HISTORY_TTL_MS,
    replyHistoryMaxItems: AI_CHAT_REPLY_HISTORY_MAX_ITEMS,
    recordChatOutcomeMetrics,
    normalizeQuery,
    normalizeList,
    hashString,
  });

  if (canUseCache) {
    setCacheEntry(
      chatCache,
      cacheKey,
      { response: finalizedFallback, createdAt: Date.now() },
      AI_CHAT_CACHE_MAX_ENTRIES
    );
  }
  return finalizedFallback;
};
