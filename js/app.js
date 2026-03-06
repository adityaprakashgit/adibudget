const API_URL = "";

const pageMeta = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Your custom finance cockpit backed by Firefly III."
  },
  transactions: {
    title: "Transactions",
    subtitle: "Record and manage expenses, income, transfers, and splits."
  },
  accounts: {
    title: "Accounts",
    subtitle: "Manage balances and account structure without leaving adibudget."
  },
  budgets: {
    title: "Budgets",
    subtitle: "Track spend targets and edit budgets from the same UI."
  },
  categories: {
    title: "Categories",
    subtitle: "Keep your transaction classification clean and reusable."
  },
  tags: {
    title: "Tags",
    subtitle: "Use tags for projects, reporting, and recurring search patterns."
  },
  recurring: {
    title: "Recurring",
    subtitle: "Create and edit supported recurring flows through the backend adapter."
  },
  settings: {
    title: "Settings",
    subtitle: "Inspect connection health and adapter status."
  }
};

const state = {
  transactions: [],
  accounts: [],
  budgets: [],
  categories: [],
  tags: [],
  recurring: [],
  health: null,
  filters: {
    transactions: {
      date_from: "",
      date_to: "",
      type: "",
      category_id: "",
      account_id: "",
      budget_id: ""
    }
  },
  ui: {
    modal: null,
    pageError: "",
    loading: false
  }
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function requestJSON(path, options = {}) {
  const { query, body, headers, ...fetchOptions } = options;
  const url = new URL(`${API_URL}${path}`, window.location.origin);

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url.toString(), {
    ...fetchOptions,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const contentType = response.headers.get("content-type") || "";
  const hasJsonBody = contentType.includes("application/json");
  const payload = hasJsonBody ? await response.json() : null;

  if (!response.ok) {
    const message =
      payload && payload.error
        ? payload.error
        : `Request failed with status ${response.status}`;

    const error = new Error(message);
    error.details = payload;
    throw error;
  }

  return payload;
}

function formatCurrency(amount, currency = "INR") {
  const safeAmount = Number(amount || 0);

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(safeAmount);
  } catch (error) {
    return `${currency} ${safeAmount.toLocaleString("en-IN")}`;
  }
}

function formatDate(value) {
  if (!value) {
    return "No date";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatDateInput(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function renderEmptyState(title, subtitle) {
  return `
    <div class="empty-state">
      <div class="row-title">${escapeHtml(title)}</div>
      <div class="sub">${escapeHtml(subtitle)}</div>
    </div>
  `;
}

function renderLoadingState(title = "Loading", subtitle = "Fetching fresh data from Firefly III.") {
  return `
    <div class="placeholder-state">
      <div class="row-title">${escapeHtml(title)}</div>
      <div class="sub">${escapeHtml(subtitle)}</div>
    </div>
  `;
}

function getPageTitle(page) {
  return pageMeta[page] || {
    title: page.charAt(0).toUpperCase() + page.slice(1),
    subtitle: ""
  };
}

function getCurrentMonthTransactions() {
  const now = new Date();
  return state.transactions.filter((transaction) => {
    const date = new Date(transaction.date);
    return (
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  });
}

function getNetWorth() {
  return state.accounts.reduce((sum, account) => {
    const balance = Number(account.balance || 0);

    if (account.kind === "credit" || account.kind === "liability") {
      return sum - balance;
    }

    return sum + balance;
  }, 0);
}

function getAccountOptions({
  includeBlank = true,
  includeArchived = false,
  selectedId = "",
  allowKinds = []
} = {}) {
  const options = [];

  if (includeBlank) {
    options.push('<option value="">Select account</option>');
  }

  state.accounts
    .filter((account) => (includeArchived ? true : account.active !== false))
    .filter((account) =>
      allowKinds.length ? allowKinds.includes(account.kind) : true
    )
    .forEach((account) => {
      options.push(`
        <option value="${escapeHtml(account.id)}" ${
          String(selectedId) === String(account.id) ? "selected" : ""
        }>
          ${escapeHtml(account.name)} (${escapeHtml(account.kind)})
        </option>
      `);
    });

  return options.join("");
}

function getBudgetOptions(selectedId = "", includeBlank = true) {
  const options = [];

  if (includeBlank) {
    options.push('<option value="">No budget</option>');
  }

  state.budgets.forEach((budget) => {
    options.push(`
      <option value="${escapeHtml(budget.id)}" ${
        String(selectedId) === String(budget.id) ? "selected" : ""
      }>
        ${escapeHtml(budget.name)}
      </option>
    `);
  });

  return options.join("");
}

function getCategoryOptions(selectedId = "", includeBlank = true) {
  const options = [];

  if (includeBlank) {
    options.push('<option value="">No category</option>');
  }

  state.categories.forEach((category) => {
    options.push(`
      <option value="${escapeHtml(category.id)}" ${
        String(selectedId) === String(category.id) ? "selected" : ""
      }>
        ${escapeHtml(category.name)}
      </option>
    `);
  });

  return options.join("");
}

function findCategoryNameById(categoryId) {
  return state.categories.find((item) => String(item.id) === String(categoryId))?.name || "";
}

function findBudgetNameById(budgetId) {
  return state.budgets.find((item) => String(item.id) === String(budgetId))?.name || "";
}

function getHealthStatusClass() {
  if (!state.health) {
    return "status-idle";
  }

  return state.health.ok ? "status-ok" : "status-error";
}

function updateNavHealthIndicator() {
  const target = document.getElementById("navHealthStatus");
  if (!target) {
    return;
  }

  const text = !state.health
    ? "Checking"
    : state.health.ok
      ? "Connected"
      : "Needs attention";

  target.className = `status-pill ${getHealthStatusClass()}`;
  target.textContent = text;
}

async function loadAccounts() {
  const accounts = await requestJSON("/accounts");
  state.accounts = accounts;
  return accounts;
}

async function loadTransactions() {
  const transactions = await requestJSON("/transactions");
  state.transactions = transactions;
  return transactions;
}

async function loadBudgets() {
  const budgets = await requestJSON("/budgets");
  state.budgets = budgets;
  return budgets;
}

async function loadCategories() {
  const categories = await requestJSON("/categories");
  state.categories = categories;
  return categories;
}

async function loadTags() {
  const tags = await requestJSON("/tags");
  state.tags = tags;
  return tags;
}

async function loadRecurring() {
  const recurring = await requestJSON("/recurring");
  state.recurring = recurring;
  return recurring;
}

async function loadHealth() {
  const health = await requestJSON("/api/health");
  state.health = health;
  updateNavHealthIndicator();
  return health;
}

async function loadReferenceData() {
  await Promise.all([loadAccounts(), loadBudgets(), loadCategories(), loadTags()]);
}

function renderDashboardMetrics() {
  const currentMonth = getCurrentMonthTransactions();
  const income = currentMonth
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const expenses = currentMonth
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const netWorth = getNetWorth();
  const budgeted = state.budgets.reduce(
    (sum, budget) => sum + Number(budget.amount || 0),
    0
  );

  const metrics = [
    {
      label: "Net Worth",
      value: formatCurrency(netWorth),
      helper: "Assets minus debt-like balances"
    },
    {
      label: "This Month Income",
      value: formatCurrency(income),
      helper: "Deposit journals in the current month"
    },
    {
      label: "This Month Expense",
      value: formatCurrency(expenses),
      helper: "Withdrawal journals in the current month"
    },
    {
      label: "Budgeted Total",
      value: formatCurrency(budgeted),
      helper: "Budget targets currently available"
    }
  ];

  const container = document.getElementById("dashboardMetrics");
  if (!container) {
    return;
  }

  container.innerHTML = metrics
    .map(
      (metric) => `
        <div class="card metric-card">
          <div class="label">${escapeHtml(metric.label)}</div>
          <div class="metric-value">${escapeHtml(metric.value)}</div>
          <div class="sub">${escapeHtml(metric.helper)}</div>
        </div>
      `
    )
    .join("");
}

function renderDashboardRecentTransactions() {
  const container = document.getElementById("dashboardRecentTransactions");
  if (!container) {
    return;
  }

  if (!state.transactions.length) {
    container.innerHTML = renderEmptyState(
      "No transactions yet",
      "Create a transaction from adibudget and it will show up here."
    );
    return;
  }

  container.innerHTML = `
    <div class="data-list">
      ${state.transactions
        .slice(0, 6)
        .map(
          (transaction) => `
            <div class="data-list-row">
              <div class="row-title">${escapeHtml(transaction.description)}</div>
              <div class="sub">${escapeHtml(formatDate(transaction.date))}</div>
              <div class="row-meta">
                <span class="chip">${escapeHtml(transaction.type)}</span>
                <span class="chip">${escapeHtml(transaction.account_name || "No account")}</span>
                <span class="chip">${escapeHtml(transaction.category || "Uncategorized")}</span>
              </div>
              <div class="value ${
                transaction.type === "income" ? "positive" : "negative"
              }">
                ${escapeHtml(formatCurrency(transaction.amount, transaction.currency))}
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDashboardBudgetSnapshot() {
  const container = document.getElementById("dashboardBudgetSnapshot");
  if (!container) {
    return;
  }

  if (!state.budgets.length) {
    container.innerHTML = renderEmptyState(
      "No budgets found",
      "Create a budget here and Firefly III will remain the source of truth."
    );
    return;
  }

  container.innerHTML = `
    <div class="data-list">
      ${state.budgets
        .slice(0, 5)
        .map((budget) => {
          const amount = Number(budget.amount || 0);
          const spent = Number(budget.spent || 0);
          const ratio = amount > 0 ? Math.min(100, Math.round((spent / amount) * 100)) : 0;

          return `
            <div class="budget-card">
              <div class="row-title">${escapeHtml(budget.name)}</div>
              <div class="sub">
                ${escapeHtml(formatCurrency(spent, budget.currency))} spent
                of ${escapeHtml(formatCurrency(amount, budget.currency))}
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width:${ratio}%;"></div>
              </div>
              <div class="table-note">Remaining: ${
                budget.remaining === null
                  ? "Not available"
                  : escapeHtml(formatCurrency(budget.remaining, budget.currency))
              }</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderDashboardAccountsOverview() {
  const container = document.getElementById("dashboardAccountsOverview");
  if (!container) {
    return;
  }

  if (!state.accounts.length) {
    container.innerHTML = renderEmptyState(
      "No accounts found",
      "Create an account from the Accounts page."
    );
    return;
  }

  const groups = ["bank", "cash", "savings", "credit", "liability"];

  container.innerHTML = `
    <div class="data-list">
      ${groups
        .map((kind) => {
          const groupAccounts = state.accounts.filter((account) => account.kind === kind);
          const total = groupAccounts.reduce(
            (sum, account) => sum + Number(account.balance || 0),
            0
          );

          return `
            <div class="data-list-row">
              <div class="row-title">${escapeHtml(kind)}</div>
              <div class="sub">${groupAccounts.length} account(s)</div>
              <div class="value ${kind === "credit" || kind === "liability" ? "negative" : ""}">
                ${escapeHtml(formatCurrency(total))}
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderDashboardHealthOverview() {
  const container = document.getElementById("dashboardHealthOverview");
  if (!container) {
    return;
  }

  if (!state.health) {
    container.innerHTML = renderEmptyState(
      "Connection not checked yet",
      "Open Settings to inspect the backend and Firefly status."
    );
    return;
  }

  const statusText = state.health.ok ? "Connected" : "Needs attention";
  const version = state.health.firefly?.version || "Unknown";

  container.innerHTML = `
    <div class="data-list-row">
      <div class="row-title">Backend Status</div>
      <div class="row-meta">
        <span class="status-pill ${getHealthStatusClass()}">${escapeHtml(statusText)}</span>
        <span class="chip">Firefly ${escapeHtml(version)}</span>
      </div>
      <div class="sub">
        ${
          state.health.missing && state.health.missing.length
            ? `Missing: ${escapeHtml(state.health.missing.join(", "))}`
            : "All required backend configuration is present."
        }
      </div>
    </div>
  `;
}

function renderDashboardPage() {
  renderDashboardMetrics();
  renderDashboardRecentTransactions();
  renderDashboardBudgetSnapshot();
  renderDashboardAccountsOverview();
  renderDashboardHealthOverview();
}

function getFilteredTransactions() {
  const filters = state.filters.transactions;

  return state.transactions.filter((transaction) => {
    const transactionDate = formatDateInput(transaction.date);

    if (filters.date_from && transactionDate < filters.date_from) {
      return false;
    }

    if (filters.date_to && transactionDate > filters.date_to) {
      return false;
    }

    if (filters.type && transaction.type !== filters.type) {
      return false;
    }

    if (
      filters.category_id &&
      String(transaction.category_id || "") !== String(filters.category_id)
    ) {
      return false;
    }

    if (
      filters.account_id &&
      String(transaction.account_id || "") !== String(filters.account_id)
    ) {
      return false;
    }

    if (
      filters.budget_id &&
      String(transaction.budget_id || "") !== String(filters.budget_id)
    ) {
      return false;
    }

    return true;
  });
}

function renderTransactionFilters() {
  const container = document.getElementById("transactionsFilters");
  if (!container) {
    return;
  }

  const filters = state.filters.transactions;

  container.innerHTML = `
    <label class="field-stack">
      <span class="label">From</span>
      <input class="input" type="date" data-filter="date_from" value="${escapeHtml(filters.date_from)}" />
    </label>
    <label class="field-stack">
      <span class="label">To</span>
      <input class="input" type="date" data-filter="date_to" value="${escapeHtml(filters.date_to)}" />
    </label>
    <label class="field-stack">
      <span class="label">Type</span>
      <select class="input" data-filter="type">
        <option value="">All types</option>
        <option value="expense" ${filters.type === "expense" ? "selected" : ""}>Expense</option>
        <option value="income" ${filters.type === "income" ? "selected" : ""}>Income</option>
        <option value="transfer" ${filters.type === "transfer" ? "selected" : ""}>Transfer</option>
      </select>
    </label>
    <label class="field-stack">
      <span class="label">Category</span>
      <select class="input" data-filter="category_id">
        ${getCategoryOptions(filters.category_id)}
      </select>
    </label>
    <label class="field-stack">
      <span class="label">Account</span>
      <select class="input" data-filter="account_id">
        ${getAccountOptions({ selectedId: filters.account_id })}
      </select>
    </label>
    <label class="field-stack">
      <span class="label">Budget</span>
      <select class="input" data-filter="budget_id">
        ${getBudgetOptions(filters.budget_id)}
      </select>
    </label>
  `;
}

function renderTransactionsTable() {
  const container = document.getElementById("transactionsTable");
  const countEl = document.getElementById("transactionCount");

  if (!container) {
    return;
  }

  const filtered = getFilteredTransactions();

  if (countEl) {
    countEl.textContent = `${filtered.length} Records`;
  }

  if (!filtered.length) {
    container.innerHTML = renderEmptyState(
      "No matching transactions",
      "Try relaxing the filters or create a new transaction."
    );
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Account</th>
            <th>Budget / Category</th>
            <th>Tags</th>
            <th>Amount</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered
            .map((transaction) => `
              <tr>
                <td>${escapeHtml(formatDate(transaction.date))}</td>
                <td>
                  <div class="row-title">${escapeHtml(transaction.description)}</div>
                  <div class="table-note">
                    ${escapeHtml(transaction.type)}${
                      transaction.split_count > 1
                        ? ` · ${transaction.split_count} splits`
                        : ""
                    }
                  </div>
                </td>
                <td>
                  <div>${escapeHtml(transaction.account_name || "Unknown")}</div>
                  <div class="table-note">${escapeHtml(transaction.counterpart_name || "No counterpart")}</div>
                </td>
                <td>
                  <div>${escapeHtml(transaction.budget_name || "No budget")}</div>
                  <div class="table-note">${escapeHtml(transaction.category || "Uncategorized")}</div>
                </td>
                <td>
                  ${
                    transaction.tags && transaction.tags.length
                      ? `<div class="chip-list">${transaction.tags
                          .map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`)
                          .join("")}</div>`
                      : '<span class="table-note">No tags</span>'
                  }
                </td>
                <td class="${transaction.type === "income" ? "amount-positive" : "amount-negative"}">
                  ${escapeHtml(formatCurrency(transaction.amount, transaction.currency))}
                </td>
                <td>
                  <div class="inline-actions">
                    <button type="button" class="btn btn-secondary" data-action="transaction-edit" data-id="${escapeHtml(transaction.id)}">Edit</button>
                    <button type="button" class="btn btn-danger" data-action="transaction-delete" data-id="${escapeHtml(transaction.id)}">Delete</button>
                  </div>
                </td>
              </tr>
            `)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAccountsPage() {
  const summary = document.getElementById("accountsSummary");
  const groupsContainer = document.getElementById("accountsGroups");

  if (!summary || !groupsContainer) {
    return;
  }

  const assetKinds = ["bank", "cash", "savings"];
  const assetTotal = state.accounts
    .filter((account) => assetKinds.includes(account.kind))
    .reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const liabilityTotal = state.accounts
    .filter((account) => ["credit", "liability"].includes(account.kind))
    .reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const archivedCount = state.accounts.filter((account) => account.archived).length;

  summary.innerHTML = `
    <div class="card metric-card">
      <div class="label">Total Accounts</div>
      <div class="metric-value">${state.accounts.length}</div>
      <div class="sub">Across all supported Firefly account styles</div>
    </div>
    <div class="card metric-card">
      <div class="label">Asset Balance</div>
      <div class="metric-value">${escapeHtml(formatCurrency(assetTotal))}</div>
      <div class="sub">Bank, cash, and savings</div>
    </div>
    <div class="card metric-card">
      <div class="label">Debt Balance</div>
      <div class="metric-value">${escapeHtml(formatCurrency(liabilityTotal))}</div>
      <div class="sub">Credit and liabilities</div>
    </div>
    <div class="card metric-card">
      <div class="label">Archived</div>
      <div class="metric-value">${archivedCount}</div>
      <div class="sub">Hidden via active flag</div>
    </div>
  `;

  if (!state.accounts.length) {
    groupsContainer.innerHTML = renderEmptyState(
      "No accounts found",
      "Create an account to start routing transactions from adibudget."
    );
    return;
  }

  const accountKinds = [
    ["bank", "Bank Accounts"],
    ["cash", "Cash Wallets"],
    ["savings", "Savings Accounts"],
    ["credit", "Credit Accounts"],
    ["liability", "Liabilities"]
  ];

  groupsContainer.innerHTML = accountKinds
    .map(([kind, label]) => {
      const groupAccounts = state.accounts.filter((account) => account.kind === kind);

      if (!groupAccounts.length) {
        return "";
      }

      return `
        <div class="card">
          <div class="section-header">
            <div>
              <div class="label">${escapeHtml(label)}</div>
              <div class="sub">${groupAccounts.length} account(s)</div>
            </div>
          </div>
          <div class="grid-2">
            ${groupAccounts
              .map(
                (account) => `
                  <div class="account-card">
                    <div class="section-header">
                      <div>
                        <div class="row-title">${escapeHtml(account.name)}</div>
                        <div class="row-meta">
                          <span class="chip">${escapeHtml(account.kind)}</span>
                          <span class="chip">${escapeHtml(account.currency || "INR")}</span>
                          <span class="status-pill ${account.active ? "status-ok" : "status-error"}">
                            ${account.active ? "Active" : "Archived"}
                          </span>
                        </div>
                      </div>
                      <div class="value ${["credit", "liability"].includes(account.kind) ? "negative" : ""}">
                        ${escapeHtml(formatCurrency(account.balance, account.currency))}
                      </div>
                    </div>
                    <div class="sub">
                      ${account.notes ? escapeHtml(account.notes) : "No notes"}
                    </div>
                    <div class="row-actions">
                      <button type="button" class="btn btn-secondary" data-action="account-edit" data-id="${escapeHtml(account.id)}">Edit</button>
                      ${
                        account.active
                          ? `<button type="button" class="btn btn-danger" data-action="account-archive" data-id="${escapeHtml(account.id)}">Archive</button>`
                          : ""
                      }
                    </div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function renderBudgetsPage() {
  const container = document.getElementById("budgetsGrid");
  if (!container) {
    return;
  }

  if (!state.budgets.length) {
    container.innerHTML = renderEmptyState(
      "No budgets found",
      "Create a budget target from adibudget."
    );
    return;
  }

  container.innerHTML = state.budgets
    .map((budget) => {
      const amount = Number(budget.amount || 0);
      const spent = Number(budget.spent || 0);
      const ratio = amount > 0 ? Math.min(100, Math.round((spent / amount) * 100)) : 0;

      return `
        <div class="budget-card" data-budget-id="${escapeHtml(budget.id)}">
          <div class="section-header">
            <div>
              <div class="row-title">${escapeHtml(budget.name)}</div>
              <div class="row-meta">
                <span class="status-pill ${budget.active ? "status-ok" : "status-error"}">
                  ${budget.active ? "Active" : "Inactive"}
                </span>
                <span class="chip">${escapeHtml(budget.auto_budget_period || "manual")}</span>
              </div>
            </div>
            <div class="value">${escapeHtml(formatCurrency(amount, budget.currency))}</div>
          </div>
          <div class="sub">${escapeHtml(budget.notes || "No notes")}</div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${ratio}%;"></div>
          </div>
          <div class="table-note">
            Spent ${escapeHtml(formatCurrency(spent, budget.currency))} · Remaining ${
              budget.remaining === null
                ? "Not available"
                : escapeHtml(formatCurrency(budget.remaining, budget.currency))
            }
          </div>
          <div class="row-actions">
            <button type="button" class="btn btn-secondary" data-action="budget-edit" data-id="${escapeHtml(budget.id)}">Edit</button>
            <button type="button" class="btn btn-danger" data-action="budget-delete" data-id="${escapeHtml(budget.id)}">Delete</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderSimpleTable({
  containerId,
  rows,
  columns,
  emptyTitle,
  emptySubtitle,
  actions
}) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  if (!rows.length) {
    container.innerHTML = renderEmptyState(emptyTitle, emptySubtitle);
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            ${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  ${columns
                    .map((column) => `<td>${column.render(row)}</td>`)
                    .join("")}
                  <td>
                    <div class="inline-actions">
                      ${actions(row)}
                    </div>
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCategoriesPage() {
  renderSimpleTable({
    containerId: "categoriesTable",
    rows: state.categories,
    columns: [
      {
        label: "Name",
        render: (row) => `<div class="row-title">${escapeHtml(row.name)}</div>`
      },
      {
        label: "Notes",
        render: (row) => escapeHtml(row.notes || "No notes")
      }
    ],
    emptyTitle: "No categories found",
    emptySubtitle: "Create categories to reuse them in transactions and recurring entries.",
    actions: (row) => `
      <button type="button" class="btn btn-secondary" data-action="category-edit" data-id="${escapeHtml(row.id)}">Edit</button>
      <button type="button" class="btn btn-danger" data-action="category-delete" data-id="${escapeHtml(row.id)}">Delete</button>
    `
  });
}

function renderTagsPage() {
  renderSimpleTable({
    containerId: "tagsTable",
    rows: state.tags,
    columns: [
      {
        label: "Tag",
        render: (row) => `<div class="row-title">${escapeHtml(row.name)}</div>`
      },
      {
        label: "Description",
        render: (row) => escapeHtml(row.description || "No description")
      },
      {
        label: "Date",
        render: (row) => escapeHtml(row.date ? formatDate(row.date) : "No date")
      }
    ],
    emptyTitle: "No tags found",
    emptySubtitle: "Tags help with reporting and grouping transaction activity.",
    actions: (row) => `
      <button type="button" class="btn btn-secondary" data-action="tag-edit" data-id="${escapeHtml(row.id)}">Edit</button>
      <button type="button" class="btn btn-danger" data-action="tag-delete" data-id="${escapeHtml(row.id)}">Delete</button>
    `
  });
}

function renderRecurringPage() {
  const container = document.getElementById("recurringList");
  if (!container) {
    return;
  }

  if (!state.recurring.length) {
    container.innerHTML = renderEmptyState(
      "No recurring entries",
      "Create a supported recurring entry from adibudget."
    );
    return;
  }

  container.innerHTML = state.recurring
    .map(
      (item) => `
        <div class="recurrence-row">
          <div class="section-header">
            <div>
              <div class="row-title">${escapeHtml(item.title)}</div>
              <div class="row-meta">
                <span class="chip">${escapeHtml(item.type)}</span>
                <span class="chip">${escapeHtml(item.frequency_type)}</span>
                <span class="status-pill ${item.active ? "status-ok" : "status-error"}">
                  ${item.active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            <div class="value">${escapeHtml(formatCurrency(item.amount, item.currency))}</div>
          </div>
          <div class="sub">${escapeHtml(item.description || item.transaction_description || "No description")}</div>
          <div class="row-meta">
            <span class="chip">${escapeHtml(item.account_name || "No source account")}</span>
            ${
              item.counterpart_name
                ? `<span class="chip">${escapeHtml(item.counterpart_name)}</span>`
                : ""
            }
            ${
              item.category_name
                ? `<span class="chip">${escapeHtml(item.category_name)}</span>`
                : ""
            }
            ${
              item.budget_name
                ? `<span class="chip">${escapeHtml(item.budget_name)}</span>`
                : ""
            }
          </div>
          <div class="table-note">
            Starts ${escapeHtml(formatDate(item.first_date))} · Moment ${escapeHtml(item.frequency_moment)} · Skip ${escapeHtml(String(item.frequency_skip || 0))}
          </div>
          <div class="row-actions">
            <button type="button" class="btn btn-secondary" data-action="recurring-edit" data-id="${escapeHtml(item.id)}">Edit</button>
            <button type="button" class="btn btn-danger" data-action="recurring-delete" data-id="${escapeHtml(item.id)}">Delete</button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderSettingsPage() {
  const container = document.getElementById("settingsHealthCards");
  const configContainer = document.getElementById("settingsBackendConfig");
  if (!container) {
    return;
  }

  if (!state.health) {
    container.innerHTML = renderEmptyState(
      "Health not loaded",
      "Refresh the health check to inspect backend connectivity."
    );
    return;
  }

  container.innerHTML = `
    <div class="card metric-card">
      <div class="label">Backend Status</div>
      <div class="metric-value">${state.health.ok ? "OK" : "Error"}</div>
      <div class="sub">${
        state.health.missing && state.health.missing.length
          ? `Missing: ${escapeHtml(state.health.missing.join(", "))}`
          : "Required configuration is present."
      }</div>
    </div>
    <div class="card metric-card">
      <div class="label">Firefly Version</div>
      <div class="metric-value">${escapeHtml(state.health.firefly?.version || "Unknown")}</div>
      <div class="sub">API ${escapeHtml(state.health.firefly?.api_version || "Unknown")}</div>
    </div>
    <div class="card metric-card">
      <div class="label">Runtime</div>
      <div class="metric-value">${escapeHtml(state.health.firefly?.php_version || "Unknown")}</div>
      <div class="sub">${escapeHtml(state.health.firefly?.os || "Unknown OS")}</div>
    </div>
  `;

  if (configContainer) {
    configContainer.innerHTML = `
      <span class="chip">Port ${escapeHtml(String(state.health.backend?.port || ""))}</span>
      <span class="chip">${escapeHtml(state.health.backend?.fireflyBaseUrl || "No Firefly URL")}</span>
      <span class="chip">${
        state.health.backend?.hasAccessToken ? "Access token configured" : "Access token missing"
      }</span>
    `;
  }
}

async function loadPageData(page) {
  if (page === "dashboard") {
    await Promise.all([loadTransactions(), loadAccounts(), loadBudgets(), loadHealth()]);
    renderDashboardPage();
    return;
  }

  if (page === "transactions") {
    await Promise.all([
      loadTransactions(),
      loadAccounts(),
      loadBudgets(),
      loadCategories()
    ]);
    renderTransactionFilters();
    renderTransactionsTable();
    return;
  }

  if (page === "accounts") {
    await loadAccounts();
    renderAccountsPage();
    return;
  }

  if (page === "budgets") {
    await loadBudgets();
    renderBudgetsPage();
    return;
  }

  if (page === "categories") {
    await loadCategories();
    renderCategoriesPage();
    return;
  }

  if (page === "tags") {
    await loadTags();
    renderTagsPage();
    return;
  }

  if (page === "recurring") {
    await Promise.all([
      loadRecurring(),
      loadAccounts(),
      loadBudgets(),
      loadCategories()
    ]);
    renderRecurringPage();
    return;
  }

  if (page === "settings") {
    await loadHealth();
    renderSettingsPage();
  }
}

function setTransactionFilter(name, value) {
  state.filters.transactions[name] = value;
  renderTransactionsTable();
}

function clearTransactionFilters() {
  state.filters.transactions = {
    date_from: "",
    date_to: "",
    type: "",
    category_id: "",
    account_id: "",
    budget_id: ""
  };
}

function getTransactionById(id) {
  return state.transactions.find((transaction) => String(transaction.id) === String(id));
}

function getAccountByIdFromState(id) {
  return state.accounts.find((account) => String(account.id) === String(id));
}

function getBudgetById(id) {
  return state.budgets.find((budget) => String(budget.id) === String(id));
}

function getCategoryById(id) {
  return state.categories.find((category) => String(category.id) === String(id));
}

function getTagById(id) {
  return state.tags.find((tag) => String(tag.id) === String(id));
}

function getRecurringById(id) {
  return state.recurring.find((entry) => String(entry.id) === String(id));
}

function buildSplitRowMarkup(split = {}, index = 0) {
  return `
    <div class="split-row" data-split-row data-index="${index}">
      <div class="split-row-header">
        <div class="row-title">Split ${index + 1}</div>
        <button type="button" class="split-remove" data-remove-split>Remove</button>
      </div>
      <div class="field-grid">
        <label class="field-stack">
          <span class="label">Description</span>
          <input class="input" name="split_description" value="${escapeHtml(split.description || "")}" placeholder="Description" />
        </label>
        <label class="field-stack">
          <span class="label">Amount</span>
          <input class="input" type="number" min="0" step="0.01" name="split_amount" value="${escapeHtml(split.amount || "")}" placeholder="0.00" />
        </label>
        <label class="field-stack">
          <span class="label">Category</span>
          <select class="input" name="split_category_id">
            ${getCategoryOptions(split.category?.id || split.category_id || "", true)}
          </select>
        </label>
        <label class="field-stack">
          <span class="label">Budget</span>
          <select class="input" name="split_budget_id">
            ${getBudgetOptions(split.budget?.id || split.budget_id || "", true)}
          </select>
        </label>
        <label class="field-stack">
          <span class="label">Tags</span>
          <input class="input" name="split_tags" value="${escapeHtml(
            Array.isArray(split.tags) ? split.tags.join(", ") : split.tags || ""
          )}" placeholder="comma,separated,tags" />
        </label>
      </div>
    </div>
  `;
}

function getDefaultTransactionDraft() {
  return {
    type: "expense",
    date: formatDateInput(new Date()),
    account_id: "",
    destination_account_id: "",
    counterpart_name: "",
    notes: "",
    splits: [
      {
        description: "",
        amount: "",
        category_id: "",
        budget_id: "",
        tags: []
      }
    ]
  };
}

function renderModalBody(modal) {
  const body = document.getElementById("modalBody");
  const title = document.getElementById("modalTitle");
  const subtitle = document.getElementById("modalSubtitle");
  const primaryAction = document.getElementById("modalPrimaryAction");
  const errorBox = document.getElementById("modalError");

  if (!body || !title || !subtitle || !primaryAction || !errorBox) {
    return;
  }

  errorBox.textContent = "";
  errorBox.classList.add("hidden");

  title.textContent = modal.title;
  subtitle.textContent = modal.subtitle;
  primaryAction.textContent = modal.primaryLabel;
  primaryAction.dataset.action = modal.action;

  body.innerHTML = modal.body;
}

function openHealthModal() {
  const health = state.health;
  const status = health?.ok ? "Connected" : "Not connected";

  state.ui.modal = {
    action: "health-check",
    title: "Connection Health",
    subtitle: "Inspect the backend adapter and Firefly III status.",
    primaryLabel: "Refresh",
    body: `
      <div class="card">
        <div class="section-header">
          <div>
            <div class="label">Current Status</div>
            <div class="value">${escapeHtml(status)}</div>
          </div>
          <div class="status-pill ${getHealthStatusClass()}">${escapeHtml(status)}</div>
        </div>
        <div class="sub">
          ${
            health?.missing?.length
              ? `Missing config: ${escapeHtml(health.missing.join(", "))}`
              : "No missing required backend settings."
          }
        </div>
        <div class="row-meta" style="margin-top:16px;">
          <span class="chip">Firefly ${escapeHtml(health?.firefly?.version || "Unknown")}</span>
          <span class="chip">API ${escapeHtml(health?.firefly?.api_version || "Unknown")}</span>
          <span class="chip">${escapeHtml(health?.firefly?.php_version || "Unknown")}</span>
        </div>
      </div>
    `
  };

  renderModalBody(state.ui.modal);
}

async function openModal(action, id = "") {
  if (action === "health-check") {
    await loadHealth();
    openHealthModal();
    return;
  }

  const [entity, mode] = action.split("-");

  if (entity === "transaction") {
    await loadReferenceData();
    if (mode === "edit") {
      await loadTransactions();
    }

    const transaction = mode === "edit" ? getTransactionById(id) : null;
    const draft = transaction
      ? {
          type: transaction.type,
          date: formatDateInput(transaction.date),
          account_id: transaction.account_id,
          destination_account_id:
            transaction.type === "transfer" ? transaction.counterpart_id : "",
          counterpart_name:
            transaction.type === "transfer" ? "" : transaction.counterpart_name,
          notes: transaction.notes || "",
          splits: transaction.splits.length
            ? transaction.splits.map((split) => ({
                description: split.description,
                amount: split.amount,
                category_id: split.category.id || "",
                budget_id: split.budget.id || "",
                tags: split.tags || []
              }))
            : getDefaultTransactionDraft().splits
        }
      : getDefaultTransactionDraft();

    state.ui.modal = {
      action,
      entity,
      mode,
      id,
      title: mode === "edit" ? "Edit Transaction" : "Add Transaction",
      subtitle:
        "Expense, income, transfer, and split journals stay in Firefly III but are managed here.",
      primaryLabel: mode === "edit" ? "Save Changes" : "Create Transaction",
      body: `
        <div class="field-grid">
          <label class="field-stack">
            <span class="label">Type</span>
            <select class="input" name="type" data-transaction-type>
              <option value="expense" ${draft.type === "expense" ? "selected" : ""}>Expense</option>
              <option value="income" ${draft.type === "income" ? "selected" : ""}>Income</option>
              <option value="transfer" ${draft.type === "transfer" ? "selected" : ""}>Transfer</option>
            </select>
          </label>
          <label class="field-stack">
            <span class="label">Date</span>
            <input class="input" name="date" type="date" value="${escapeHtml(draft.date)}" />
          </label>
          <label class="field-stack">
            <span class="label">Account</span>
            <select class="input" name="account_id">
              ${getAccountOptions({ selectedId: draft.account_id })}
            </select>
          </label>
          <label class="field-stack ${draft.type === "transfer" ? "" : "hidden"}" data-transfer-only>
            <span class="label">Destination account</span>
            <select class="input" name="destination_account_id">
              ${getAccountOptions({ selectedId: draft.destination_account_id })}
            </select>
          </label>
          <label class="field-stack ${draft.type === "transfer" ? "hidden" : ""}" data-counterpart-only>
            <span class="label">Counterparty</span>
            <input class="input" name="counterpart_name" value="${escapeHtml(draft.counterpart_name || "")}" placeholder="Payee, merchant, or income source" />
          </label>
          <label class="field-stack">
            <span class="label">Notes</span>
            <textarea class="textarea" name="notes" placeholder="Optional notes">${escapeHtml(draft.notes || "")}</textarea>
          </label>
        </div>
        <div class="section-header">
          <div>
            <div class="label">Splits</div>
            <div class="helper">Use one row for a normal transaction or add multiple rows for split journals.</div>
          </div>
          <button type="button" class="btn btn-secondary" id="addSplitBtn">Add Split</button>
        </div>
        <div class="split-list" id="transactionSplitList">
          ${draft.splits.map((split, index) => buildSplitRowMarkup(split, index)).join("")}
        </div>
      `
    };

    renderModalBody(state.ui.modal);
    syncModalFieldVisibility();
    return;
  }

  if (entity === "account") {
    await loadAccounts();
    const account = mode === "edit" ? getAccountByIdFromState(id) : null;

    state.ui.modal = {
      action,
      entity,
      mode,
      id,
      title: mode === "edit" ? "Edit Account" : "Create Account",
      subtitle: "Choose an account style that maps cleanly to Firefly III.",
      primaryLabel: mode === "edit" ? "Save Account" : "Create Account",
      body: `
        <div class="field-grid">
          <label class="field-stack">
            <span class="label">Name</span>
            <input class="input" name="name" value="${escapeHtml(account?.name || "")}" placeholder="Account name" />
          </label>
          <label class="field-stack">
            <span class="label">Type</span>
            <select class="input" name="kind">
              ${["bank", "cash", "savings", "credit", "liability"]
                .map(
                  (kind) => `
                    <option value="${kind}" ${account?.kind === kind ? "selected" : ""}>
                      ${kind}
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>
          <label class="field-stack">
            <span class="label">Opening balance</span>
            <input class="input" name="opening_balance" type="number" step="0.01" value="${escapeHtml(account?.opening_balance || "")}" />
          </label>
          <label class="field-stack">
            <span class="label">Currency code</span>
            <input class="input" name="currency_code" value="${escapeHtml(account?.currency || "INR")}" placeholder="INR" />
          </label>
          <label class="field-stack">
            <span class="label">Notes</span>
            <textarea class="textarea" name="notes">${escapeHtml(account?.notes || "")}</textarea>
          </label>
          <label class="field-stack">
            <span class="label">Active</span>
            <select class="input" name="active">
              <option value="true" ${account?.active !== false ? "selected" : ""}>Active</option>
              <option value="false" ${account?.active === false ? "selected" : ""}>Archived</option>
            </select>
          </label>
        </div>
      `
    };

    renderModalBody(state.ui.modal);
    return;
  }

  if (entity === "budget") {
    await loadBudgets();
    const budget = mode === "edit" ? getBudgetById(id) : null;

    state.ui.modal = {
      action,
      entity,
      mode,
      id,
      title: mode === "edit" ? "Edit Budget" : "Create Budget",
      subtitle: "Manage budget names and simple target settings from adibudget.",
      primaryLabel: mode === "edit" ? "Save Budget" : "Create Budget",
      body: `
        <div class="field-grid">
          <label class="field-stack">
            <span class="label">Name</span>
            <input class="input" name="name" value="${escapeHtml(budget?.name || "")}" />
          </label>
          <label class="field-stack">
            <span class="label">Amount</span>
            <input class="input" name="amount" type="number" step="0.01" value="${escapeHtml(budget?.amount || "")}" />
          </label>
          <label class="field-stack">
            <span class="label">Currency</span>
            <input class="input" name="currency_code" value="${escapeHtml(budget?.currency || "INR")}" />
          </label>
          <label class="field-stack">
            <span class="label">Auto budget type</span>
            <select class="input" name="auto_budget_type">
              ${["reset", "rollover", "adjusted", "none"]
                .map(
                  (value) => `
                    <option value="${value}" ${budget?.auto_budget_type === value ? "selected" : ""}>
                      ${value}
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>
          <label class="field-stack">
            <span class="label">Period</span>
            <select class="input" name="auto_budget_period">
              ${["monthly", "weekly", "yearly", "quarterly", "half_year", "daily"]
                .map(
                  (value) => `
                    <option value="${value}" ${budget?.auto_budget_period === value ? "selected" : ""}>
                      ${value}
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>
          <label class="field-stack">
            <span class="label">Active</span>
            <select class="input" name="active">
              <option value="true" ${budget?.active !== false ? "selected" : ""}>Active</option>
              <option value="false" ${budget?.active === false ? "selected" : ""}>Inactive</option>
            </select>
          </label>
          <label class="field-stack">
            <span class="label">Notes</span>
            <textarea class="textarea" name="notes">${escapeHtml(budget?.notes || "")}</textarea>
          </label>
        </div>
      `
    };

    renderModalBody(state.ui.modal);
    return;
  }

  if (entity === "category") {
    await loadCategories();
    const category = mode === "edit" ? getCategoryById(id) : null;

    state.ui.modal = {
      action,
      entity,
      mode,
      id,
      title: mode === "edit" ? "Edit Category" : "Create Category",
      subtitle: "Categories are reusable transaction classifications.",
      primaryLabel: mode === "edit" ? "Save Category" : "Create Category",
      body: `
        <div class="field-grid">
          <label class="field-stack">
            <span class="label">Name</span>
            <input class="input" name="name" value="${escapeHtml(category?.name || "")}" />
          </label>
          <label class="field-stack">
            <span class="label">Notes</span>
            <textarea class="textarea" name="notes">${escapeHtml(category?.notes || "")}</textarea>
          </label>
        </div>
      `
    };

    renderModalBody(state.ui.modal);
    return;
  }

  if (entity === "tag") {
    await loadTags();
    const tag = mode === "edit" ? getTagById(id) : null;

    state.ui.modal = {
      action,
      entity,
      mode,
      id,
      title: mode === "edit" ? "Edit Tag" : "Create Tag",
      subtitle: "Tags help group transactions and recurring entries.",
      primaryLabel: mode === "edit" ? "Save Tag" : "Create Tag",
      body: `
        <div class="field-grid">
          <label class="field-stack">
            <span class="label">Name</span>
            <input class="input" name="name" value="${escapeHtml(tag?.name || "")}" />
          </label>
          <label class="field-stack">
            <span class="label">Date</span>
            <input class="input" type="date" name="date" value="${escapeHtml(formatDateInput(tag?.date || ""))}" />
          </label>
          <label class="field-stack">
            <span class="label">Description</span>
            <textarea class="textarea" name="description">${escapeHtml(tag?.description || "")}</textarea>
          </label>
        </div>
      `
    };

    renderModalBody(state.ui.modal);
    return;
  }

  if (entity === "recurring") {
    await Promise.all([
      loadRecurring(),
      loadAccounts(),
      loadBudgets(),
      loadCategories(),
      loadTags()
    ]);
    const entry = mode === "edit" ? getRecurringById(id) : null;

    state.ui.modal = {
      action,
      entity,
      mode,
      id,
      title: mode === "edit" ? "Edit Recurring Entry" : "Create Recurring Entry",
      subtitle: "Supported subset: daily, weekly, monthly, or yearly repetitions through the backend adapter.",
      primaryLabel: mode === "edit" ? "Save Recurring Entry" : "Create Recurring Entry",
      body: `
        <div class="field-grid">
          <label class="field-stack">
            <span class="label">Title</span>
            <input class="input" name="title" value="${escapeHtml(entry?.title || "")}" />
          </label>
          <label class="field-stack">
            <span class="label">Type</span>
            <select class="input" name="type" data-recurring-type>
              <option value="expense" ${entry?.type === "expense" ? "selected" : ""}>Expense</option>
              <option value="income" ${entry?.type === "income" ? "selected" : ""}>Income</option>
              <option value="transfer" ${entry?.type === "transfer" ? "selected" : ""}>Transfer</option>
            </select>
          </label>
          <label class="field-stack">
            <span class="label">Amount</span>
            <input class="input" type="number" step="0.01" name="amount" value="${escapeHtml(entry?.amount || "")}" />
          </label>
          <label class="field-stack">
            <span class="label">Start date</span>
            <input class="input" type="date" name="first_date" value="${escapeHtml(formatDateInput(entry?.first_date || new Date()))}" />
          </label>
          <label class="field-stack">
            <span class="label">Repeat until</span>
            <input class="input" type="date" name="repeat_until" value="${escapeHtml(formatDateInput(entry?.repeat_until || ""))}" />
          </label>
          <label class="field-stack">
            <span class="label">Account</span>
            <select class="input" name="account_id">
              ${getAccountOptions({ selectedId: entry?.account_id || "" })}
            </select>
          </label>
          <label class="field-stack ${entry?.type === "transfer" ? "" : "hidden"}" data-recurring-transfer-only>
            <span class="label">Destination account</span>
            <select class="input" name="destination_account_id">
              ${getAccountOptions({ selectedId: entry?.counterpart_id || "" })}
            </select>
          </label>
          <label class="field-stack ${entry?.type === "transfer" ? "hidden" : ""}" data-recurring-counterpart-only>
            <span class="label">Counterparty</span>
            <input class="input" name="counterpart_name" value="${escapeHtml(entry?.counterpart_name || "")}" />
          </label>
          <label class="field-stack">
            <span class="label">Frequency</span>
            <select class="input" name="frequency_type">
              ${["daily", "weekly", "monthly", "yearly"]
                .map(
                  (value) => `
                    <option value="${value}" ${entry?.frequency_type === value ? "selected" : ""}>
                      ${value}
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>
          <label class="field-stack">
            <span class="label">Moment</span>
            <input class="input" name="frequency_moment" value="${escapeHtml(entry?.frequency_moment || "1")}" />
            <span class="helper">For monthly/yearly use day number. For weekly use weekday number.</span>
          </label>
          <label class="field-stack">
            <span class="label">Skip</span>
            <input class="input" type="number" min="0" name="frequency_skip" value="${escapeHtml(entry?.frequency_skip || 0)}" />
          </label>
          <label class="field-stack">
            <span class="label">Weekend rule</span>
            <select class="input" name="frequency_weekend">
              ${[
                ["1", "Do nothing"],
                ["2", "Skip creation"],
                ["3", "Move to Friday"],
                ["4", "Move to Monday"]
              ]
                .map(
                  ([value, label]) => `
                    <option value="${value}" ${String(entry?.frequency_weekend || 1) === value ? "selected" : ""}>
                      ${label}
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>
          <label class="field-stack">
            <span class="label">Category</span>
            <select class="input" name="category_id">
              ${getCategoryOptions(entry?.category_id || "", true)}
            </select>
          </label>
          <label class="field-stack">
            <span class="label">Budget</span>
            <select class="input" name="budget_id">
              ${getBudgetOptions(entry?.budget_id || "", true)}
            </select>
          </label>
          <label class="field-stack">
            <span class="label">Tags</span>
            <input class="input" name="tags" value="${escapeHtml(
              Array.isArray(entry?.tags) ? entry.tags.join(", ") : ""
            )}" />
          </label>
          <label class="field-stack">
            <span class="label">Description</span>
            <textarea class="textarea" name="description">${escapeHtml(entry?.description || "")}</textarea>
          </label>
          <label class="field-stack">
            <span class="label">Transaction description</span>
            <input class="input" name="transaction_description" value="${escapeHtml(entry?.transaction_description || "")}" />
          </label>
          <label class="field-stack">
            <span class="label">Notes</span>
            <textarea class="textarea" name="notes">${escapeHtml(entry?.notes || "")}</textarea>
          </label>
          <label class="field-stack">
            <span class="label">Active</span>
            <select class="input" name="active">
              <option value="true" ${entry?.active !== false ? "selected" : ""}>Active</option>
              <option value="false" ${entry?.active === false ? "selected" : ""}>Inactive</option>
            </select>
          </label>
        </div>
      `
    };

    renderModalBody(state.ui.modal);
    syncModalFieldVisibility();
  }
}

function getModalElement(name) {
  const root = document.getElementById("modalBody");
  return root ? root.querySelector(`[name="${name}"]`) : null;
}

function addSplitRow(split = {}) {
  const container = document.getElementById("transactionSplitList");
  if (!container) {
    return;
  }

  const index = container.querySelectorAll("[data-split-row]").length;
  container.insertAdjacentHTML("beforeend", buildSplitRowMarkup(split, index));
}

function syncModalFieldVisibility() {
  const transactionType = getModalElement("type");
  const transferOnly = document.querySelectorAll("[data-transfer-only]");
  const counterpartOnly = document.querySelectorAll("[data-counterpart-only]");
  const recurringTransferOnly = document.querySelectorAll(
    "[data-recurring-transfer-only]"
  );
  const recurringCounterpartOnly = document.querySelectorAll(
    "[data-recurring-counterpart-only]"
  );

  if (transactionType) {
    const isTransfer = transactionType.value === "transfer";
    transferOnly.forEach((element) => {
      element.classList.toggle("hidden", !isTransfer);
    });
    counterpartOnly.forEach((element) => {
      element.classList.toggle("hidden", isTransfer);
    });
  }

  const recurringType = document.querySelector('[name="type"][data-recurring-type]');
  if (recurringType) {
    const isTransfer = recurringType.value === "transfer";
    recurringTransferOnly.forEach((element) => {
      element.classList.toggle("hidden", !isTransfer);
    });
    recurringCounterpartOnly.forEach((element) => {
      element.classList.toggle("hidden", isTransfer);
    });
  }
}

function getSplitPayloads(notes) {
  return [...document.querySelectorAll("[data-split-row]")]
    .map((row) => {
      const categoryId = row.querySelector('[name="split_category_id"]')?.value || "";
      const budgetId = row.querySelector('[name="split_budget_id"]')?.value || "";

      return {
        description: row.querySelector('[name="split_description"]')?.value || "",
        amount: row.querySelector('[name="split_amount"]')?.value || "",
        category_id: categoryId,
        category_name: categoryId ? findCategoryNameById(categoryId) : "",
        budget_id: budgetId,
        budget_name: budgetId ? findBudgetNameById(budgetId) : "",
        tags: row.querySelector('[name="split_tags"]')?.value || "",
        notes
      };
    })
    .filter((split) => split.description || split.amount);
}

function getModalPayload() {
  const modal = state.ui.modal;

  if (!modal) {
    return null;
  }

  if (modal.entity === "transaction") {
    const notes = getModalElement("notes")?.value || "";
    return {
      type: getModalElement("type")?.value || "expense",
      date: getModalElement("date")?.value || formatDateInput(new Date()),
      account_id: getModalElement("account_id")?.value || "",
      destination_account_id: getModalElement("destination_account_id")?.value || "",
      counterpart_name: getModalElement("counterpart_name")?.value || "",
      notes,
      splits: getSplitPayloads(notes)
    };
  }

  if (modal.entity === "account") {
    return {
      name: getModalElement("name")?.value || "",
      kind: getModalElement("kind")?.value || "bank",
      opening_balance: getModalElement("opening_balance")?.value || "",
      currency_code: getModalElement("currency_code")?.value || "INR",
      notes: getModalElement("notes")?.value || "",
      active: getModalElement("active")?.value || "true"
    };
  }

  if (modal.entity === "budget") {
    return {
      name: getModalElement("name")?.value || "",
      amount: getModalElement("amount")?.value || "",
      currency_code: getModalElement("currency_code")?.value || "INR",
      auto_budget_type: getModalElement("auto_budget_type")?.value || "reset",
      auto_budget_period: getModalElement("auto_budget_period")?.value || "monthly",
      active: getModalElement("active")?.value || "true",
      notes: getModalElement("notes")?.value || ""
    };
  }

  if (modal.entity === "category") {
    return {
      name: getModalElement("name")?.value || "",
      notes: getModalElement("notes")?.value || ""
    };
  }

  if (modal.entity === "tag") {
    return {
      name: getModalElement("name")?.value || "",
      date: getModalElement("date")?.value || "",
      description: getModalElement("description")?.value || ""
    };
  }

  if (modal.entity === "recurring") {
    const categoryId = getModalElement("category_id")?.value || "";
    const budgetId = getModalElement("budget_id")?.value || "";

    return {
      title: getModalElement("title")?.value || "",
      type: getModalElement("type")?.value || "expense",
      amount: getModalElement("amount")?.value || "",
      first_date: getModalElement("first_date")?.value || "",
      repeat_until: getModalElement("repeat_until")?.value || "",
      account_id: getModalElement("account_id")?.value || "",
      destination_account_id: getModalElement("destination_account_id")?.value || "",
      counterpart_name: getModalElement("counterpart_name")?.value || "",
      frequency_type: getModalElement("frequency_type")?.value || "monthly",
      frequency_moment: getModalElement("frequency_moment")?.value || "1",
      frequency_skip: getModalElement("frequency_skip")?.value || "0",
      frequency_weekend: getModalElement("frequency_weekend")?.value || "1",
      category_id: categoryId,
      category_name: categoryId ? findCategoryNameById(categoryId) : "",
      budget_id: budgetId,
      budget_name: budgetId ? findBudgetNameById(budgetId) : "",
      tags: getModalElement("tags")?.value || "",
      description: getModalElement("description")?.value || "",
      transaction_description:
        getModalElement("transaction_description")?.value || "",
      notes: getModalElement("notes")?.value || "",
      active: getModalElement("active")?.value || "true"
    };
  }

  return {};
}

function getCurrentPage() {
  return window.currentPage || "dashboard";
}

async function refreshCurrentPage() {
  const page = getCurrentPage();
  await loadPageData(page);
}

function closeModal() {
  const modal = document.getElementById("globalModal");
  if (modal) {
    modal.classList.add("hidden");
  }
  state.ui.modal = null;
}

function showModalError(message) {
  const errorBox = document.getElementById("modalError");
  if (!errorBox) {
    return;
  }

  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

async function submitModal() {
  const modal = state.ui.modal;

  if (!modal) {
    return;
  }

  if (modal.action === "health-check") {
    await loadHealth();
    openHealthModal();
    if (getCurrentPage() === "settings") {
      renderSettingsPage();
    }
    return;
  }

  const payload = getModalPayload();

  try {
    if (modal.entity === "transaction") {
      const path =
        modal.mode === "edit"
          ? `/transactions/${modal.id}`
          : "/transactions";

      await requestJSON(path, {
        method: modal.mode === "edit" ? "PUT" : "POST",
        body: payload
      });
      await Promise.all([loadTransactions(), loadAccounts(), loadBudgets()]);
    }

    if (modal.entity === "account") {
      const path = modal.mode === "edit" ? `/accounts/${modal.id}` : "/accounts";
      await requestJSON(path, {
        method: modal.mode === "edit" ? "PUT" : "POST",
        body: payload
      });
      await loadAccounts();
    }

    if (modal.entity === "budget") {
      const path = modal.mode === "edit" ? `/budgets/${modal.id}` : "/budgets";
      await requestJSON(path, {
        method: modal.mode === "edit" ? "PUT" : "POST",
        body: payload
      });
      await loadBudgets();
    }

    if (modal.entity === "category") {
      const path =
        modal.mode === "edit" ? `/categories/${modal.id}` : "/categories";
      await requestJSON(path, {
        method: modal.mode === "edit" ? "PUT" : "POST",
        body: payload
      });
      await loadCategories();
    }

    if (modal.entity === "tag") {
      const path = modal.mode === "edit" ? `/tags/${modal.id}` : "/tags";
      await requestJSON(path, {
        method: modal.mode === "edit" ? "PUT" : "POST",
        body: payload
      });
      await loadTags();
    }

    if (modal.entity === "recurring") {
      const path =
        modal.mode === "edit" ? `/recurring/${modal.id}` : "/recurring";
      await requestJSON(path, {
        method: modal.mode === "edit" ? "PUT" : "POST",
        body: payload
      });
      await loadRecurring();
    }

    closeModal();
    await refreshCurrentPage();
  } catch (error) {
    showModalError(error.message);
  }
}

async function deleteResource(path, reloadFn) {
  await requestJSON(path, { method: "DELETE" });
  await reloadFn();
  await refreshCurrentPage();
}

async function handleAction(action, id) {
  if (action.endsWith("-edit")) {
    await openModal(action, id);
    return;
  }

  if (action === "transaction-delete") {
    if (!window.confirm("Delete this transaction?")) {
      return;
    }

    await deleteResource(`/transactions/${id}`, loadTransactions);
    return;
  }

  if (action === "account-archive") {
    if (!window.confirm("Archive this account?")) {
      return;
    }

    await requestJSON(`/accounts/${id}/archive`, { method: "POST" });
    await loadAccounts();
    await refreshCurrentPage();
    return;
  }

  if (action === "budget-delete") {
    if (!window.confirm("Delete this budget?")) {
      return;
    }

    await deleteResource(`/budgets/${id}`, loadBudgets);
    return;
  }

  if (action === "category-delete") {
    if (!window.confirm("Delete this category?")) {
      return;
    }

    await deleteResource(`/categories/${id}`, loadCategories);
    return;
  }

  if (action === "tag-delete") {
    if (!window.confirm("Delete this tag?")) {
      return;
    }

    await deleteResource(`/tags/${id}`, loadTags);
    return;
  }

  if (action === "recurring-delete") {
    if (!window.confirm("Delete this recurring entry?")) {
      return;
    }

    await deleteResource(`/recurring/${id}`, loadRecurring);
  }
}

window.adibudgetApp = {
  state,
  pageMeta,
  requestJSON,
  escapeHtml,
  formatCurrency,
  formatDate,
  formatDateInput,
  loadAccounts,
  loadTransactions,
  loadBudgets,
  loadCategories,
  loadTags,
  loadRecurring,
  loadReferenceData,
  loadPageData,
  renderLoadingState,
  getAccountOptions,
  getBudgetOptions,
  getCategoryOptions,
  renderTransactionsTable,
  renderTransactionFilters,
  clearTransactionFilters,
  setTransactionFilter,
  openModal,
  closeModal,
  submitModal,
  handleAction,
  addSplitRow,
  syncModalFieldVisibility,
  loadHealth,
  refreshCurrentPage,
  getPageTitle
};
