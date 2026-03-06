// ============================
// DATA ENGINE
// ============================

const API_URL = "http://localhost:3000";

const state = {
  transactions: []
};

let accounts = [];

// ============================
// LOAD TRANSACTIONS
// ============================

async function loadTransactionsFromDB() {

  const res = await fetch(`${API_URL}/transactions`);
  const data = await res.json();

  state.transactions = data.map(tx => ({
    ...tx,
    amount: Number(tx.amount),
    date: new Date(tx.date),
    type: tx.type.toLowerCase()
  }));
}

// ============================
// LOAD ACCOUNTS
// ============================

async function loadAccounts() {

  const res = await fetch(`${API_URL}/accounts`);
  accounts = await res.json();

  const select = document.getElementById("accountSelect");
  if (!select) return;

  select.innerHTML = "";

  accounts.forEach(acc => {
    const option = document.createElement("option");
    option.value = acc.id;
    option.innerText = acc.name;
    select.appendChild(option);
  });
}

// ============================
// ADD TRANSACTION (REAL)
// ============================

async function addTransaction(type, amount, category, account_id) {

  amount = Number(amount);
  if (!amount || !account_id) return;

  await fetch(`${API_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      amount,
      category,
      account_id
    })
  });
}

// ============================
// DELETE TRANSACTION
// ============================

async function deleteTransaction(id) {

  await fetch(`${API_URL}/transactions/${id}`, {
    method: "DELETE"
  });
}

// ============================
// DASHBOARD RENDER
// ============================

function renderDashboardData() {

  const income = state.transactions
    .filter(tx => tx.type === "income")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const expenses = state.transactions
    .filter(tx => tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const net = income - expenses;

  const netEl = document.getElementById("netWorth");
  const burnEl = document.getElementById("burnRatio");

  if (netEl) netEl.innerText = "₹ " + net.toLocaleString();

  if (burnEl) {
    if (income > 0) {
      burnEl.innerText =
        Math.round((expenses / income) * 100) + "%";
    } else {
      burnEl.innerText = "0%";
    }
  }
}

// ============================
// TRANSACTIONS RENDER
// ============================

function renderTransactionsTable() {

  const tbody = document.querySelector(".table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  state.transactions.forEach(tx => {

    const tr = document.createElement("tr");
    const isIncome = tx.type === "income";

    tr.innerHTML = `
      <td>${tx.date.toLocaleDateString()}</td>
      <td>${tx.type}</td>
      <td>${tx.category}</td>
      <td class="${isIncome ? "amount-positive" : "amount-negative"}"
          style="text-align:right;">
        ${isIncome ? "+" : "-"} ₹ ${tx.amount}
      </td>
      <td>
        <button class="delete-btn" data-id="${tx.id}">
          Delete
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {

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
    });
  });
}

// ============================
// ACCOUNTS RENDER
// ============================

async function renderAccountsPage() {

  await loadAccounts();

  const container = document.getElementById("accountsGrid");
  if (!container) return;

  container.innerHTML = "";

  accounts.forEach(acc => {

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
          ₹ ${Math.abs(acc.balance).toLocaleString()}
        </div>
        <div class="sub">Outstanding</div>
        <div class="sub">${utilization}% utilized</div>
      `;

    } else {

      card.innerHTML = `
        <div class="label">${acc.name}</div>
        <div class="value">
          ₹ ${acc.balance.toLocaleString()}
        </div>
        <div class="sub">Available Balance</div>
      `;
    }

    container.appendChild(card);
  });
}
