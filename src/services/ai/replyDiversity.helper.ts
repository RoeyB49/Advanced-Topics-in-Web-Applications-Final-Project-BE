export type FallbackReason =
  | "external-disabled"
  | "missing-api-key"
  | "chat-rate-limited"
  | "gemini-error";

export type AnimeRecommendationLite = {
  title: string;
  genres: string[];
};

export type ChatRecommendationResponseShape = {
  reply: string;
  recommendations: AnimeRecommendationLite[];
  debug?: {
    fallbackReason?: FallbackReason;
  };
};

type ReplyRound = {
  replyHash: number;
  createdAt: number;
};

type FinalizeChatResponseContext<T extends ChatRecommendationResponseShape> = {
  userId: string;
  response: T;
  responseSeed: string;
  replyHistoryTtlMs: number;
  replyHistoryMaxItems: number;
  recordChatOutcomeMetrics: (userId: string, response: T) => void;
  normalizeQuery: (value: string) => string;
  normalizeList: (items: string[]) => string[];
  hashString: (value: string) => number;
};

const replyHistoryByUser = new Map<string, ReplyRound[]>();

const pruneOldReplyHistory = (
  replyHistoryTtlMs: number,
  replyHistoryMaxItems: number
) => {
  const now = Date.now();
  Array.from(replyHistoryByUser.entries()).forEach(([userId, rounds]) => {
    const freshRounds = rounds.filter((round) => now - round.createdAt <= replyHistoryTtlMs);
    if (freshRounds.length === 0) {
      replyHistoryByUser.delete(userId);
      return;
    }

    replyHistoryByUser.set(userId, freshRounds.slice(-replyHistoryMaxItems));
  });
};

const rememberReplyForUser = (
  userId: string,
  reply: string,
  replyHistoryTtlMs: number,
  replyHistoryMaxItems: number,
  hashString: (value: string) => number,
  normalizeQuery: (value: string) => string
) => {
  pruneOldReplyHistory(replyHistoryTtlMs, replyHistoryMaxItems);
  const rounds = replyHistoryByUser.get(userId) || [];
  const next = [...rounds, { replyHash: hashString(normalizeQuery(reply)), createdAt: Date.now() }]
    .slice(-replyHistoryMaxItems);
  replyHistoryByUser.set(userId, next);
};

const wasReplyRecentlyUsed = (
  userId: string,
  reply: string,
  replyHistoryTtlMs: number,
  replyHistoryMaxItems: number,
  hashString: (value: string) => number,
  normalizeQuery: (value: string) => string
): boolean => {
  pruneOldReplyHistory(replyHistoryTtlMs, replyHistoryMaxItems);
  const rounds = replyHistoryByUser.get(userId) || [];
  const replyHash = hashString(normalizeQuery(reply));
  return rounds.some((round) => round.replyHash === replyHash);
};

const rewriteReplyToAvoidRepetition = <T extends ChatRecommendationResponseShape>(
  response: T,
  seed: string,
  hashString: (value: string) => number,
  normalizeList: (items: string[]) => string[]
): T => {
  const topTitles = response.recommendations.map((item) => item.title).slice(0, 4);
  const topGenres = normalizeList(response.recommendations.flatMap((item) => item.genres)).slice(0, 4);
  const templateSeed = `${seed}:${topTitles.join("|")}:${topGenres.join("|")}`;

  if (topTitles.length === 0) {
    const emptyTemplates = [
      "Share one or two anime you loved or disliked lately and I will tune the next picks better.",
      "Give me a quick vibe check (genres, pace, dark vs light) and I will craft a sharper list.",
      "Tell me what you watched recently, and I will generate a different set of recommendations.",
    ];
    const index = hashString(templateSeed) % emptyTemplates.length;
    return {
      ...response,
      reply: emptyTemplates[index],
    };
  }

  const templates = [
    `Switching it up: try ${topTitles.join(", ")}. The overlap is mostly ${topGenres.join(", ")}.`,
    `Here is a different angle: ${topTitles.join(", ")}. They keep the ${topGenres.join(", ")} energy without repeating the same vibe.`,
    `New mix for you: ${topTitles.join(", ")}. These are stronger matches for ${topGenres.join(", ")} right now.`,
  ];

  const index = hashString(templateSeed) % templates.length;
  return {
    ...response,
    reply: templates[index],
  };
};

export const finalizeChatResponse = <T extends ChatRecommendationResponseShape>(
  context: FinalizeChatResponseContext<T>
): T => {
  const prepared = wasReplyRecentlyUsed(
    context.userId,
    context.response.reply,
    context.replyHistoryTtlMs,
    context.replyHistoryMaxItems,
    context.hashString,
    context.normalizeQuery
  )
    ? rewriteReplyToAvoidRepetition(
      context.response,
      context.responseSeed,
      context.hashString,
      context.normalizeList
    )
    : context.response;

  rememberReplyForUser(
    context.userId,
    prepared.reply,
    context.replyHistoryTtlMs,
    context.replyHistoryMaxItems,
    context.hashString,
    context.normalizeQuery
  );
  context.recordChatOutcomeMetrics(context.userId, prepared);
  return prepared;
};

export const shouldCacheChatResponse = (response: ChatRecommendationResponseShape): boolean => {
  return response.debug?.fallbackReason !== "gemini-error";
};

export const clearReplyDiversityHistory = () => {
  replyHistoryByUser.clear();
};
