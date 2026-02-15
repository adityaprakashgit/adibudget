import { saveTransaction } from "./api.js";

let transactions = [];

let currentMode = "";
let emotional = false;
let banks = [];
let creditCards = [];

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
        <button onclick="showAccountsScreen()">⚙ Accounts</button>
    `;
    window.showTransactionScreen = showTransactionScreen;
    window.showLedgerScreen = showLedgerScreen;
    window.showAccountsScreen = showAccountsScreen;
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

function showAccountsScreen() {
    const main = document.getElementById("mainView");

    let html = `
        <h3>Banks</h3>
        <input type="text" id="bankName" placeholder="Bank Name">
        <input type="number" id="bankOpening" placeholder="Opening Balance">
        <button onclick="addBank()">Add Bank</button>
        <div id="bankList"></div>

        <h3 style="margin-top:30px;">Credit Cards</h3>
        <input type="text" id="cardName" placeholder="Card Name">
        <input type="number" id="cardLimit" placeholder="Credit Limit">
        <input type="number" id="cardOpening" placeholder="Opening Outstanding">
        <button onclick="addCard()">Add Card</button>
        <div id="cardList"></div>
    `;

    main.innerHTML = html;

    renderAccounts();
}

window.addBank = function() {
    const name = document.getElementById("bankName").value;
    const opening = parseFloat(document.getElementById("bankOpening").value) || 0;

    if (!name) return alert("Enter bank name.");

    banks.push({ name, opening });
    renderAccounts();
};

window.addCard = function() {
    const name = document.getElementById("cardName").value;
    const limit = parseFloat(document.getElementById("cardLimit").value) || 0;
    const opening = parseFloat(document.getElementById("cardOpening").value) || 0;

    if (!name) return alert("Enter card name.");

    creditCards.push({ name, limit, opening });
    renderAccounts();
};

function renderAccounts() {

    const bankList = document.getElementById("bankList");
    bankList.innerHTML = "";

    banks.forEach((b, index) => {
        bankList.innerHTML += `
            <div style="background:#222;padding:8px;margin-top:8px;border-radius:6px;">
                ${b.name} | Opening: ₹${b.opening}
                <button onclick="deleteBank(${index})">Delete</button>
            </div>
        `;
    });

    const cardList = document.getElementById("cardList");
    cardList.innerHTML = "";

    creditCards.forEach((c, index) => {
        cardList.innerHTML += `
            <div style="background:#222;padding:8px;margin-top:8px;border-radius:6px;">
                ${c.name} | Limit: ₹${c.limit} | Opening: ₹${c.opening}
                <button onclick="deleteCard(${index})">Delete</button>
            </div>
        `;
    });

    window.deleteBank = function(index) {
        banks.splice(index, 1);
        renderAccounts();
    };

    window.deleteCard = function(index) {
        creditCards.splice(index, 1);
        renderAccounts();
    };
}