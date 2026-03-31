# Advanced Topics in Web Applications – Final Project (BE)

Backend service for our final project.  
This repository contains the server-side API, business logic, authentication flow, and database integration used by the application.

## What we built

- A backend API for the project’s core features
- User authentication and authorization
- Data persistence and database modeling
- Input validation and error handling
- Structured project architecture for scalability and maintenance

## Tech stack

- Node.js
- Express
- [Your DB here]
- [Any additional tools/libraries you used]

## Project status

Core backend functionality is implemented and working.  
Additional polishing, documentation improvements, and UI/screenshots will be added later.

## Run locally

1. Clone the repo
2. Install dependencies
3. Create `.env` file
4. Start the server

Example:

```bash
npm install
npm run dev
```

## Notes

- Environment variables are required (`.env`)

## AI advisor configuration

The recommendation chat now supports a dedicated catalog data file plus runtime observability.

Useful environment variables:

- `AI_EXTERNAL_ENABLED` (`true`/`false`) - enables external AI calls.
- `AI_EXTERNAL_PROVIDER` - external provider name (`groq` or `gemini`). Default: `groq`.
- `GROQ_API_KEY` - Groq API key (used when provider is `groq`).
- `GROQ_MODEL` - Groq model name. Default: `llama-3.3-70b-versatile`.
- `GEMINI_API_KEY` - Gemini API key (used when provider is `gemini`).
- `GEMINI_MODEL` - Gemini model name. Default: `gemini-1.5-flash`.
- `AI_EXTERNAL_API_KEY` - optional shared key variable used when provider-specific key is not set.
- `AI_CHAT_MODEL` - optional legacy fallback model override for Gemini mode.
- `AI_CATALOG_PATH` - optional absolute/relative path to catalog JSON. Default loader checks:
  - `src/data/anime-catalog.json`
  - `dist/data/anime-catalog.json`
  - `../data/anime-catalog.json` relative to `ai.service` runtime folder
- Catalog hot-reload is mtime-based: changes are detected automatically when the file timestamp changes.
- `AI_QUERY_CACHE_MAX_ENTRIES` - max query cache entries (default: `400`).
- `AI_CHAT_CACHE_MAX_ENTRIES` - max chat cache entries (default: `400`).
- `AI_CHAT_CACHE_TTL_MS` - chat cache TTL in milliseconds.
- `AI_CHAT_VARIATION_WINDOW_MS` - diversity seed window for fallback variation (default: `120000`).
- `AI_METRICS_ROLLING_WINDOW_MS` - rolling metrics window in milliseconds (default: `900000` = 15 minutes).
- `AI_METRICS_ADMIN_USERS` - comma-separated admin identifiers (email/username/userId) allowed to reset metrics.
- `AI_METRICS_STRICT_ADMIN_MODE` (`true`/`false`) - when `true`, app startup fails if `AI_METRICS_ADMIN_USERS` is empty.

### AI observability endpoint

Authenticated endpoint:

- `GET /api/ai/recommendations/metrics`
- `POST /api/ai/recommendations/metrics/reset` (admin only)

Returns an in-memory snapshot with:

- total chat requests
- external provider usage percentage
- fallback reason counters
- recommendation repetition rate
- catalog size and last successful catalog load time
