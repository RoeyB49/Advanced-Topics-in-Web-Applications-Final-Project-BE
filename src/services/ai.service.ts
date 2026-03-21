import axios from "axios";
import Post from "../models/post.model";

const AI_API_URL = process.env.AI_API_URL || "http://localhost:5000/api";
const AI_MIN_INTERVAL_MS = parseInt(process.env.AI_MIN_INTERVAL_MS || "1500", 10);
const AI_CACHE_TTL_MS = parseInt(process.env.AI_CACHE_TTL_MS || "300000", 10);

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
  source: "external-ai" | "fallback";
};

const queryCache = new Map<string, CacheEntry>();
let lastExternalRequestAt = 0;

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
      const response = await axios.post(`${AI_API_URL}/analyze-anime-query`, {
        query: normalized
      });

      const fallback = buildFallbackInsights(normalized);
      const externalKeywords =
        Array.isArray(response.data?.keywords) && response.data.keywords.length > 0
          ? response.data.keywords
          : fallback.keywords;

      const externalInsights: AnimeQueryInsights = {
        normalizedQuery: normalized,
        keywords: externalKeywords,
        detectedAnimeTitles:
          Array.isArray(response.data?.detectedAnimeTitles) &&
          response.data.detectedAnimeTitles.length > 0
            ? response.data.detectedAnimeTitles
            : fallback.detectedAnimeTitles,
        detectedGenres:
          Array.isArray(response.data?.detectedGenres) &&
          response.data.detectedGenres.length > 0
            ? response.data.detectedGenres
            : fallback.detectedGenres,
        sentimentHint:
          response.data?.sentimentHint === "positive" ||
          response.data?.sentimentHint === "negative" ||
          response.data?.sentimentHint === "mixed" ||
          response.data?.sentimentHint === "neutral"
            ? response.data.sentimentHint
            : fallback.sentimentHint,
        intent:
          response.data?.intent === "recommendation" ||
          response.data?.intent === "comparison" ||
          response.data?.intent === "analysis" ||
          response.data?.intent === "general-search"
            ? response.data.intent
            : fallback.intent,
        source: "external-ai",
      };

      queryCache.set(normalized, {
        insights: externalInsights,
        keywords: externalKeywords,
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
