# FinApp

Financial Advisor app that analyzes income/spending, assigns categories, supports saving goals, and provides market insights via ChatGPT API.

## Setup

1. Install dependencies
   - `npm install`
   - `pip install -r requirements.txt`
2. Set environment variable
   - `set OPENAI_API_KEY=your_key_here` (PowerShell: `$env:OPENAI_API_KEY="your_key_here"`)
3. Start the app
   - `npm start`
   - `streamlit run streamlit_app.py`

Open `http://localhost:3000` in your browser.
Open `http://localhost:8501` for the Streamlit UI.

## Streamlit Cloud

If you deploy Streamlit separately, set `FINAPP_API_BASE` to your backend URL
(for example, `https://your-backend.example.com`). Otherwise the app will try
to connect to `http://localhost:3000`.

## Notes

- Uploading a bank statement PDF uses `pdf-parse` and ChatGPT for transaction extraction.
- The API expects JSON arrays for manual expenses and goals.
- Knowledge base search uses embeddings with chunking and similarity scoring.
  - Initialize via UI or `POST /api/kb/init`, then query via `POST /api/kb/search`.
- Advanced RAG adds query translation and structured retrieval via `POST /api/kb/advanced`.
