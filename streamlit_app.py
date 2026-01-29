import json
import os
import requests
import streamlit as st


API_BASE = os.getenv("FINAPP_API_BASE", "http://localhost:3000")


def api_post(path, payload=None, files=None):
    url = f"{API_BASE}{path}"
    if files:
        return requests.post(url, files=files, timeout=60)
    return requests.post(url, json=payload or {}, timeout=60)


def api_get(path):
    url = f"{API_BASE}{path}"
    return requests.get(url, timeout=30)


st.set_page_config(page_title="FinApp", layout="wide")

with st.sidebar:
    st.caption("Backend API")
    st.code(API_BASE)
    if st.button("Test API connection"):
        try:
            response = api_get("/api/kb/status")
            if response.ok:
                st.success("API reachable.")
            else:
                st.error(response.json().get("error", "API error."))
        except requests.RequestException as exc:
            st.error(f"API connection failed: {exc}")

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

INCOME_CATEGORIES = [
    "Salary / Wages",
    "Business / Freelance Income",
    "Bonuses & Commissions",
    "Investment Income (dividends, interest)",
    "Rental Income",
    "Pensions",
    "Government Benefits (tax refund, child benefit, unemployment)",
    "Gifts Received",
    "Refunds / Reimbursements",
    "Other Income",
]

EXPENSE_CATEGORIES = [
    "Housing - Rent / Mortgage",
    "Housing - Property Taxes",
    "Housing - Home Insurance",
    "Housing - Maintenance & Repairs",
    "Housing - HOA / Condo Fees",
    "Utilities - Electricity",
    "Utilities - Water",
    "Utilities - Gas",
    "Utilities - Internet",
    "Utilities - Mobile Phone",
    "Utilities - TV / Streaming",
    "Food - Groceries",
    "Food - Restaurants / Dining Out",
    "Food - Coffee / Snacks",
    "Food - Food Delivery",
    "Transportation - Fuel",
    "Transportation - Public Transport",
    "Transportation - Taxi / Ride Share",
    "Transportation - Car Payment",
    "Transportation - Car Insurance",
    "Transportation - Parking",
    "Transportation - Vehicle Maintenance",
    "Shopping & Personal - Clothing",
    "Shopping & Personal - Shoes",
    "Shopping & Personal - Electronics",
    "Shopping & Personal - Personal Care",
    "Shopping & Personal - Household Items",
    "Health - Health Insurance",
    "Health - Doctor / Dentist",
    "Health - Pharmacy / Medication",
    "Health - Fitness / Gym",
    "Entertainment & Lifestyle - Streaming Services",
    "Entertainment & Lifestyle - Hobbies",
    "Entertainment & Lifestyle - Events / Movies",
    "Entertainment & Lifestyle - Games",
    "Entertainment & Lifestyle - Subscriptions (non-utility)",
    "Travel - Flights",
    "Travel - Hotels",
    "Travel - Car Rental",
    "Travel - Travel Insurance",
    "Travel - Vacation Activities",
    "Financial - Bank Fees",
    "Financial - Credit Card Fees",
    "Financial - Loan Payments",
    "Financial - Interest Charges",
    "Financial - Taxes (income, local)",
    "Family & Education - Childcare",
    "Family & Education - School / Tuition",
    "Family & Education - Books & Courses",
    "Family & Education - Allowances",
    "Gifts & Donations - Gifts Given",
    "Gifts & Donations - Charity / Donations",
    "Miscellaneous - Cash Withdrawals",
    "Miscellaneous - Transfers",
    "Miscellaneous - Uncategorized",
    "Miscellaneous - Other Expenses",
]


def init_manual_entries():
    if "income_entries" not in st.session_state:
        st.session_state.income_entries = [{}]
    if "expense_entries" not in st.session_state:
        st.session_state.expense_entries = [{}]


def build_entry_text(entry, currency):
    description = entry.get("description", "").strip()
    amount = entry.get("amount", 0) or 0
    category = entry.get("category", "").strip()
    return f"{description} {amount} {currency} ({category})"


elif page == "Accounts":
    st.subheader("Upload and analyze account statements")
    statement = st.file_uploader("Bank statement PDF", type=["pdf"])
    if st.button("Upload & Analyze", type="primary"):
        if not statement:
            st.warning("Please select a PDF statement.")
        else:
            with st.spinner("Analyzing statement..."):
                try:
                    response = api_post(
                        "/api/upload-statement",
                        files={"statement": (statement.name, statement.getvalue(), "application/pdf")},
                    )
                except requests.RequestException as exc:
                    st.error(f"API connection failed: {exc}")
                    response = None
            if response and response.ok:
                data = response.json()
                transactions = data.get("transactions", [])
                income = sum(tx.get("amount", 0) for tx in transactions if tx.get("type") == "income")
                expenses = sum(tx.get("amount", 0) for tx in transactions if tx.get("type") == "expense")
                st.metric("Income", f"{income:,.2f} {data.get('currency', '')}".strip())
                st.metric("Expenses", f"{expenses:,.2f} {data.get('currency', '')}".strip())
                st.metric("Net", f"{income - expenses:,.2f} {data.get('currency', '')}".strip())
                st.bar_chart({"Income": income, "Expenses": expenses})
                st.json(data)
            elif response:
                st.error(response.json().get("error", "Failed to parse statement."))

    st.divider()
    st.subheader("Manual income & expense entry")
    st.write("Add items with local currency and categories.")
    init_manual_entries()

    currency = st.selectbox(
        "Currency",
        ["USD", "EUR", "CHF", "GBP", "CAD", "AUD", "JPY", "SEK", "NOK", "DKK", "PLN"],
        index=2,
    )

    col_add_income, col_add_expense, col_clear = st.columns(3)
    with col_add_income:
        if st.button("Add income item"):
            st.session_state.income_entries.append({})
    with col_add_expense:
        if st.button("Add expense item"):
            st.session_state.expense_entries.append({})
    with col_clear:
        if st.button("Clear all"):
            st.session_state.income_entries = [{}]
            st.session_state.expense_entries = [{}]

    st.markdown("### Income")
    income_entries = []
    for idx, entry in enumerate(st.session_state.income_entries):
        expanded = idx == 0
        with st.expander(f"Income item {idx + 1}", expanded=expanded):
            category = st.selectbox(
                "Category",
                INCOME_CATEGORIES,
                key=f"income_category_{idx}",
            )
            description = st.text_input("Description", key=f"income_desc_{idx}")
            amount = st.number_input(
                "Amount",
                min_value=0.0,
                step=10.0,
                key=f"income_amount_{idx}",
            )
            income_entries.append(
                {"category": category, "description": description, "amount": amount}
            )

    st.markdown("### Expenses")
    expense_entries = []
    for idx, entry in enumerate(st.session_state.expense_entries):
        expanded = idx == 0
        with st.expander(f"Expense item {idx + 1}", expanded=expanded):
            category = st.selectbox(
                "Category",
                EXPENSE_CATEGORIES,
                key=f"expense_category_{idx}",
            )
            description = st.text_input("Description", key=f"expense_desc_{idx}")
            amount = st.number_input(
                "Amount",
                min_value=0.0,
                step=10.0,
                key=f"expense_amount_{idx}",
            )
            expense_entries.append(
                {"category": category, "description": description, "amount": amount}
            )

    if st.button("Analyze manual entry", type="primary"):
        income_lines = [
            f"Income: {build_entry_text(entry, currency)}"
            for entry in income_entries
            if entry.get("amount", 0) > 0
        ]
        expense_lines = [
            f"Expense: {build_entry_text(entry, currency)}"
            for entry in expense_entries
            if entry.get("amount", 0) > 0
        ]
        freeform = "\n".join(income_lines + expense_lines)
        if not freeform.strip():
            st.warning("Please add at least one income or expense with an amount.")
        else:
            with st.spinner("Analyzing..."):
                try:
                    response = api_post("/api/analyze-freeform", {"text": freeform})
                except requests.RequestException as exc:
                    st.error(f"API connection failed: {exc}")
                    response = None
            if response and response.ok:
                st.json(response.json())
            elif response:
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
            try:
                response = api_post("/api/analyze", {"income": income, "expenses": expenses})
            except requests.RequestException as exc:
                st.error(f"API connection failed: {exc}")
                response = None
        if response and response.ok:
            st.json(response.json())
        elif response:
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
            try:
                response = api_post("/api/advise", {"income": income, "expenses": expenses, "goals": goals})
            except requests.RequestException as exc:
                st.error(f"API connection failed: {exc}")
                response = None
        if response and response.ok:
            st.json(response.json())
        elif response:
            st.error(response.json().get("error", "Advisor failed."))

elif page == "Knowledge Base":
    st.subheader("Knowledge Base Search")
    if st.button("Initialize Knowledge Base"):
        with st.spinner("Building embeddings..."):
            try:
                response = api_post("/api/kb/init")
            except requests.RequestException as exc:
                st.error(f"API connection failed: {exc}")
                response = None
        if response and response.ok:
            st.success("Knowledge base ready.")
            st.json(response.json())
        elif response:
            st.error(response.json().get("error", "Failed to initialize."))

    query = st.text_input("Query", value="How big should my emergency fund be?")
    top_k = st.number_input("Top K", min_value=1, max_value=8, value=4)
    use_advanced = st.checkbox("Use advanced RAG", value=True)
    if st.button("Search", type="primary"):
        endpoint = "/api/kb/advanced" if use_advanced else "/api/kb/search"
        with st.spinner("Searching..."):
            try:
                response = api_post(endpoint, {"query": query, "topK": int(top_k)})
            except requests.RequestException as exc:
                st.error(f"API connection failed: {exc}")
                response = None
        if response and response.ok:
            st.json(response.json())
        elif response:
            st.error(response.json().get("error", "Search failed."))

else:
    st.write("This module is coming soon.")
