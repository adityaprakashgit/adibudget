import { saveTransaction } from "./api.js";

let transactions = [];

let currentMode = "";
let emotional = false;

init();

function init() {
    renderNavigation();
    showTransactionScreen();
}

function renderNavigation() {
    const nav = document.getElementById("navigation");
    nav.innerHTML = `
        <button onclick="showTransactionScreen()">➕ Add</button>
        <button onclick="showLedgerScreen()">📒 Ledger</button>
    `;
    window.showTransactionScreen = showTransactionScreen;
    window.showLedgerScreen = showLedgerScreen;
}

function showTransactionScreen() {
    const main = document.getElementById("mainView");
    main.innerHTML = `
        <h3>Quick Modes</h3>
        <button onclick="setMode('upi')">➕ Quick UPI</button>
        <button onclick="setMode('card')">💳 Quick Card</button>
        <button onclick="setMode('salary')">💼 Salary</button>
        <button onclick="setMode('transfer')">🔁 Transfer</button>
        <button onclick="setMode('card_payment')">🧾 Card Payment</button>

        <div id="transactionForm"></div>
    `;
    window.setMode = setMode;
}

function showLedgerScreen() {
    const main = document.getElementById("mainView");

    if (transactions.length === 0) {
        main.innerHTML = "<p>No transactions yet.</p>";
        return;
    }

    let html = "<h3>Ledger</h3>";

    transactions.slice().reverse().forEach((t, index) => {
        html += `
            <div style="background:#222;padding:10px;margin-top:10px;border-radius:8px;">
                <strong>₹${t.amount}</strong> - ${t.mode.toUpperCase()}<br>
                ${t.date}<br>
                ${t.category || ""}<br>
                ${t.emotional ? "🔴 Emotional<br>" : ""}
                ${t.reimbursement ? "🟡 Reimbursement<br>" : ""}
                <button onclick="deleteTransaction(${transactions.length - 1 - index})">Delete</button>
            </div>
        `;
    });

    main.innerHTML = html;

    window.deleteTransaction = deleteTransaction;
}

function setMode(mode) {
    currentMode = mode;
    emotional = false;

    const form = document.getElementById("transactionForm");

    form.innerHTML = `
        <input type="date" id="date">
        <input type="number" id="amount" placeholder="Amount">
        <input type="text" id="category" placeholder="Category">
        <label>
            <input type="checkbox" id="reimbursement"> Reimbursement
        </label>
        <button onclick="toggleEmotional()">🔴 Emotional</button>
        <button onclick="handleSave()">Save</button>
    `;

    document.getElementById("date").valueAsDate = new Date();

    window.toggleEmotional = toggleEmotional;
    window.handleSave = handleSave;
}

function toggleEmotional() {
    emotional = !emotional;
}

async function handleSave() {

    const data = {
        date: document.getElementById("date").value,
        amount: document.getElementById("amount").value,
        mode: currentMode,
        emotional,
        category: document.getElementById("category").value,
        reimbursement: document.getElementById("reimbursement").checked
    };

    transactions.push(data);

    document.getElementById("status").innerHTML = "✅ Transaction Saved (Local)";
}

function deleteTransaction(index) {
    transactions.splice(index, 1);
    showLedgerScreen();
}
