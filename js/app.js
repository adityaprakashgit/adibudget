const API_URL = "";

const state = {
  transactions: [],
  budgets: []
};

let accounts = [];

async function requestJSON(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  const contentType = response.headers.get("content-type") || "";
  const hasJsonBody = contentType.includes("application/json");
  const payload = hasJsonBody ? await response.json() : null;

  if (!response.ok) {
    throw new Error(
      payload && payload.error
        ? payload.error
        : `Request failed with status ${response.status}`
    );
  }

  return payload;
}

function formatCurrency(amount) {
  return `₹ ${Number(amount || 0).toLocaleString()}`;
}

async function loadTransactionsFromDB() {
  const data = await requestJSON("/transactions");

  state.transactions = data.map((tx) => ({
    ...tx,
    amount: Number(tx.amount),
    date: new Date(tx.date),
    type: String(tx.type || "").toLowerCase()
  }));
}

async function loadAccounts() {
  accounts = await requestJSON("/accounts");

  const select = document.getElementById("accountSelect");
  if (!select) {
    return;
  }

  select.innerHTML = "";

  accounts.forEach((acc) => {
    const option = document.createElement("option");
    option.value = acc.id;
    option.innerText = acc.name;
    select.appendChild(option);
  });
}

async function loadBudgets() {
  state.budgets = await requestJSON("/budgets");
}

async function addTransaction(type, amount, category, account_id) {
  const payload = {
    type,
    amount: Number(amount),
    category,
    account_id
  };

  return requestJSON("/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function deleteTransaction(id) {
  return requestJSON(`/transactions/${id}`, {
    method: "DELETE"
  });
}

function renderDashboardData() {
  const income = state.transactions
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const expenses = state.transactions
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const net = accounts.reduce((sum, acc) => {
    const balance = Number(acc.balance || 0);
    return acc.type === "credit" ? sum - balance : sum + balance;
  }, 0);
  const liquidCash = accounts
    .filter((acc) => acc.type === "bank")
    .reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const runwayMonths = expenses > 0 ? liquidCash / expenses : 0;
  const burnRatio = income > 0 ? Math.round((expenses / income) * 100) : 0;
  const stabilityScore = Math.max(
    0,
    Math.min(100, Math.round(100 - burnRatio + Math.min(runwayMonths * 10, 40)))
  );

  const netEl = document.getElementById("netWorth");
  const liquidCashEl = document.getElementById("liquidCash");
  const runwayEl = document.getElementById("runway");
  const burnEl = document.getElementById("burnRatio");
  const stabilityEl = document.getElementById("stabilityScore");
  const stabilityFillEl = document.getElementById("stabilityFill");

  if (netEl) netEl.innerText = formatCurrency(net);
  if (liquidCashEl) liquidCashEl.innerText = formatCurrency(liquidCash);
  if (runwayEl) runwayEl.innerText = expenses > 0 ? runwayMonths.toFixed(1) : "∞";
  if (burnEl) burnEl.innerText = `${burnRatio}%`;
  if (stabilityEl) stabilityEl.innerText = `${stabilityScore}%`;
  if (stabilityFillEl) stabilityFillEl.style.width = `${stabilityScore}%`;
}

function renderTransactionsTable() {
  const tbody = document.querySelector(".table tbody");
  const countEl = document.getElementById("transactionCount");

  if (!tbody) {
    return;
  }

  tbody.innerHTML = "";

  if (countEl) {
    countEl.innerText = `${state.transactions.length} Records`;
  }

  state.transactions.forEach((tx) => {
    const tr = document.createElement("tr");
    const isIncome = tx.type === "income";

    tr.innerHTML = `
      <td>${tx.date.toLocaleDateString()}</td>
      <td>${tx.type}</td>
      <td>${tx.category || "Uncategorized"}</td>
      <td class="${isIncome ? "amount-positive" : "amount-negative"}"
          style="text-align:right;">
        ${isIncome ? "+" : "-"} ${formatCurrency(tx.amount)}
      </td>
      <td>
        <button class="delete-btn" data-id="${tx.id}">
          Delete
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await deleteTransaction(btn.dataset.id);
        await loadTransactionsFromDB();
        await loadAccounts();

        if (window.currentPage === "transactions") {
          renderTransactionsTable();
        }

        if (window.currentPage === "accounts") {
          renderAccountsPage();
        }

        if (window.currentPage === "dashboard") {
          renderDashboardData();
        }
      } catch (error) {
        window.alert(error.message);
      }
    });
  });
}

async function renderAccountsPage() {
  await loadAccounts();

  const container = document.getElementById("accountsGrid");
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!accounts.length) {
    container.innerHTML = `
      <div class="card">
        <div class="label">No accounts found</div>
        <div class="sub">Create asset or liability accounts in Firefly III.</div>
      </div>
    `;
    return;
  }

  accounts.forEach((acc) => {
    const card = document.createElement("div");
    card.className = "card lift-hover";

    if (acc.type === "credit") {
      const utilization =
        acc.credit_limit > 0
          ? ((Math.abs(acc.balance) / acc.credit_limit) * 100).toFixed(0)
          : 0;

      card.innerHTML = `
        <div class="label">${acc.name}</div>
        <div class="value negative">
          ${formatCurrency(Math.abs(acc.balance))}
        </div>
        <div class="sub">Outstanding</div>
        <div class="sub">${utilization}% utilized</div>
      `;
    } else {
      card.innerHTML = `
        <div class="label">${acc.name}</div>
        <div class="value">
          ${formatCurrency(acc.balance)}
        </div>
        <div class="sub">Available Balance</div>
      `;
    }

    container.appendChild(card);
  });
}

async function renderBudgetsPage() {
  await loadBudgets();

  const container = document.getElementById("budgetsGrid");
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!state.budgets.length) {
    container.innerHTML = `
      <div class="card">
        <div class="label">No budgets found</div>
        <div class="sub">Create budgets in Firefly III to track them here.</div>
      </div>
    `;
    return;
  }

  state.budgets.forEach((budget) => {
    const card = document.createElement("div");
    card.className = "card lift-hover";
    const remaining =
      budget.remaining === null || budget.remaining === undefined
        ? "Not available"
        : `${budget.currency} ${Number(budget.remaining).toLocaleString()}`;
    const spent = `${budget.currency} ${Number(budget.spent || 0).toLocaleString()}`;

    card.innerHTML = `
      <div class="label">${budget.name}</div>
      <div class="value">${remaining}</div>
      <div class="sub">Remaining</div>
      <div class="sub">Spent: ${spent}</div>
    `;

    container.appendChild(card);
  });
}
