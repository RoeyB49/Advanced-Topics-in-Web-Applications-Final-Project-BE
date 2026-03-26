import axios from "axios";
import Post from "../models/post.model";
import Comment from "../models/comment.model";

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
const lastChatExternalRequestAtByRequest = new Map<string, number>();

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
};

const normalizeQuery = (query: string): string => query.trim().toLowerCase();

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

const ANIME_RECOMMENDATION_CATALOG: AnimeCatalogEntry[] = [
  {
    title: "Attack on Titan",
    genres: ["action", "drama", "thriller"],
    moods: ["intense", "dark"],
    tags: ["war", "twists", "strategy", "survival"],
  },
  {
    title: "Fullmetal Alchemist: Brotherhood",
    genres: ["action", "adventure", "drama"],
    moods: ["emotional", "balanced"],
    tags: ["brothers", "alchemy", "worldbuilding", "character growth"],
  },
  {
    title: "Steins;Gate",
    genres: ["sci-fi", "thriller", "drama"],
    moods: ["mind-bending", "tense"],
    tags: ["time travel", "mystery", "plot twists"],
  },
  {
    title: "Haikyuu!!",
    genres: ["sports", "comedy", "drama"],
    moods: ["motivational", "uplifting"],
    tags: ["teamwork", "character growth", "competition"],
  },
  {
    title: "Vinland Saga",
    genres: ["action", "drama", "seinen"],
    moods: ["serious", "reflective"],
    tags: ["revenge", "historical", "war", "mature"],
  },
  {
    title: "Kaguya-sama: Love Is War",
    genres: ["romance", "comedy"],
    moods: ["fun", "light"],
    tags: ["romcom", "mind games", "school"],
  },
  {
    title: "Monster",
    genres: ["mystery", "thriller", "seinen"],
    moods: ["dark", "psychological"],
    tags: ["slow burn", "crime", "moral conflict"],
  },
  {
    title: "Mob Psycho 100",
    genres: ["action", "comedy", "slice of life"],
    moods: ["heartfelt", "energetic"],
    tags: ["supernatural", "character growth", "funny"],
  },
  {
    title: "Death Note",
    genres: ["thriller", "mystery"],
    moods: ["dark", "strategic"],
    tags: ["cat and mouse", "mind games", "moral gray"],
  },
  {
    title: "Frieren: Beyond Journey's End",
    genres: ["fantasy", "drama", "adventure"],
    moods: ["calm", "emotional"],
    tags: ["journey", "reflection", "character driven"],
  },
];

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

  const catalogTitles = ANIME_RECOMMENDATION_CATALOG.map((entry) => entry.title.toLowerCase());
  return catalogTitles.filter((normalizedTitle) =>
    isRejectionStatementForTitle(fullText, normalizedTitle)
  );
};

const sanitizeRecommendations = (
  recommendations: AnimeRecommendation[],
  excludedTitles: Set<string>
): AnimeRecommendation[] => {
  return recommendations.filter(
    (recommendation) => !excludedTitles.has(recommendation.title.toLowerCase())
  );
};

const detectTitles = (normalizedQuery: string): string[] => {
  return KNOWN_ANIME_TITLES.filter((title) => normalizedQuery.includes(title));
};

const detectGenres = (normalizedQuery: string): string[] => {
  return KNOWN_GENRES.filter((genre) => normalizedQuery.includes(genre));
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

const extractJsonFromText = (text: string): string => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Gemini response does not contain a JSON object");
  }

  return text.slice(start, end + 1);
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
  watchedSet: Set<string>,
  seed: string
): AnimeRecommendation[] => {
  const seedHash = hashString(seed);
  const scored = ANIME_RECOMMENDATION_CATALOG.map((entry) => {
    const matchCount = combinedTerms.reduce((score, term) => {
      const inGenres = entry.genres.some((genre) => genre.includes(term) || term.includes(genre));
      const inTags = entry.tags.some((tag) => tag.includes(term) || term.includes(tag));
      const inMoods = entry.moods.some((mood) => mood.includes(term) || term.includes(mood));
      const inTitle = entry.title.toLowerCase().includes(term);
      return score + Number(inGenres || inTags || inMoods || inTitle);
    }, 0);

    // Stable tie-breaker to avoid static top picks when scores are close/zero.
    const tieBreaker = hashString(`${seedHash}:${entry.title}`) % 1000;

    return {
      entry,
      matchCount,
      tieBreaker,
    };
  })
    .filter(({ entry }) => !watchedSet.has(entry.title.toLowerCase()))
    .sort((a, b) => {
      if (b.matchCount !== a.matchCount) {
        return b.matchCount - a.matchCount;
      }
      return b.tieBreaker - a.tieBreaker;
    });

  const selected = (scored[0]?.matchCount ?? 0) > 0
    ? scored.slice(0, 4)
    : scored.slice(0, 4);

  return selected.map(({ entry, matchCount }) => ({
    title: entry.title,
    reason: `Matches your vibe for ${entry.tags.slice(0, 2).join(" and ")} with a ${entry.moods[0]} tone.`,
    genres: entry.genres,
    mood: entry.moods[0],
    confidence: Math.max(55, Math.min(95, 55 + matchCount * 8)),
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

  const extractedFromMessage = extractSemanticTerms(normalizedMessage);
  const historyTerms = extractSemanticTerms(normalizedHistory.map((entry) => entry.text).join(" "));
  const signalTerms = extractSemanticTerms(signals.snippets.join(" "));
  const combinedTerms = normalizeList([
    ...extractedFromMessage,
    ...historyTerms,
    ...signalTerms,
    ...preferences,
    ...signals.inferredPreferences,
  ]);

  const fallbackContext: FallbackContext = {
    combinedTerms,
    historyTerms,
    signalTerms,
  };

  const recommendations = rankRecommendations(
    fallbackContext.combinedTerms,
    context.excludedTitles,
    `${payload.userId}:${normalizedMessage}:${normalizedHistory.map((entry) => entry.text).join("|")}`
  );
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
        ? replyTemplates[replyTemplateIndex]
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
}) => {
  const historyText = payload.history
    .slice(-6)
    .map((entry) => `${entry.role}: ${entry.text}`)
    .join("\n");

  return [
    "You are an anime recommendation assistant for an anime reviews app.",
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
    "- Confidence must be 1-100.",
    "- Keep titles as canonical names.",
    `User message: ${payload.message}`,
    `Watched anime: ${payload.watchedAnimes.join(", ") || "none"}`,
    `Excluded anime (must not appear): ${payload.excludedTitles.join(", ") || "none"}`,
    `Stated preferences: ${payload.preferences.join(", ") || "none"}`,
    `User in-app signals: ${payload.userSignals.join(" || ") || "none"}`,
    `Recent chat history:\n${historyText || "none"}`,
  ].join("\n");
};

const parseGeminiChatResponse = (
  textResponse: string,
  fallback: ChatRecommendationResponse,
  excludedTitles: Set<string>
): ChatRecommendationResponse => {
  const parsed = JSON.parse(extractJsonFromText(textResponse));

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

  const safeGeminiRecommendations = sanitizeRecommendations(recommendations, excludedTitles);
  const safeFallbackRecommendations = sanitizeRecommendations(fallback.recommendations, excludedTitles);

  const extractedPreferences = Array.isArray(parsed?.extractedPreferences)
    ? normalizeList(parsed.extractedPreferences.map((item: unknown) => String(item)))
    : fallback.extractedPreferences;

  return {
    source: "gemini",
    reply: String(parsed?.reply || fallback.reply),
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
  excludedTitles: Set<string>
): Promise<ChatRecommendationResponse> => {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const geminiApiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;

  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const prompt = buildGeminiChatPrompt({
    message: payload.message,
    watchedAnimes: normalizeList(payload.watchedAnimes),
    preferences: normalizeList(payload.preferences),
    userSignals,
    history: (payload.history || []).filter((entry) => entry && entry.text).slice(-8),
    excludedTitles: Array.from(excludedTitles),
  });

  const response = await axios.post(
    geminiApiUrl,
    {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.45,
        responseMimeType: "application/json",
      },
    },
    {
      params: {
        key: geminiApiKey,
      },
      timeout: 12000,
    }
  );

  const textResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse || typeof textResponse !== "string") {
    throw new Error("Gemini returned empty response for chat recommendations");
  }

  return parseGeminiChatResponse(textResponse, fallback, excludedTitles);
};

const parseGeminiInsights = (
  normalizedQuery: string,
  textResponse: string,
  fallback: AnimeQueryInsights
): AnimeQueryInsights => {
  const parsed = JSON.parse(extractJsonFromText(textResponse));

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
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const geminiApiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;

  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const prompt = buildGeminiPrompt(normalizedQuery);
  const fallback = buildFallbackInsights(normalizedQuery);

  const response = await axios.post(
    geminiApiUrl,
    {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    },
    {
      params: {
        key: geminiApiKey,
      },
      timeout: 10000,
    }
  );

  const textResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textResponse || typeof textResponse !== "string") {
    throw new Error("Gemini returned empty response");
  }

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

  const cached = queryCache.get(normalized);
  if (cached && Date.now() - cached.createdAt < AI_CACHE_TTL_MS) {
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

      queryCache.set(normalized, {
        insights: externalInsights,
        keywords: externalInsights.keywords,
        createdAt: Date.now()
      });

      return externalInsights;
    }

    const fallback = buildFallbackInsights(normalized);
    queryCache.set(normalized, {
      insights: fallback,
      keywords: fallback.keywords,
      createdAt: Date.now()
    });
    return fallback;
  } catch (error) {
    console.error("Error contacting AI service:", error);
    const fallback = buildFallbackInsights(normalized);
    queryCache.set(normalized, {
      insights: fallback,
      keywords: fallback.keywords,
      createdAt: Date.now()
    });
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
  const normalizedMessage = normalizeQuery(payload.message || "");
  if (!normalizedMessage) {
    throw new Error("message is required");
  }

  const watched = normalizeList(payload.watchedAnimes);
  const preferences = normalizeList(payload.preferences);
  const history = normalizeHistory(payload.history, 20);
  const rejectedTitles = extractRejectedAnimeTitles(payload.message, payload.history || []);
  const excludedTitles = new Set([...watched, ...rejectedTitles]);
  const cacheKey = JSON.stringify({
    userId: payload.userId,
    message: normalizedMessage,
    watched,
    preferences,
    history,
    rejectedTitles,
  });

  const cached = chatCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < AI_CHAT_CACHE_TTL_MS) {
    return cached.response;
  }

  const signals = await buildUserSignals(payload.userId);
  const fallback = await buildFallbackChatRecommendations(payload, { excludedTitles });

  const now = Date.now();
  const lastForRequest = lastChatExternalRequestAtByRequest.get(cacheKey) || 0;
  const externalEnabled = process.env.AI_EXTERNAL_ENABLED === "true";
  const hasGeminiApiKey = Boolean(process.env.GEMINI_API_KEY);
  const isRateLimited = now - lastForRequest < AI_CHAT_MIN_INTERVAL_MS;
  const shouldCallExternal =
    externalEnabled &&
    hasGeminiApiKey &&
    !isRateLimited;

  try {
    if (shouldCallExternal) {
      lastChatExternalRequestAtByRequest.set(cacheKey, now);
      const result = await analyzeChatWithGemini(payload, signals.snippets, fallback, excludedTitles);
      chatCache.set(cacheKey, { response: result, createdAt: Date.now() });
      return result;
    }
  } catch (error) {
    console.error("Error contacting Gemini for recommendation chat:", error);
    const fallbackWithReason = withFallbackReason(fallback, "gemini-error");
    chatCache.set(cacheKey, { response: fallbackWithReason, createdAt: Date.now() });
    return fallbackWithReason;
  }

  const fallbackReason = !externalEnabled
    ? "external-disabled"
    : !hasGeminiApiKey
      ? "missing-api-key"
      : "chat-rate-limited";

  const fallbackWithReason = withFallbackReason(fallback, fallbackReason);
  chatCache.set(cacheKey, { response: fallbackWithReason, createdAt: Date.now() });
  return fallbackWithReason;
};
