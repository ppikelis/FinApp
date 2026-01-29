import json
import requests
import streamlit as st


API_BASE = "http://localhost:3000"


def api_post(path, payload=None, files=None):
    url = f"{API_BASE}{path}"
    if files:
        return requests.post(url, files=files, timeout=60)
    return requests.post(url, json=payload or {}, timeout=60)


def api_get(path):
    url = f"{API_BASE}{path}"
    return requests.get(url, timeout=30)


st.set_page_config(page_title="FinApp", layout="wide")

st.sidebar.title("FinApp")
page = st.sidebar.radio(
    "Pages",
    [
        "Dashboard",
        "Accounts",
        "Transactions",
        "Cash Flow",
        "Reports",
        "Budget",
        "Recurring",
        "Goals",
        "Investments",
        "Advice",
        "Knowledge Base",
    ],
)

st.title(page)

if page == "Dashboard":
    st.write("Welcome to FinApp. Use the sidebar to navigate.")

elif page == "Accounts":
    st.subheader("Upload and analyze account statements")
    statement = st.file_uploader("Bank statement PDF", type=["pdf"])
    if st.button("Upload & Analyze", type="primary"):
        if not statement:
            st.warning("Please select a PDF statement.")
        else:
            with st.spinner("Analyzing statement..."):
                response = api_post(
                    "/api/upload-statement",
                    files={"statement": (statement.name, statement.getvalue(), "application/pdf")},
                )
            if response.ok:
                data = response.json()
                transactions = data.get("transactions", [])
                income = sum(tx.get("amount", 0) for tx in transactions if tx.get("type") == "income")
                expenses = sum(tx.get("amount", 0) for tx in transactions if tx.get("type") == "expense")
                st.metric("Income", f"{income:,.2f} {data.get('currency', '')}".strip())
                st.metric("Expenses", f"{expenses:,.2f} {data.get('currency', '')}".strip())
                st.metric("Net", f"{income - expenses:,.2f} {data.get('currency', '')}".strip())
                st.bar_chart({"Income": income, "Expenses": expenses})
                st.json(data)
            else:
                st.error(response.json().get("error", "Failed to parse statement."))

    st.divider()
    st.subheader("Manual income & expense entry")
    st.write("Describe your income and expenses in plain language.")
    freeform = st.text_area(
        "Example: Salary 4500, rent 1200, groceries 350, gym 55, freelance 600",
        height=120,
    )
    if st.button("Analyze manual entry", type="primary"):
        if not freeform.strip():
            st.warning("Please enter a description of income and expenses.")
        else:
            with st.spinner("Analyzing..."):
                response = api_post("/api/analyze-freeform", {"text": freeform})
            if response.ok:
                st.json(response.json())
            else:
                st.error(response.json().get("error", "Analysis failed."))

elif page == "Budget":
    st.subheader("Income & Spending Analysis")
    income = st.number_input("Monthly Income", min_value=0.0, step=100.0)
    expenses_raw = st.text_area(
        "Expenses (JSON array)",
        value='[{"description":"Rent","amount":1200},{"description":"Groceries","amount":350}]',
        height=120,
    )
    if st.button("Analyze", type="primary"):
        try:
            expenses = json.loads(expenses_raw)
        except json.JSONDecodeError:
            st.error("Expenses JSON is invalid.")
            expenses = []
        with st.spinner("Analyzing..."):
            response = api_post("/api/analyze", {"income": income, "expenses": expenses})
        if response.ok:
            st.json(response.json())
        else:
            st.error(response.json().get("error", "Analysis failed."))

elif page == "Advice":
    st.subheader("Financial Advisor Bot")
    income = st.number_input("Monthly Income", min_value=0.0, step=100.0)
    expenses_raw = st.text_area(
        "Expenses (JSON array)",
        value='[{"description":"Rent","amount":1200},{"description":"Groceries","amount":350}]',
        height=120,
    )
    goals_raw = st.text_area(
        "Goals (JSON array)",
        value='[{"goal":"Car","target":12000,"timelineMonths":18}]',
        height=100,
    )
    if st.button("Get Advisor Insights", type="primary"):
        try:
            expenses = json.loads(expenses_raw)
            goals = json.loads(goals_raw)
        except json.JSONDecodeError:
            st.error("JSON input is invalid.")
            expenses = []
            goals = []
        with st.spinner("Generating insights..."):
            response = api_post("/api/advise", {"income": income, "expenses": expenses, "goals": goals})
        if response.ok:
            st.json(response.json())
        else:
            st.error(response.json().get("error", "Advisor failed."))

elif page == "Knowledge Base":
    st.subheader("Knowledge Base Search")
    if st.button("Initialize Knowledge Base"):
        with st.spinner("Building embeddings..."):
            response = api_post("/api/kb/init")
        if response.ok:
            st.success("Knowledge base ready.")
            st.json(response.json())
        else:
            st.error(response.json().get("error", "Failed to initialize."))

    query = st.text_input("Query", value="How big should my emergency fund be?")
    top_k = st.number_input("Top K", min_value=1, max_value=8, value=4)
    use_advanced = st.checkbox("Use advanced RAG", value=True)
    if st.button("Search", type="primary"):
        endpoint = "/api/kb/advanced" if use_advanced else "/api/kb/search"
        with st.spinner("Searching..."):
            response = api_post(endpoint, {"query": query, "topK": int(top_k)})
        if response.ok:
            st.json(response.json())
        else:
            st.error(response.json().get("error", "Search failed."))

else:
    st.write("This module is coming soon.")
