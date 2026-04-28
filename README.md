# Advanced Topics in Web Applications – Final Project (BE)

Backend API for a social platform with AI-powered anime recommendations.

## Features

- **Authentication** – User signup, login, and JWT-based authorization
- **Posts & Comments** – Create, read, update posts and add comments
- **File Uploads** – Profile and post image uploads
- **AI Recommendations** – Groq-powered anime recommendations using community signals
- **Testing** – Full test coverage with Jest

## Tech Stack

- Node.js, TypeScript
- Express
- MongoDB
- Groq AI

## Get Started

```bash
npm install
npm run dev
```

**Note:** Create a `.env` file with required environment variables (see AI config section below)

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
