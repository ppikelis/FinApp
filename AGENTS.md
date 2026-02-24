## Cursor Cloud specific instructions

### Overview

FinApp is a financial advisor application with a Node.js/Express backend (`server.js`, port 3000) that serves a static HTML/JS frontend from `public/` and exposes REST API endpoints. An optional Streamlit (Python) frontend is also available.

All AI features (analysis, advice, knowledge base) require a valid `OPENAI_API_KEY` environment variable. Without it, the OpenAI SDK will throw on instantiation, preventing the server from starting. Use `OPENAI_API_KEY=sk-placeholder` as a workaround to start the server for non-AI testing.

### Running services

- **Backend**: `OPENAI_API_KEY=<key> npm start` (or `node server.js`). Serves on port 3000.
- **Streamlit frontend** (optional): `~/.local/bin/streamlit run streamlit_app.py`. Serves on port 8501. Requires the backend to be running.
- Streamlit is installed to `~/.local/bin/` which may not be on `PATH` by default.

### Lint / Test / Build

- No linter, test framework, or build step is configured in this project.
- The `npm start` and `npm run dev` scripts both run `node server.js`.

### Gotchas

- The OpenAI SDK (v4) throws at construction time if `OPENAI_API_KEY` is empty/missing, even though the app code only logs a warning. Always set the env var before starting the server.
- There is no database; all data is in-memory or provided per-request.
- The knowledge base is loaded from `data/knowledge_base.json` and embedded on-demand via `POST /api/kb/init`.
