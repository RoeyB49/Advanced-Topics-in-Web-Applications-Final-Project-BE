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
		- `ai.source` (`external-ai` or `fallback`)
		- `posts` (matching review posts)

### Request Control / Cost Safety

To avoid exceeding external AI request limits, integration is protected by:

- Query-level cache (`AI_CACHE_TTL_MS`)
- Minimum interval between external calls (`AI_MIN_INTERVAL_MS`)
- Fallback local NLP-style extraction when external AI is disabled/unavailable

Environment flags:

- `AI_EXTERNAL_ENABLED` (`true`/`false`)
- `AI_API_URL` (external AI service base URL)
- `AI_MIN_INTERVAL_MS` (default: `1500`)
- `AI_CACHE_TTL_MS` (default: `300000`)
