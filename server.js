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
    docChunks.forEach((chunk, idx) => {
      chunks.push({
        id: `${doc.id}_${idx + 1}`,
        docId: doc.id,
        title: doc.title,
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

app.listen(port, () => {
  console.log(`FinApp running on http://localhost:${port}`);
});
