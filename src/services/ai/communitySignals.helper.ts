import Post from "../../models/post.model";
import Comment from "../../models/comment.model";

export type CommunitySignalSummary = {
  topGenres: string[];
  topTitles: string[];
  sampleSnippets: string[];
  generatedAt: number;
};

type CommunitySignalCache = {
  summary: CommunitySignalSummary;
  createdAt: number;
};

type CommunitySignalContext = {
  ttlMs: number;
  maybeReloadCatalog: () => void;
  detectGenres: (text: string) => string[];
  detectTitles: (text: string) => string[];
};

let communitySignalsCache: CommunitySignalCache | null = null;

export const getCommunitySignalSummary = async (
  context: CommunitySignalContext
): Promise<CommunitySignalSummary> => {
  context.maybeReloadCatalog();

  if (
    communitySignalsCache &&
    Date.now() - communitySignalsCache.createdAt <= context.ttlMs
  ) {
    return communitySignalsCache.summary;
  }

  const [recentPosts, recentComments] = await Promise.all([
    Post.find({})
      .sort({ createdAt: -1 })
      .limit(140)
      .select("text likes")
      .lean(),
    Comment.find({})
      .sort({ createdAt: -1 })
      .limit(140)
      .select("text")
      .lean(),
  ]);

  const weightedCommunityText: string[] = [];
  recentPosts.forEach((post) => {
    const text = String(post?.text || "").trim();
    if (!text) {
      return;
    }

    const likeCount = Array.isArray(post?.likes) ? post.likes.length : 0;
    const weight = Math.min(4, 1 + Math.floor(likeCount / 4));
    for (let i = 0; i < weight; i += 1) {
      weightedCommunityText.push(text.toLowerCase());
    }
  });

  recentComments.forEach((comment) => {
    const text = String(comment?.text || "").trim();
    if (text) {
      weightedCommunityText.push(text.toLowerCase());
    }
  });

  const genreScores = new Map<string, number>();
  const titleScores = new Map<string, number>();

  weightedCommunityText.forEach((snippet) => {
    context.detectGenres(snippet).forEach((genre) => {
      genreScores.set(genre, (genreScores.get(genre) || 0) + 1);
    });

    context.detectTitles(snippet).forEach((title) => {
      titleScores.set(title, (titleScores.get(title) || 0) + 1);
    });
  });

  const topGenres = Array.from(genreScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([genre]) => genre);
  const topTitles = Array.from(titleScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([title]) => title);
  const sampleSnippets = weightedCommunityText.slice(0, 12);

  const summary: CommunitySignalSummary = {
    topGenres,
    topTitles,
    sampleSnippets,
    generatedAt: Date.now(),
  };

  communitySignalsCache = {
    summary,
    createdAt: Date.now(),
  };

  return summary;
};
