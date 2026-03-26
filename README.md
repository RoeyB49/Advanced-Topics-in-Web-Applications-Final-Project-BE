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

- `AI_EXTERNAL_ENABLED` (`true`/`false`) - enables Gemini calls.
- `GEMINI_API_KEY` - Gemini API key.
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
- Gemini usage percentage
- fallback reason counters
- recommendation repetition rate
- catalog size and last successful catalog load time
