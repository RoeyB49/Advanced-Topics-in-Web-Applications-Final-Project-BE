import axios from "axios";
import Post from "../models/post.model";

const AI_API_URL = process.env.AI_API_URL || "http://localhost:5000/api";

/**
 * Analyzes a search query with an external AI service to get search terms.
 * @param query The user's natural language query.
 * @returns A list of keywords to search for.
 */
const getSearchTermsFromAI = async (query: string): Promise<string[]> => {
  try {
    // This is a mock implementation.
    // In a real scenario, you would make a request to your AI service.
    // const response = await axios.post(`${AI_API_URL}/analyze-query`, { query });
    // return response.data.keywords;

    // For now, we'll just split the query into words.
    return query.split(" ");
  } catch (error) {
    console.error("Error contacting AI service:", error);
    // Fallback to simple word splitting
    return query.split(" ");
  }
};

/**
 * Searches posts based on a natural language query.
 * @param query The user's natural language query.
 * @returns A list of posts that match the query.
 */
export const searchPosts = async (query: string) => {
  const searchTerms = await getSearchTermsFromAI(query);

  const searchRegex = new RegExp(searchTerms.join("|"), "i");

  const posts = await Post.find({
    $or: [{ text: searchRegex }, { "author.username": searchRegex }],
  }).populate("author", "username profileImage");

  return posts;
};
