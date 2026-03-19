import axios from "axios";
import Post from "../models/post.model";

const AI_API_URL = process.env.AI_API_URL || "http://localhost:5000/api";
const AI_MIN_INTERVAL_MS = parseInt(process.env.AI_MIN_INTERVAL_MS || "1500", 10);
const AI_CACHE_TTL_MS = parseInt(process.env.AI_CACHE_TTL_MS || "300000", 10);

type CacheEntry = {
  keywords: string[];
  createdAt: number;
};

const queryCache = new Map<string, CacheEntry>();
let lastExternalRequestAt = 0;

const normalizeQuery = (query: string): string => query.trim().toLowerCase();

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

/**
 * Analyzes a search query with an external AI service to get search terms.
 * @param query The user's natural language query.
 * @returns A list of keywords to search for.
 */
const getSearchTermsFromAI = async (query: string): Promise<string[]> => {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return [];
  }

  const cached = queryCache.get(normalized);
  if (cached && Date.now() - cached.createdAt < AI_CACHE_TTL_MS) {
    return cached.keywords;
  }

  const now = Date.now();
  const shouldCallExternal =
    process.env.AI_EXTERNAL_ENABLED === "true" &&
    now - lastExternalRequestAt >= AI_MIN_INTERVAL_MS;

  try {
    if (shouldCallExternal) {
      lastExternalRequestAt = now;
      const response = await axios.post(`${AI_API_URL}/analyze-query`, {
        query: normalized
      });

      const externalKeywords =
        Array.isArray(response.data?.keywords) && response.data.keywords.length > 0
          ? response.data.keywords
          : extractFallbackKeywords(normalized);

      queryCache.set(normalized, {
        keywords: externalKeywords,
        createdAt: Date.now()
      });

      return externalKeywords;
    }

    const fallback = extractFallbackKeywords(normalized);
    queryCache.set(normalized, { keywords: fallback, createdAt: Date.now() });
    return fallback;
  } catch (error) {
    console.error("Error contacting AI service:", error);
    const fallback = extractFallbackKeywords(normalized);
    queryCache.set(normalized, { keywords: fallback, createdAt: Date.now() });
    return fallback;
  }
};

/**
 * Searches posts based on a natural language query.
 * @param query The user's natural language query.
 * @returns A list of posts that match the query.
 */
export const searchPosts = async (query: string) => {
  const searchTerms = await getSearchTermsFromAI(query);

  if (!searchTerms.length) {
    return [];
  }

  const searchRegex = new RegExp(searchTerms.join("|"), "i");

  const posts = await Post.find({
    $or: [{ text: searchRegex }, { "author.username": searchRegex }],
  }).populate("author", "username profileImage");

  return posts;
};
