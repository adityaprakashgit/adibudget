import { saveTransaction } from "./api.js";

const banks = ["ICICI", "IDFC", "Canara"];
const cards = ["HDFC Card", "Axis Card"];

let currentMode = "";
let emotional = false;

init();

function init() {
    renderQuickModes();
    renderForm();
}

function renderQuickModes() {
    const container = document.getElementById("quickModes");

    container.innerHTML = `
        <button class="quick-mode" onclick="setMode('upi')">➕ Quick UPI</button>
        <button class="quick-mode" onclick="setMode('card')">💳 Quick Card</button>
        <button class="quick-mode" onclick="setMode('salary')">💼 Salary</button>
        <button class="quick-mode" onclick="setMode('transfer')">🔁 Transfer</button>
        <button class="quick-mode" onclick="setMode('card_payment')">🧾 Card Payment</button>
    `;

    window.setMode = setMode;
}

function renderForm() {
    const container = document.getElementById("transactionForm");

    container.innerHTML = `
        <input type="date" id="date">
        <input type="number" id="amount" placeholder="Amount">
        <div id="dynamicFields"></div>
        <button class="save-btn" onclick="handleSave()">Save Transaction</button>
    `;

    document.getElementById("date").valueAsDate = new Date();

    window.handleSave = handleSave;
}

function setMode(mode) {
    currentMode = mode;
    emotional = false;

    const dynamic = document.getElementById("dynamicFields");
    dynamic.innerHTML = "";

    if (mode === "upi") {
        dynamic.innerHTML = `
            ${renderSelect("source", banks)}
            ${renderUPIApp()}
            ${renderCategory()}
            ${renderEmotional()}
            ${renderReimbursement()}
            ${renderNotes()}
        `;
    }

    if (mode === "card") {
        dynamic.innerHTML = `
            ${renderSelect("source", cards)}
            ${renderCategory()}
            ${renderEmotional()}
            ${renderNotes()}
        `;
    }

    if (mode === "salary") {
        dynamic.innerHTML = `
            ${renderSelect("destination", banks)}
            ${renderCategory("Salary")}
            ${renderNotes()}
        `;
    }

    if (mode === "transfer") {
        dynamic.innerHTML = `
            ${renderSelect("source", banks)}
            ${renderSelect("destination", banks)}
        `;
    }

    if (mode === "card_payment") {
        dynamic.innerHTML = `
            ${renderSelect("source", banks)}
            ${renderSelect("destination", cards)}
        `;
    }
}

function renderSelect(id, options) {
    let html = `<select id="${id}"><option value="">Select ${id}</option>`;
    options.forEach(o => html += `<option>${o}</option>`);
    html += "</select>";
    return html;
}

function renderCategory(defaultValue = "") {
    return `
        <input type="text" id="category" placeholder="Category" value="${defaultValue}">
    `;
}

function renderUPIApp() {
    return `
        <select id="upi_app">
            <option value="">Select UPI App</option>
            <option>GPay</option>
            <option>PhonePe</option>
            <option>Paytm</option>
        </select>
    `;
}

function renderEmotional() {
    return `
        <button type="button" class="emotional-btn" onclick="toggleEmotional()">🔴 Emotional Spend</button>
    `;
}

function renderReimbursement() {
    return `
        <label>
            <input type="checkbox" id="reimbursement"> Reimbursement
        </label>
    `;
}

function renderNotes() {
    return `<textarea id="notes" placeholder="Notes"></textarea>`;
}

window.toggleEmotional = function () {
    emotional = !emotional;
    event.target.classList.toggle("emotional-active");
};

async function handleSave() {

    const data = {
        date: document.getElementById("date").value,
        amount: document.getElementById("amount").value,
        mode: currentMode,
        emotional,
        category: document.getElementById("category")?.value || "",
        upi_app: document.getElementById("upi_app")?.value || "",
        notes: document.getElementById("notes")?.value || ""
    };

    const response = await saveTransaction(data);

    if (response.success) {
        document.getElementById("status").innerHTML = "✅ Saved (Mock)";
    }
}
