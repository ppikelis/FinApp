const analysisOutput = document.getElementById("analysis-output");
const transactionsOutput = document.getElementById("transactions-output");
const advisorOutput = document.getElementById("advisor-output");
const kbStatus = document.getElementById("kb-status");
const kbResults = document.getElementById("kb-results");
const goalsEmpty = document.getElementById("goals-empty");
const goalsBuilder = document.getElementById("goals-builder");
const goalsAddButton = document.getElementById("goals-add-btn");
const goalModal = document.getElementById("goal-modal");
const goalSaveButton = document.getElementById("goal-save");
const goalNameInput = document.getElementById("goal-name");
const goalTargetInput = document.getElementById("goal-target");
const goalTimelineInput = document.getElementById("goal-timeline");
const goalsTextarea = document.getElementById("goals");
const accountStatementInput = document.getElementById("account-statement");
const accountUploadButton = document.getElementById("account-upload");
const accountOutput = document.getElementById("account-output");
const accountIncome = document.getElementById("account-income");
const accountExpenses = document.getElementById("account-expenses");
const accountNet = document.getElementById("account-net");
const accountChart = document.getElementById("account-chart");

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function analyzeManual() {
  const incomeValue = Number(document.getElementById("income").value || 0);
  const expensesValue = document.getElementById("expenses").value.trim();
  const expenses = safeJsonParse(expensesValue, []);

  const payload = {
    income: incomeValue,
    expenses
  };

  analysisOutput.textContent = "Analyzing...";

  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  analysisOutput.textContent = JSON.stringify(data, null, 2);
}

async function analyzePdf() {
  const fileInput = document.getElementById("statement");
  const file = fileInput.files[0];
  if (!file) {
    transactionsOutput.textContent = "Please select a PDF statement.";
    return;
  }

  const formData = new FormData();
  formData.append("statement", file);

  transactionsOutput.textContent = "Uploading...";

  const response = await fetch("/api/upload-statement", {
    method: "POST",
    body: formData
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error || "Failed to analyze statement.";
    accountOutput.textContent = `Error: ${message}`;
    return;
  }
  transactionsOutput.textContent = JSON.stringify(data, null, 2);
}

function formatCurrency(value, currency = "USD") {
  if (!Number.isFinite(value)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(0);
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function drawAccountChart(income, expenses) {
  if (!accountChart) {
    return;
  }
  const ctx = accountChart.getContext("2d");
  const width = accountChart.width;
  const height = accountChart.height;
  ctx.clearRect(0, 0, width, height);

  const maxValue = Math.max(income, expenses, 1);
  const padding = 30;
  const barWidth = 80;
  const barGap = 60;
  const baseY = height - padding;

  const incomeHeight = ((height - padding * 2) * income) / maxValue;
  const expenseHeight = ((height - padding * 2) * expenses) / maxValue;

  ctx.fillStyle = "#f1c7b7";
  ctx.fillRect(padding, baseY - incomeHeight, barWidth, incomeHeight);
  ctx.fillStyle = "#cf5d4b";
  ctx.fillRect(padding + barWidth + barGap, baseY - expenseHeight, barWidth, expenseHeight);

  ctx.fillStyle = "#6f665a";
  ctx.font = "12px Segoe UI";
  ctx.fillText("Income", padding, baseY + 16);
  ctx.fillText("Expenses", padding + barWidth + barGap, baseY + 16);
}

async function analyzeAccountStatement() {
  const file = accountStatementInput.files[0];
  if (!file) {
    accountOutput.textContent = "Please select a PDF statement.";
    return;
  }

  const formData = new FormData();
  formData.append("statement", file);
  accountOutput.textContent = "Uploading and analyzing...";

  const response = await fetch("/api/upload-statement", {
    method: "POST",
    body: formData
  });

  const data = await response.json();
  const transactions = data.transactions || [];
  const currency = data.currency || "USD";

  let incomeTotal = 0;
  let expenseTotal = 0;
  transactions.forEach((tx) => {
    if (tx.type === "income") {
      incomeTotal += Number(tx.amount || 0);
    } else {
      expenseTotal += Number(tx.amount || 0);
    }
  });

  accountIncome.textContent = formatCurrency(incomeTotal, currency);
  accountExpenses.textContent = formatCurrency(expenseTotal, currency);
  accountNet.textContent = formatCurrency(incomeTotal - expenseTotal, currency);
  drawAccountChart(incomeTotal, expenseTotal);

  accountOutput.textContent = JSON.stringify(data, null, 2);
}

async function getAdvisorInsights() {
  const incomeValue = Number(document.getElementById("income").value || 0);
  const expensesValue = document.getElementById("expenses").value.trim();
  const goalsValue = document.getElementById("goals").value.trim();

  const expenses = safeJsonParse(expensesValue, []);
  const goals = safeJsonParse(goalsValue, []);

  const payload = {
    income: incomeValue,
    expenses,
    goals
  };

  advisorOutput.textContent = "Working on advisor insights...";

  const response = await fetch("/api/advise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  advisorOutput.textContent = JSON.stringify(data, null, 2);
}

async function initKnowledgeBase() {
  kbStatus.textContent = "Building knowledge base...";
  const response = await fetch("/api/kb/init", {
    method: "POST"
  });
  const data = await response.json();
  kbStatus.textContent = JSON.stringify(data, null, 2);
}

async function searchKnowledgeBase() {
  const query = document.getElementById("kb-query").value.trim();
  const topK = Number(document.getElementById("kb-topk").value || 4);
  const useAdvanced = document.getElementById("kb-advanced")?.checked;
  if (!query) {
    kbResults.textContent = "Please enter a query.";
    return;
  }

  kbResults.textContent = "Searching...";
  const endpoint = useAdvanced ? "/api/kb/advanced" : "/api/kb/search";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, topK })
  });
  const data = await response.json();
  kbResults.textContent = JSON.stringify(data, null, 2);
}

const analyzeManualButton = document.getElementById("analyze-manual");
const analyzePdfButton = document.getElementById("analyze-pdf");
const advisorButton = document.getElementById("advisor-btn");
const kbInitButton = document.getElementById("kb-init");
const kbSearchButton = document.getElementById("kb-search");

if (analyzeManualButton) {
  analyzeManualButton.addEventListener("click", () => {
    analyzeManual().catch((error) => {
      analysisOutput.textContent = `Error: ${error.message}`;
    });
  });
}

if (analyzePdfButton) {
  analyzePdfButton.addEventListener("click", () => {
    analyzePdf().catch((error) => {
      transactionsOutput.textContent = `Error: ${error.message}`;
    });
  });
}

if (advisorButton) {
  advisorButton.addEventListener("click", () => {
    getAdvisorInsights().catch((error) => {
      advisorOutput.textContent = `Error: ${error.message}`;
    });
  });
}

if (kbInitButton) {
  kbInitButton.addEventListener("click", () => {
    initKnowledgeBase().catch((error) => {
      kbStatus.textContent = `Error: ${error.message}`;
    });
  });
}

if (kbSearchButton) {
  kbSearchButton.addEventListener("click", () => {
    searchKnowledgeBase().catch((error) => {
      kbResults.textContent = `Error: ${error.message}`;
    });
  });
}

if (goalsAddButton) {
  goalsAddButton.addEventListener("click", () => {
    goalModal.classList.remove("hidden");
  });
}

if (goalModal) {
  goalModal.addEventListener("click", (event) => {
    const shouldClose = event.target?.dataset?.close === "true";
    if (shouldClose) {
      goalModal.classList.add("hidden");
    }
  });
}

if (goalSaveButton) {
  goalSaveButton.addEventListener("click", () => {
    const goalName = goalNameInput.value.trim();
    const target = Number(goalTargetInput.value || 0);
    const timelineMonths = Number(goalTimelineInput.value || 0);
    if (!goalName) {
      goalNameInput.focus();
      return;
    }

    const existing = safeJsonParse(goalsTextarea.value.trim(), []);
    const updated = [
      ...existing,
      {
        goal: goalName,
        target,
        timelineMonths
      }
    ];
    goalsTextarea.value = JSON.stringify(updated, null, 2);

    goalsEmpty.classList.add("hidden");
    goalsBuilder.classList.remove("hidden");
    goalModal.classList.add("hidden");

    goalNameInput.value = "";
    goalTargetInput.value = "";
    goalTimelineInput.value = "";
  });
}

if (accountUploadButton) {
  accountUploadButton.addEventListener("click", () => {
    analyzeAccountStatement().catch((error) => {
      accountOutput.textContent = `Error: ${error.message}`;
    });
  });
}
