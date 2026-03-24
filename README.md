Advanced-Topics-in-Web-Applications-Final-Project-BE

## AI Integration (Anime Reviews)

The backend includes anime-focused AI query analysis for review discovery.

### Endpoints

- `GET /api/posts/search?q=<query>`
  - Natural language search for posts.
  - Returns matching posts array.

- `GET /api/posts/search/intelligent?q=<query>`
  - Anime-aware intelligent search.
  - Returns:
    - `ai.intent` (`recommendation`, `comparison`, `analysis`, `general-search`)
    - `ai.sentimentHint` (`positive`, `negative`, `mixed`, `neutral`)
    - `ai.detectedAnimeTitles`
    - `ai.detectedGenres`
    - `ai.keywords`
    - `ai.source` (`gemini` or `fallback`)
    - `posts` (matching review posts)

- `POST /api/ai/recommendations/chat`
  - Authenticated AI chat for personalized anime recommendations.
  - Input supports:
    - `message` (required)
    - `watchedAnimes` (optional string[])
    - `preferences` (optional string[])
    - `history` (optional chat history entries)
  - Returns:
    - `source` (`gemini` or `fallback`)
    - `reply` (assistant message)
    - `recommendations[]` (title, reason, genres, mood, confidence)
    - `extractedPreferences`
    - `basedOn` (watchedCount, preferenceCount, userSignalCount)

### AI Provider

The backend is wired directly to **Google Gemini** for query analysis when external AI is enabled.

### Request Control / Cost Safety

To avoid exceeding external AI request limits, integration is protected by:

- Query-level cache (`AI_CACHE_TTL_MS`)
- Minimum interval between external calls (`AI_MIN_INTERVAL_MS`)
- Chat-level cache (`AI_CHAT_CACHE_TTL_MS`)
- Per-user minimum interval for chat calls (`AI_CHAT_MIN_INTERVAL_MS`)
- Fallback local NLP-style extraction when external AI is disabled/unavailable

Environment flags:

- `AI_EXTERNAL_ENABLED` (`true`/`false`)
- `GEMINI_API_KEY` (required when `AI_EXTERNAL_ENABLED=true`)
- `GEMINI_MODEL` (optional, default: `gemini-1.5-flash`)
- `AI_MIN_INTERVAL_MS` (default: `1500`)
- `AI_CACHE_TTL_MS` (default: `300000`)
- `AI_CHAT_MIN_INTERVAL_MS` (defaults to `AI_MIN_INTERVAL_MS`)
- `AI_CHAT_CACHE_TTL_MS` (defaults to `AI_CACHE_TTL_MS`)
