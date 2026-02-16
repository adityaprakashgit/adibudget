// ============================
// DATA ENGINE
// ============================

const API_URL = "http://localhost:3000";

const state = {
  transactions: []
};

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

async function addTransaction(type, amount, category) {

  await fetch(`${API_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      amount,
      category
    })
  });
}

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
      loadPage(window.currentPage);
    });
  });
}
