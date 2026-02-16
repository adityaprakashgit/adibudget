// ================= STATE =================

let state = {
    accounts: [],
    categories: [],
    transactions: [],
    selectedMonth: new Date().toISOString().substring(0,7)
};

let cashflowChartInstance = null;
let categoryChartInstance = null;

// ================= INIT =================

document.addEventListener("DOMContentLoaded", init);

function init() {

    loadState();
    seedDummyDataIfEmpty();

    document.getElementById("monthSelector").value = state.selectedMonth;

    document.getElementById("monthSelector")
        .addEventListener("change", e=>{
            state.selectedMonth = e.target.value;
            saveState();
            renderAll();
        });

    setupModal();
    renderAll();
}

// ================= LOCAL STORAGE =================

function saveState() {
    localStorage.setItem("financeApp", JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem("financeApp");
    if (saved) state = JSON.parse(saved);
}

// ================= DUMMY DATA =================

function seedDummyDataIfEmpty() {

    if (state.accounts.length === 0) {

        state.accounts = [
            { id:1, name:"HDFC Bank", type:"bank", opening:50000 },
            { id:2, name:"ICICI Bank", type:"bank", opening:20000 },
            { id:3, name:"HDFC Credit Card", type:"card", opening:10000, limit:100000 }
        ];

        state.categories = ["Food","Travel","EMI","Shopping","Business"];

        state.transactions = [
            { id:101, date:"2026-02-01", mode:"salary", amount:80000, destination:"HDFC Bank" },
            { id:102, date:"2026-02-03", mode:"upi", amount:2000, source:"HDFC Bank", category:"Food" },
            { id:103, date:"2026-02-05", mode:"card", amount:5000, source:"HDFC Credit Card", category:"Shopping" }
        ];

        saveState();
    }
}

// ================= MODAL =================

function setupModal() {

    document.getElementById("addTransactionBtn")
        .addEventListener("click", openModal);

    document.getElementById("closeModalBtn")
        .addEventListener("click", closeModal);

    document.getElementById("saveTxBtn")
        .addEventListener("click", saveTransaction);
}

function openModal() {
    document.getElementById("transactionModal")
        .classList.remove("hidden");

    document.getElementById("txDate").valueAsDate = new Date();
}

function closeModal() {
    document.getElementById("transactionModal")
        .classList.add("hidden");
}

// ================= SAVE TRANSACTION =================

function saveTransaction() {

    const tx = {
        id: Date.now(),
        date: document.getElementById("txDate").value,
        amount: parseFloat(document.getElementById("txAmount").value),
        mode: document.getElementById("txMode").value,
        source: document.getElementById("txSource").value,
        destination: document.getElementById("txDestination").value,
        category: document.getElementById("txCategory").value,
        emi: document.getElementById("txEMI")?.checked || false,
        emotional: document.getElementById("txEmotional")?.checked || false
    };

    if (!tx.date || !tx.amount || !tx.mode) {
        alert("Date, Amount and Mode required.");
        return;
    }

    state.transactions.push(tx);
    saveState();
    closeModal();
    renderAll();
}

// ================= FILTER =================

function getMonthlyTransactions() {
    return state.transactions.filter(t =>
        t.date.startsWith(state.selectedMonth)
    );
}

// ================= MASTER RENDER =================

function renderAll() {
    renderKPI();
    renderAnalytics();
    renderLedger();
}

// ================= KPI =================

function renderKPI() {

    const monthTx = getMonthlyTransactions();

    const income = monthTx
        .filter(t => t.mode === "salary")
        .reduce((s,t)=>s+t.amount,0);

    const expense = monthTx
        .filter(t => t.mode !== "salary")
        .reduce((s,t)=>s+t.amount,0);

    const net = income - expense;

    const burnRatio = income ? ((expense/income)*100).toFixed(1) : 0;

    const emiTotal = monthTx
        .filter(t=>t.emi)
        .reduce((s,t)=>s+t.amount,0);

    const creditUtil = calculateCreditUtilization();

    const score = calculateFinancialScore(burnRatio, creditUtil, emiTotal);

    document.getElementById("monthSummary").innerText =
        `${monthTx.length} transactions`;

    document.getElementById("kpiSection").innerHTML = `
        <div class="kpi-card">
            <div class="kpi-label">Income</div>
            <div class="kpi-value">₹${income}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Expense</div>
            <div class="kpi-value">₹${expense}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Net</div>
            <div class="kpi-value">${net}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Burn Ratio</div>
            <div class="kpi-value">${burnRatio}%</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Credit Util</div>
            <div class="kpi-value">${creditUtil}%</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Financial Score</div>
            <div class="kpi-value">${score}/100</div>
        </div>
    `;
}

// ================= CREDIT UTILIZATION =================

function calculateCreditUtilization() {

    let totalLimit = 0;
    let outstanding = 0;

    state.accounts.forEach(acc=>{
        if(acc.type==="card") totalLimit += acc.limit || 0;
    });

    state.transactions.forEach(t=>{
        if(t.mode==="card") outstanding += t.amount;
        if(t.mode==="card_payment") outstanding -= t.amount;
    });

    if(!totalLimit) return 0;

    return ((outstanding/totalLimit)*100).toFixed(1);
}

// ================= FINANCIAL SCORE =================

function calculateFinancialScore(burnRatio, creditUtil, emiTotal){

    let score = 100;

    if (burnRatio > 80) score -= 20;
    if (creditUtil > 50) score -= 20;
    if (emiTotal > 30000) score -= 10;

    return score;
}

// ================= ANALYTICS =================

function renderAnalytics() {

    const monthTx = getMonthlyTransactions();
    const container = document.getElementById("analyticsSection");

    if (!monthTx.length) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `
        <div class="chart-card">
            <h3>Cashflow</h3>
            <canvas id="cashflowChart"></canvas>
        </div>
        <div class="chart-card">
            <h3>Category</h3>
            <canvas id="categoryChart"></canvas>
        </div>
    `;

    renderCashflowChart(monthTx);
    renderCategoryChart(monthTx);
}

function renderCashflowChart(monthTx) {

    if (cashflowChartInstance) cashflowChartInstance.destroy();

    const total = monthTx.reduce((sum,t)=>{
        return t.mode==="salary" ? sum+t.amount : sum-t.amount;
    },0);

    cashflowChartInstance = new Chart(
        document.getElementById("cashflowChart"),
        {
            type:"bar",
            data:{
                labels:[state.selectedMonth],
                datasets:[{
                    data:[total],
                    backgroundColor:"#00b894"
                }]
            },
            options:{plugins:{legend:{display:false}}}
        }
    );
}

function renderCategoryChart(monthTx) {

    if (categoryChartInstance) categoryChartInstance.destroy();

    const totals={};

    monthTx.forEach(t=>{
        if(t.mode!=="salary"){
            const cat=t.category||"Other";
            if(!totals[cat]) totals[cat]=0;
            totals[cat]+=t.amount;
        }
    });

    categoryChartInstance=new Chart(
        document.getElementById("categoryChart"),
        {
            type:"doughnut",
            data:{
                labels:Object.keys(totals),
                datasets:[{data:Object.values(totals)}]
            }
        }
    );
}

// ================= LEDGER =================

function renderLedger() {

    const monthTx = getMonthlyTransactions();
    const container = document.getElementById("contentSection");

    if (!monthTx.length) {
        container.innerHTML = "<p>No transactions this month.</p>";
        return;
    }

    const rows = monthTx.slice().reverse().map(t=>`
        <tr>
            <td>${t.date}</td>
            <td>${t.mode}</td>
            <td>${t.category||"-"}</td>
            <td>₹${t.amount}</td>
            <td>
                <button onclick="deleteTransaction(${t.id})">Delete</button>
            </td>
        </tr>
    `).join("");

    container.innerHTML=`
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Mode</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function deleteTransaction(id){
    state.transactions = state.transactions.filter(t=>t.id!==id);
    saveState();
    renderAll();
}

// ================= CSV EXPORT =================

function exportCSV(){

    let csv="Date,Mode,Category,Amount\n";

    state.transactions.forEach(t=>{
        csv+=`${t.date},${t.mode},${t.category||""},${t.amount}\n`;
    });

    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);

    const a=document.createElement("a");
    a.href=url;
    a.download="transactions.csv";
    a.click();

    URL.revokeObjectURL(url);
}
