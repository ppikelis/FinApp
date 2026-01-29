const path = require("path");
require("dotenv").config();
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.warn("Missing OPENAI_API_KEY in environment.");
}

const openai = new OpenAI({ apiKey: openaiApiKey });

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const categories = [
  "Housing",
  "Utilities",
  "Food",
  "Transport",
  "Debt",
  "Insurance",
  "Health",
  "Entertainment",
  "Shopping",
  "Education",
  "Travel",
  "Savings",
  "Income",
  "Other"
];

const systemInstructions = `
You are a financial analysis assistant.
Return only valid JSON without markdown.
Categories must be one of: ${categories.join(", ")}.
Use USD unless a currency is provided in the input.
`.trim();

const knowledgeBasePath = path.join(__dirname, "data", "knowledge_base.json");
let kbChunks = [];
let kbReady = false;
const kbTags = [
  { tag: "budgeting", keywords: ["budget", "budgeting", "cash flow"] },
  { tag: "emergency", keywords: ["emergency fund", "buffer"] },
  { tag: "debt", keywords: ["debt", "loan", "interest", "payoff"] },
  { tag: "investing", keywords: ["invest", "portfolio", "index fund", "allocation"] },
  { tag: "inflation", keywords: ["inflation", "interest rate", "rates"] },
  { tag: "goals", keywords: ["goal", "saving goal", "target"] }
];

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

function splitIntoParagraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitLongParagraph(text, maxChars) {
  if (text.length <= maxChars) {
    return [text];
  }
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = "";
  sentences.forEach((sentence) => {
    if ((current + " " + sentence).trim().length > maxChars) {
      if (current) {
        chunks.push(current.trim());
      }
      current = sentence;
    } else {
      current = `${current} ${sentence}`.trim();
    }
  });
  if (current) {
    chunks.push(current.trim());
  }
  return chunks;
}

function chunkText(text, maxChars = 800, overlapChars = 120) {
  const paragraphs = splitIntoParagraphs(text).flatMap((p) =>
    splitLongParagraph(p, maxChars)
  );
  const chunks = [];
  let current = "";
  paragraphs.forEach((para) => {
    if ((current + "\n\n" + para).trim().length > maxChars) {
      if (current) {
        chunks.push(current.trim());
      }
      current = para;
    } else {
      current = `${current}\n\n${para}`.trim();
    }
  });
  if (current) {
    chunks.push(current.trim());
  }

  if (overlapChars <= 0 || chunks.length <= 1) {
    return chunks;
  }

  const overlapped = [];
  chunks.forEach((chunk, index) => {
    if (index === 0) {
      overlapped.push(chunk);
      return;
    }
    const prev = chunks[index - 1];
    const overlap = prev.slice(-overlapChars);
    overlapped.push(`${overlap}\n\n${chunk}`.trim());
  });
  return overlapped;
}

function deriveTags(title, text) {
  const combined = `${title} ${text}`.toLowerCase();
  return kbTags
    .filter((rule) => rule.keywords.some((keyword) => combined.includes(keyword)))
    .map((rule) => rule.tag);
}

async function embedTexts(texts) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts
  });
  return response.data.map((item) => item.embedding);
}

async function buildKnowledgeBase() {
  const raw = fs.readFileSync(knowledgeBasePath, "utf8");
  const docs = JSON.parse(raw);
  const chunks = [];
  docs.forEach((doc) => {
    const docChunks = chunkText(doc.content);
    const tags = doc.tags && Array.isArray(doc.tags) ? doc.tags : deriveTags(doc.title, doc.content);
    docChunks.forEach((chunk, idx) => {
      chunks.push({
        id: `${doc.id}_${idx + 1}`,
        docId: doc.id,
        title: doc.title,
        tags,
        text: chunk
      });
    });
  });

  const embeddings = [];
  const batchSize = 40;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchEmbeddings = await embedTexts(batch.map((item) => item.text));
    batchEmbeddings.forEach((embedding, idx) => {
      embeddings.push({ embedding, index: i + idx });
    });
  }

  kbChunks = chunks.map((chunk, idx) => ({
    ...chunk,
    embedding: embeddings[idx].embedding
  }));
  kbReady = true;
  return { documents: docs.length, chunks: kbChunks.length };
}

function buildAnalysisPrompt(payload) {
  return `
Analyze the user's income and expenses.
Summarize totals by category and overall.
Provide 3 concise saving opportunities.

Input JSON:
${JSON.stringify(payload, null, 2)}

Return JSON with this schema:
{
  "incomeTotal": number,
  "expenseTotal": number,
  "netMonthly": number,
  "byCategory": [{"category": "string", "total": number}],
  "insights": ["string"]
}
`.trim();
}

function buildFreeformAnalysisPrompt(text) {
  return `
Extract the user's income and expenses from freeform text and analyze them.
Return JSON only.

Input:
${text}

Return JSON with this schema:
{
  "incomeTotal": number,
  "expenseTotal": number,
  "netMonthly": number,
  "byCategory": [{"category": "string", "total": number}],
  "insights": ["string"],
  "items": [{"description": "string", "amount": number, "type": "income|expense", "category": "string"}]
}
`.trim();
}

function buildAdvisorPrompt(payload) {
  return `
Provide investment insights from current market trends and savings strategies based on the user's profile.
Keep it high-level and avoid specific buy/sell advice.
Output JSON only.

Input JSON:
${JSON.stringify(payload, null, 2)}

Return JSON with this schema:
{
  "marketOverview": "string",
  "insights": ["string"],
  "goalStrategies": [{"goal": "string", "strategy": "string"}]
}

function buildQueryTranslationPrompt(query) {
  return `
Translate the query into English and extract any structured filters.
Return JSON only.

Input:
${query}

Return JSON with this schema:
{
  "language": "string",
  "translatedQuery": "string",
  "filters": {
    "docIds": ["string"],
    "tags": ["string"],
    "mustInclude": ["string"],
    "exclude": ["string"]
  }
}
`.trim();
}
`.trim();
}

app.post("/api/analyze", async (req, res) => {
  try {
    const payload = req.body;
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: systemInstructions },
        { role: "user", content: buildAnalysisPrompt(payload) }
      ]
    });
    const text = response.choices[0].message.content || "{}";
    res.json(JSON.parse(text));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to analyze data." });
  }
});

app.post("/api/analyze-freeform", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Missing text." });
    }
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemInstructions },
        { role: "user", content: buildFreeformAnalysisPrompt(text) }
      ]
    });
    const resultText = response.choices[0].message.content || "{}";
    res.json(JSON.parse(resultText));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to analyze freeform input." });
  }
});

app.post("/api/advise", async (req, res) => {
  try {
    const payload = req.body;
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: systemInstructions },
        { role: "user", content: buildAdvisorPrompt(payload) }
      ]
    });
    const text = response.choices[0].message.content || "{}";
    res.json(JSON.parse(text));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get advisor insights." });
  }
});

app.post("/api/upload-statement", upload.single("statement"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing PDF statement." });
    }
    const data = await pdfParse(req.file.buffer);
    const lines = data.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2000);

    const payload = {
      statementTextLines: lines
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemInstructions },
        {
          role: "user",
          content: `
Extract transactions from bank statement text and categorize them.
Return JSON only.

Input JSON:
${JSON.stringify(payload, null, 2)}

Return JSON with this schema:
{
  "currency": "string",
  "transactions": [
    {
      "date": "string",
      "description": "string",
      "amount": number,
      "type": "income|expense",
      "category": "string"
    }
  ]
}
`.trim()
        }
      ]
    });

    const text = response.choices[0].message.content || "{}";
    res.json(JSON.parse(text));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to parse statement." });
  }
});

app.get("/api/kb/status", (req, res) => {
  res.json({ ready: kbReady, chunks: kbChunks.length });
});

app.post("/api/kb/init", async (req, res) => {
  try {
    const result = await buildKnowledgeBase();
    res.json({ status: "ready", ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to build knowledge base." });
  }
});

app.post("/api/kb/search", async (req, res) => {
  try {
    if (!kbReady) {
      return res.status(400).json({ error: "Knowledge base not initialized." });
    }
    const { query, topK = 5 } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Missing query." });
    }

    const [queryEmbedding] = await embedTexts([query]);
    const scored = kbChunks.map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, Math.min(topK, scored.length)).map((item) => ({
      id: item.id,
      title: item.title,
      text: item.text,
      score: Number(item.score.toFixed(4))
    }));

    res.json({ results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to search knowledge base." });
  }
});

app.post("/api/kb/advanced", async (req, res) => {
  try {
    if (!kbReady) {
      return res.status(400).json({ error: "Knowledge base not initialized." });
    }
    const { query, topK = 5 } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Missing query." });
    }

    const translationResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Return only valid JSON without markdown." },
        { role: "user", content: buildQueryTranslationPrompt(query) }
      ]
    });

    const translationText = translationResponse.choices[0].message.content || "{}";
    const translation = JSON.parse(translationText);
    const translatedQuery = translation.translatedQuery || query;
    const filters = translation.filters || {};
    const docIds = Array.isArray(filters.docIds) ? filters.docIds : [];
    const tags = Array.isArray(filters.tags) ? filters.tags : [];
    const mustInclude = Array.isArray(filters.mustInclude) ? filters.mustInclude : [];
    const exclude = Array.isArray(filters.exclude) ? filters.exclude : [];

    const filteredChunks = kbChunks.filter((chunk) => {
      if (docIds.length > 0 && !docIds.includes(chunk.docId)) {
        return false;
      }
      if (tags.length > 0 && !tags.some((tag) => chunk.tags?.includes(tag))) {
        return false;
      }
      const textLower = chunk.text.toLowerCase();
      if (mustInclude.length > 0 && !mustInclude.every((term) => textLower.includes(term.toLowerCase()))) {
        return false;
      }
      if (exclude.length > 0 && exclude.some((term) => textLower.includes(term.toLowerCase()))) {
        return false;
      }
      return true;
    });

    const candidates = filteredChunks.length > 0 ? filteredChunks : kbChunks;
    const [queryEmbedding] = await embedTexts([translatedQuery]);
    const scored = candidates.map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, Math.min(topK, scored.length)).map((item) => ({
      id: item.id,
      title: item.title,
      tags: item.tags || [],
      text: item.text,
      score: Number(item.score.toFixed(4))
    }));

    res.json({
      query,
      translation: {
        language: translation.language || "unknown",
        translatedQuery,
        filters: { docIds, tags, mustInclude, exclude },
        usedFallback: filteredChunks.length === 0
      },
      results
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to run advanced retrieval." });
  }
});

app.listen(port, () => {
  console.log(`FinApp running on http://localhost:${port}`);
});
