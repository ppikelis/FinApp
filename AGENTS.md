# AGENTS.md

## Cursor Cloud specific instructions

### Overview

FinApp is a single-product financial advisor web app with two frontends and one backend. See `README.md` for setup and run commands.

### Services

| Service | Command | Port | Required |
|---|---|---|---|
| Node.js backend (Express) | `OPENAI_API_KEY=<key> npm start` | 3000 | Yes |
| Streamlit UI (Python) | `streamlit run streamlit_app.py --server.headless true` | 8501 | Optional |

### Important notes

- **OPENAI_API_KEY is required at startup.** The OpenAI SDK throws if the key is missing or empty. To start the server without a real key (e.g. for frontend-only work), set a placeholder: `OPENAI_API_KEY=sk-placeholder npm start`. API endpoints that call OpenAI will return 500 errors, but the Express server will run and serve the static frontend.
- **No database.** All state is in-memory or loaded from `data/knowledge_base.json`. No migrations or seeds needed.
- **No lint/test tooling configured.** The project has no ESLint config, no test framework, and no CI pipeline. The only `scripts` in `package.json` are `start` and `dev` (both run `node server.js`).
- **Streamlit binary path.** After `pip install -r requirements.txt`, the `streamlit` binary is installed to `~/.local/bin`. Ensure this directory is on `PATH` before running: `export PATH="$HOME/.local/bin:$PATH"`.
