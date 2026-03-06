(function extendAdiBudgetV2() {
  const app = window.adibudgetApp;

  if (!app) {
    return;
  }

  app.pageMeta.review = {
    title: "Monthly Review",
    subtitle: "A faster monthly read than digging through raw Firefly screens."
  };
  app.pageMeta.search = {
    title: "Search",
    subtitle: "Search transactions across merchants, tags, accounts, categories, and months."
  };

  app.state.quickAdd = {
    draft: null,
    suggestions: null
  };
  app.state.search = {
    q: "",
    month: "",
    type: "",
    account_id: "",
    category_id: "",
    tag: "",
    amount_min: "",
    amount_max: "",
    results: null
  };
  app.state.review = {
    month: "",
    data: null
  };
  app.state.budgetProjection = null;

  const originalLoadPageData = app.loadPageData;
  const originalOpenModal = app.openModal;
  const originalSubmitModal = app.submitModal;

  function getCurrentMonthKey() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  function setModalError(message = "") {
    const errorBox = document.getElementById("modalError");
    if (!errorBox) {
      return;
    }

    if (!message) {
      errorBox.textContent = "";
      errorBox.classList.add("hidden");
      return;
    }

    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function setModalContent(modal) {
    const body = document.getElementById("modalBody");
    const title = document.getElementById("modalTitle");
    const subtitle = document.getElementById("modalSubtitle");
    const primaryAction = document.getElementById("modalPrimaryAction");

    if (!body || !title || !subtitle || !primaryAction) {
      return;
    }

    setModalError("");
    app.state.ui.modal = modal;
    title.textContent = modal.title;
    subtitle.textContent = modal.subtitle;
    primaryAction.textContent = modal.primaryLabel;
    primaryAction.dataset.action = modal.action;
    body.innerHTML = modal.body;
  }

  function openModalShell() {
    const modal = document.getElementById("globalModal");
    if (modal) {
      modal.classList.remove("hidden");
    }
  }

  async function loadSuggestions(query = "") {
    const result = await app.requestJSON("/api/suggestions", {
      query: { q: query }
    });
    app.state.quickAdd.suggestions = result;
    return result;
  }

  async function previewQuickAdd(input, overrides = {}) {
    const result = await app.requestJSON("/api/transactions/quick", {
      method: "POST",
      body: {
        preview: true,
        input,
        ...overrides
      }
    });
    app.state.quickAdd.draft = result;
    return result;
  }

  function renderQuickAddSuggestions(suggestions) {
    if (!suggestions) {
      return "";
    }

    const merchantChips = (suggestions.recentMerchants || [])
      .slice(0, 6)
      .map(
        (merchant) => `
          <button
            type="button"
            class="tag-chip interactive-chip"
            data-quick-suggestion="${app.escapeHtml(merchant.name)}"
          >
            ${app.escapeHtml(merchant.name)}
          </button>
        `
      )
      .join("");

    const recentSearches = (suggestions.recentSearches || [])
      .slice(0, 4)
      .map((entry) => `<span class="chip">${app.escapeHtml(entry.query)}</span>`)
      .join("");
    const favoriteAccounts = (suggestions.favorites?.accounts || [])
      .slice(0, 4)
      .map((account) => `<span class="chip">${app.escapeHtml(account.name)}</span>`)
      .join("");
    const favoriteCategories = (suggestions.favorites?.categories || [])
      .slice(0, 4)
      .map((category) => `<span class="chip">${app.escapeHtml(category.name)}</span>`)
      .join("");

    return `
      <div class="field-grid">
        <div class="field-stack">
          <span class="label">Favorite accounts</span>
          <div class="chip-list">
            ${favoriteAccounts || '<span class="table-note">No favorites yet</span>'}
          </div>
        </div>
        <div class="field-stack">
          <span class="label">Favorite categories</span>
          <div class="chip-list">
            ${favoriteCategories || '<span class="table-note">No favorites yet</span>'}
          </div>
        </div>
      </div>
      <div class="field-stack">
        <span class="label">Recent merchants</span>
        <div class="chip-list">
          ${merchantChips || '<span class="table-note">No merchant memory yet</span>'}
        </div>
      </div>
      <div class="field-stack">
        <span class="label">Recent searches</span>
        <div class="chip-list">
          ${recentSearches || '<span class="table-note">No recent searches</span>'}
        </div>
      </div>
    `;
  }

  function renderQuickAddPreview(preview) {
    if (!preview) {
      return `
        <div class="placeholder-state">
          <div class="row-title">Quick parse preview</div>
          <div class="sub">Type a one-line entry like "450 uber icici travel" and hit Parse.</div>
        </div>
      `;
    }

    return `
      <div class="card quick-preview-card">
        <div class="section-header">
          <div>
            <div class="label">Parser Preview</div>
            <div class="sub">Confidence ${(preview.confidence * 100).toFixed(0)}%</div>
          </div>
          <div class="chip">${app.escapeHtml(preview.type)}</div>
        </div>
        <div class="row-meta">
          <span class="chip">${app.escapeHtml(app.formatCurrency(preview.amount || 0))}</span>
          <span class="chip">${app.escapeHtml(preview.account_name || "No account yet")}</span>
          <span class="chip">${app.escapeHtml(preview.category_name || "No category yet")}</span>
          <span class="chip">${app.escapeHtml(preview.date || "")}</span>
        </div>
        <div class="sub">${app.escapeHtml(preview.description || "No description")}</div>
      </div>
    `;
  }

  function buildQuickAddModalBody(suggestions, preview) {
    const defaults = suggestions?.quickEntryDefaults || {};
    const resolved = preview || {
      type: defaults.type || "expense",
      date: new Date().toISOString().slice(0, 10),
      account_id: defaults.account_id || "",
      category_id: defaults.category_id || "",
      description: "",
      amount: ""
    };

    return `
      <div class="stack">
        <div class="field-grid">
          <label class="field-stack quick-input-span">
            <span class="label">Quick input</span>
            <div class="inline-form">
              <input
                id="quickInputLine"
                class="input"
                type="text"
                placeholder="125 swiggy hdfc food"
                value="${app.escapeHtml(app.state.quickAdd.input || "")}"
                autofocus
              />
              <button type="button" class="btn btn-secondary" id="quickAddParseBtn">
                Parse
              </button>
            </div>
            <span class="helper">Examples: "125 swiggy hdfc food", "5000 salary icici income"</span>
          </label>
        </div>

        ${renderQuickAddPreview(preview)}

        <div class="field-grid">
          <label class="field-stack">
            <span class="label">Amount</span>
            <input id="quickAmount" class="input" type="number" step="0.01" value="${app.escapeHtml(resolved.amount || "")}" />
          </label>
          <label class="field-stack">
            <span class="label">Type</span>
            <select id="quickType" class="input">
              <option value="expense" ${resolved.type === "expense" ? "selected" : ""}>Expense</option>
              <option value="income" ${resolved.type === "income" ? "selected" : ""}>Income</option>
              <option value="transfer" ${resolved.type === "transfer" ? "selected" : ""}>Transfer</option>
            </select>
          </label>
          <label class="field-stack">
            <span class="label">Account</span>
            <select id="quickAccount" class="input">
              ${app.getAccountOptions({ selectedId: resolved.account_id || defaults.account_id || "" })}
            </select>
          </label>
          <label class="field-stack quick-destination-wrap ${resolved.type === "transfer" ? "" : "hidden"}">
            <span class="label">Destination</span>
            <select id="quickDestinationAccount" class="input">
              ${app.getAccountOptions({ selectedId: resolved.destination_account_id || "" })}
            </select>
          </label>
          <label class="field-stack">
            <span class="label">Category</span>
            <select id="quickCategory" class="input">
              ${app.getCategoryOptions(resolved.category_id || defaults.category_id || "", true)}
            </select>
          </label>
          <label class="field-stack">
            <span class="label">Date</span>
            <input id="quickDate" class="input" type="date" value="${app.escapeHtml(resolved.date || new Date().toISOString().slice(0, 10))}" />
          </label>
          <label class="field-stack">
            <span class="label">Description</span>
            <input id="quickDescription" class="input" type="text" value="${app.escapeHtml(resolved.description || "")}" placeholder="Merchant or note" />
          </label>
        </div>

        ${renderQuickAddSuggestions(suggestions)}
      </div>
    `;
  }

  async function openQuickAddModal() {
    await Promise.all([app.loadAccounts(), app.loadCategories()]);
    const suggestions = await loadSuggestions("");
    setModalContent({
      action: "quick-add",
      entity: "quick",
      title: "Quick Add",
      subtitle: "Fast entry for the transactions you repeat every week.",
      primaryLabel: "Add Fast",
      body: buildQuickAddModalBody(suggestions, app.state.quickAdd.draft)
    });
    syncQuickTransferVisibility();
  }

  function syncQuickTransferVisibility() {
    const typeSelect = document.getElementById("quickType");
    const destinationWrap = document.querySelector(".quick-destination-wrap");

    if (typeSelect && destinationWrap) {
      destinationWrap.classList.toggle("hidden", typeSelect.value !== "transfer");
    }
  }

  function getQuickAddPayload() {
    return {
      input: document.getElementById("quickInputLine")?.value || "",
      amount: document.getElementById("quickAmount")?.value || "",
      type: document.getElementById("quickType")?.value || "expense",
      account_id: document.getElementById("quickAccount")?.value || "",
      destination_account_id:
        document.getElementById("quickDestinationAccount")?.value || "",
      category_id: document.getElementById("quickCategory")?.value || "",
      date: document.getElementById("quickDate")?.value || new Date().toISOString().slice(0, 10),
      description: document.getElementById("quickDescription")?.value || ""
    };
  }

  async function rerenderQuickAdd(preview) {
    const suggestions = app.state.quickAdd.suggestions || (await loadSuggestions(""));
    app.state.quickAdd.draft = preview;
    setModalContent({
      action: "quick-add",
      entity: "quick",
      title: "Quick Add",
      subtitle: "Fast entry for the transactions you repeat every week.",
      primaryLabel: "Add Fast",
      body: buildQuickAddModalBody(suggestions, preview)
    });
    syncQuickTransferVisibility();
  }

  async function runQuickParse() {
    const input = document.getElementById("quickInputLine")?.value || "";
    app.state.quickAdd.input = input;

    try {
      const preview = await previewQuickAdd(input, getQuickAddPayload());
      await rerenderQuickAdd(preview);
    } catch (error) {
      setModalError(error.message);
    }
  }

  function renderProjectionSummary(containerId, projection) {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    if (!projection) {
      container.innerHTML = app.renderLoadingState(
        "Loading projection",
        "Estimating budget pace for the current month."
      );
      return;
    }

    const warningCount = projection.budgets.filter(
      (budget) => budget.warning === "warning"
    ).length;

    container.innerHTML = `
      <div class="card metric-card">
        <div class="label">Budgeted</div>
        <div class="metric-value">${app.escapeHtml(app.formatCurrency(projection.summary.total_budgeted))}</div>
        <div class="sub">Across active budgets</div>
      </div>
      <div class="card metric-card">
        <div class="label">Projected Month-End</div>
        <div class="metric-value">${app.escapeHtml(app.formatCurrency(projection.summary.total_projected))}</div>
        <div class="sub">Current pace extrapolated</div>
      </div>
      <div class="card metric-card">
        <div class="label">Spent So Far</div>
        <div class="metric-value">${app.escapeHtml(app.formatCurrency(projection.summary.total_spent))}</div>
        <div class="sub">${projection.summary.remainingDays} day(s) remaining</div>
      </div>
      <div class="card metric-card">
        <div class="label">Warning Budgets</div>
        <div class="metric-value">${warningCount}</div>
        <div class="sub">Projected to overshoot or already close</div>
      </div>
    `;
  }

  function renderDashboardProjection(projection) {
    const projectionContainer = document.getElementById("dashboardBudgetProjection");
    const memoryContainer = document.getElementById("dashboardQuickMemory");

    if (projectionContainer) {
      if (!projection || !projection.budgets.length) {
        projectionContainer.innerHTML = `
          <div class="placeholder-state">
            <div class="row-title">No budget projection yet</div>
            <div class="sub">Create budgets to see month-end projections here.</div>
          </div>
        `;
      } else {
        projectionContainer.innerHTML = `
          <div class="data-list">
            ${projection.budgets
              .slice(0, 4)
              .map(
                (budget) => `
                  <div class="data-list-row">
                    <div class="row-title">${app.escapeHtml(budget.name)}</div>
                    <div class="row-meta">
                      <span class="chip">${
                        budget.warning === "warning"
                          ? "Close to limit"
                          : budget.warning === "watch"
                            ? "Watch pace"
                            : "Healthy"
                      }</span>
                      <span class="chip">${app.escapeHtml(app.formatCurrency(budget.safe_to_spend_daily, budget.currency))}/day safe</span>
                    </div>
                    <div class="table-note">
                      Projected ${app.escapeHtml(app.formatCurrency(budget.projected_month_end, budget.currency))}
                      of ${app.escapeHtml(app.formatCurrency(budget.amount, budget.currency))}
                    </div>
                  </div>
                `
              )
              .join("")}
          </div>
        `;
      }
    }

    if (memoryContainer) {
      const suggestions = app.state.quickAdd.suggestions;
      memoryContainer.innerHTML = suggestions
        ? renderQuickAddSuggestions(suggestions)
        : `
          <div class="placeholder-state">
            <div class="row-title">No quick-entry memory yet</div>
            <div class="sub">Use Quick Add and Search to build recent history.</div>
          </div>
        `;
    }
  }

  function renderBudgetProjectionDetails(projection) {
    renderProjectionSummary("budgetProjectionSummary", projection);

    const budgetsGrid = document.getElementById("budgetsGrid");
    if (!budgetsGrid || !projection) {
      return;
    }

    projection.budgets.forEach((item) => {
      const card = budgetsGrid.querySelector(`[data-budget-id="${item.id}"]`);
      if (!card) {
        return;
      }

      const footer = document.createElement("div");
      footer.className = "projection-footer";
      footer.innerHTML = `
        <div class="chip-list">
          <span class="chip">${app.escapeHtml(app.formatCurrency(item.projected_month_end, item.currency))} projected</span>
          <span class="chip">${app.escapeHtml(app.formatCurrency(item.safe_to_spend_daily, item.currency))}/day safe</span>
          <span class="chip">${app.escapeHtml(item.warning)}</span>
        </div>
      `;
      card.appendChild(footer);
    });
  }

  async function loadBudgetProjection(month = "") {
    const result = await app.requestJSON("/api/budgets/projection", {
      query: {
        month: month || getCurrentMonthKey()
      }
    });
    app.state.budgetProjection = result;
    return result;
  }

  async function loadMonthlyReview(month = "") {
    const effectiveMonth = month || app.state.review.month || getCurrentMonthKey();
    const result = await app.requestJSON("/api/review/monthly", {
      query: { month: effectiveMonth }
    });
    app.state.review.month = effectiveMonth;
    app.state.review.data = result;
    return result;
  }

  function renderListOrEmpty(items, renderItem, emptyLabel) {
    if (!items || !items.length) {
      return `<div class="placeholder-state"><div class="sub">${app.escapeHtml(emptyLabel)}</div></div>`;
    }

    return `<div class="data-list">${items.map(renderItem).join("")}</div>`;
  }

  function renderMonthlyReview() {
    const data = app.state.review.data;
    if (!data) {
      return;
    }

    const monthInput = document.getElementById("reviewMonthInput");
    const metrics = document.getElementById("monthlyReviewMetrics");
    const categories = document.getElementById("monthlyReviewCategories");
    const merchants = document.getElementById("monthlyReviewMerchants");
    const unusual = document.getElementById("monthlyReviewUnusual");
    const recent = document.getElementById("monthlyReviewRecent");

    if (monthInput) {
      monthInput.value = data.month;
    }

    if (metrics) {
      metrics.innerHTML = `
        <div class="card metric-card">
          <div class="label">Income</div>
          <div class="metric-value">${app.escapeHtml(app.formatCurrency(data.totals.income))}</div>
          <div class="sub">Delta vs prev: ${app.escapeHtml(app.formatCurrency(data.comparison.income_delta))}</div>
        </div>
        <div class="card metric-card">
          <div class="label">Expense</div>
          <div class="metric-value">${app.escapeHtml(app.formatCurrency(data.totals.expense))}</div>
          <div class="sub">Delta vs prev: ${app.escapeHtml(app.formatCurrency(data.comparison.expense_delta))}</div>
        </div>
        <div class="card metric-card">
          <div class="label">Savings</div>
          <div class="metric-value">${app.escapeHtml(app.formatCurrency(data.totals.savings))}</div>
          <div class="sub">Delta vs prev: ${app.escapeHtml(app.formatCurrency(data.comparison.savings_delta))}</div>
        </div>
        <div class="card metric-card">
          <div class="label">Previous Month</div>
          <div class="metric-value">${app.escapeHtml(data.comparison.previousMonth)}</div>
          <div class="sub">Comparison baseline</div>
        </div>
      `;
    }

    if (categories) {
      categories.innerHTML = renderListOrEmpty(
        data.topCategories,
        (item) => `
          <div class="data-list-row">
            <div class="row-title">${app.escapeHtml(item.name)}</div>
            <div class="value">${app.escapeHtml(app.formatCurrency(item.amount))}</div>
          </div>
        `,
        "No category spend yet for this month."
      );
    }

    if (merchants) {
      merchants.innerHTML = renderListOrEmpty(
        data.biggestMerchants,
        (item) => `
          <div class="data-list-row">
            <div class="row-title">${app.escapeHtml(item.name)}</div>
            <div class="value">${app.escapeHtml(app.formatCurrency(item.amount))}</div>
          </div>
        `,
        "No merchant activity yet for this month."
      );
    }

    if (unusual) {
      unusual.innerHTML = renderListOrEmpty(
        data.unusualTransactions,
        (item) => `
          <div class="data-list-row">
            <div class="row-title">${app.escapeHtml(item.description)}</div>
            <div class="sub">${app.escapeHtml(item.account_name || "Unknown account")} · ${app.escapeHtml(item.category_name || "No category")}</div>
            <div class="value negative">${app.escapeHtml(app.formatCurrency(item.amount))}</div>
          </div>
        `,
        "No unusual transactions detected with the current heuristic."
      );
    }

    if (recent) {
      recent.innerHTML = renderListOrEmpty(
        data.recentTransactions,
        (item) => `
          <div class="data-list-row">
            <div class="row-title">${app.escapeHtml(item.description)}</div>
            <div class="sub">${app.escapeHtml(app.formatDate(item.date))} · ${app.escapeHtml(item.account_name || "Unknown account")}</div>
            <div class="value ${item.type === "income" ? "positive" : "negative"}">
              ${app.escapeHtml(app.formatCurrency(item.amount))}
            </div>
          </div>
        `,
        "No recent activity in this month."
      );
    }
  }

  async function runSearch() {
    const params = {
      q: app.state.search.q,
      month: app.state.search.month,
      type: app.state.search.type,
      account_id: app.state.search.account_id,
      category_id: app.state.search.category_id,
      tag: app.state.search.tag,
      amount_min: app.state.search.amount_min,
      amount_max: app.state.search.amount_max
    };
    const result = await app.requestJSON("/api/search", {
      query: params
    });
    app.state.search.results = result;
    return result;
  }

  function renderSearchPage() {
    const filters = document.getElementById("searchFilters");
    const summary = document.getElementById("searchSummary");
    const results = document.getElementById("searchResults");

    if (!filters || !summary || !results) {
      return;
    }

    filters.innerHTML = `
      <label class="field-stack">
        <span class="label">Query</span>
        <input class="input" id="searchQueryInput" type="search" value="${app.escapeHtml(app.state.search.q || "")}" />
      </label>
      <label class="field-stack">
        <span class="label">Month</span>
        <input class="input" id="searchMonthInput" type="month" value="${app.escapeHtml(app.state.search.month || "")}" />
      </label>
      <label class="field-stack">
        <span class="label">Type</span>
        <select class="input" id="searchTypeInput">
          <option value="">All</option>
          <option value="expense" ${app.state.search.type === "expense" ? "selected" : ""}>Expense</option>
          <option value="income" ${app.state.search.type === "income" ? "selected" : ""}>Income</option>
          <option value="transfer" ${app.state.search.type === "transfer" ? "selected" : ""}>Transfer</option>
        </select>
      </label>
      <label class="field-stack">
        <span class="label">Account</span>
        <select class="input" id="searchAccountInput">
          ${app.getAccountOptions({ selectedId: app.state.search.account_id })}
        </select>
      </label>
      <label class="field-stack">
        <span class="label">Category</span>
        <select class="input" id="searchCategoryInput">
          ${app.getCategoryOptions(app.state.search.category_id, true)}
        </select>
      </label>
      <label class="field-stack">
        <span class="label">Tag</span>
        <input class="input" id="searchTagInput" type="text" value="${app.escapeHtml(app.state.search.tag || "")}" />
      </label>
      <label class="field-stack">
        <span class="label">Min Amount</span>
        <input class="input" id="searchAmountMinInput" type="number" step="0.01" value="${app.escapeHtml(app.state.search.amount_min || "")}" />
      </label>
      <label class="field-stack">
        <span class="label">Max Amount</span>
        <input class="input" id="searchAmountMaxInput" type="number" step="0.01" value="${app.escapeHtml(app.state.search.amount_max || "")}" />
      </label>
    `;

    const searchResult = app.state.search.results;

    summary.innerHTML = searchResult
      ? `
        <div class="section-header">
          <div>
            <div class="value">${searchResult.count} result(s)</div>
            <div class="sub">
              Income ${app.escapeHtml(app.formatCurrency(searchResult.summary.income))} ·
              Expense ${app.escapeHtml(app.formatCurrency(searchResult.summary.expense))}
            </div>
          </div>
          <button type="button" class="btn btn-primary" id="runSearchBtn">Run Search</button>
        </div>
      `
      : `
        <div class="section-header">
          <div>
            <div class="value">Search transactions</div>
            <div class="sub">Use the filters above to search across your Firefly-backed history.</div>
          </div>
          <button type="button" class="btn btn-primary" id="runSearchBtn">Run Search</button>
        </div>
      `;

    if (!searchResult || !searchResult.results.length) {
      results.innerHTML = `
        <div class="placeholder-state">
          <div class="row-title">No search results yet</div>
          <div class="sub">Run a search or adjust the filters.</div>
        </div>
      `;
      return;
    }

    results.innerHTML = `
      <div class="data-list">
        ${searchResult.results
          .map(
            (transaction) => `
              <div class="data-list-row">
                <div class="section-header">
                  <div>
                    <div class="row-title">${app.escapeHtml(transaction.description)}</div>
                    <div class="sub">${app.escapeHtml(app.formatDate(transaction.date))} · ${app.escapeHtml(transaction.account_name || "Unknown account")}</div>
                  </div>
                  <div class="value ${transaction.type === "income" ? "positive" : "negative"}">
                    ${app.escapeHtml(app.formatCurrency(transaction.amount, transaction.currency))}
                  </div>
                </div>
                <div class="row-meta">
                  <span class="chip">${app.escapeHtml(transaction.type)}</span>
                  <span class="chip">${app.escapeHtml(transaction.category_name || "No category")}</span>
                  ${
                    transaction.budget_name
                      ? `<span class="chip">${app.escapeHtml(transaction.budget_name)}</span>`
                      : ""
                  }
                  ${
                    transaction.tags && transaction.tags.length
                      ? transaction.tags
                          .slice(0, 3)
                          .map((tag) => `<span class="chip">${app.escapeHtml(tag)}</span>`)
                          .join("")
                      : ""
                  }
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function captureSearchFiltersFromDom() {
    app.state.search.q = document.getElementById("searchQueryInput")?.value || "";
    app.state.search.month = document.getElementById("searchMonthInput")?.value || "";
    app.state.search.type = document.getElementById("searchTypeInput")?.value || "";
    app.state.search.account_id = document.getElementById("searchAccountInput")?.value || "";
    app.state.search.category_id = document.getElementById("searchCategoryInput")?.value || "";
    app.state.search.tag = document.getElementById("searchTagInput")?.value || "";
    app.state.search.amount_min = document.getElementById("searchAmountMinInput")?.value || "";
    app.state.search.amount_max = document.getElementById("searchAmountMaxInput")?.value || "";
  }

  app.openModal = async function openModalWithV2(action, id = "") {
    if (action === "quick-add") {
      await openQuickAddModal();
      return;
    }

    await originalOpenModal(action, id);
  };

  app.submitModal = async function submitModalWithV2() {
    if (app.state.ui.modal?.entity !== "quick") {
      await originalSubmitModal();
      return;
    }

    try {
      const payload = getQuickAddPayload();
      if (!payload.input && !payload.description) {
        throw new Error("Type a quick entry or fill the quick form.");
      }

      const result = await app.requestJSON("/api/transactions/quick", {
        method: "POST",
        body: payload
      });

      app.state.quickAdd.draft = result.parsed || null;
      app.closeModal();
      await Promise.all([
        app.loadTransactions(),
        app.loadAccounts(),
        app.loadBudgets(),
        loadSuggestions("")
      ]);
      await app.refreshCurrentPage();
    } catch (error) {
      setModalError(error.message);
    }
  };

  app.loadPageData = async function loadPageDataWithV2(page) {
    if (page === "search") {
      await Promise.all([app.loadAccounts(), app.loadCategories(), runSearch()]);
      renderSearchPage();
      return;
    }

    if (page === "review") {
      await loadMonthlyReview(app.state.review.month || getCurrentMonthKey());
      renderMonthlyReview();
      return;
    }

    await originalLoadPageData(page);

    if (page === "dashboard") {
      const [projection] = await Promise.all([
        loadBudgetProjection(getCurrentMonthKey()),
        loadSuggestions("")
      ]);
      renderDashboardProjection(projection);
    }

    if (page === "budgets") {
      const projection = await loadBudgetProjection(getCurrentMonthKey());
      renderBudgetProjectionDetails(projection);
    }
  };

  app.runSearch = async function runSearchAndRender() {
    await runSearch();
    renderSearchPage();
  };

  document.addEventListener("DOMContentLoaded", () => {
    const searchForm = document.getElementById("globalSearchForm");
    const searchInput = document.getElementById("globalSearchInput");

    if (searchForm) {
      searchForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        app.state.search.q = searchInput?.value || "";
        window.location.hash = "search";
      });
    }

    document.addEventListener("keydown", (event) => {
      const targetTag = String(event.target?.tagName || "").toLowerCase();
      const isTyping =
        targetTag === "input" || targetTag === "textarea" || event.target?.isContentEditable;

      if (!isTyping && event.key.toLowerCase() === "q") {
        event.preventDefault();
        app.openModal("quick-add");
      }

      if (!isTyping && event.key === "/") {
        event.preventDefault();
        searchInput?.focus();
      }
    });

    document.addEventListener("click", async (event) => {
      if (event.target.id === "quickAddParseBtn") {
        await runQuickParse();
        return;
      }

      const suggestionBtn = event.target.closest("[data-quick-suggestion]");
      if (suggestionBtn) {
        app.state.quickAdd.input = suggestionBtn.dataset.quickSuggestion || "";
        await rerenderQuickAdd(app.state.quickAdd.draft);
        const input = document.getElementById("quickInputLine");
        if (input) {
          input.value = app.state.quickAdd.input;
          input.focus();
        }
        return;
      }

      if (event.target.id === "runSearchBtn") {
        captureSearchFiltersFromDom();
        await app.runSearch();
        return;
      }

      if (event.target.id === "clearSearchFiltersBtn") {
        app.state.search = {
          q: "",
          month: "",
          type: "",
          account_id: "",
          category_id: "",
          tag: "",
          amount_min: "",
          amount_max: "",
          results: null
        };
        renderSearchPage();
      }
    });

    document.addEventListener("change", async (event) => {
      if (event.target.id === "quickType") {
        syncQuickTransferVisibility();
      }

      if (event.target.id === "reviewMonthInput") {
        await loadMonthlyReview(event.target.value);
        renderMonthlyReview();
      }
    });

    document.addEventListener("keydown", async (event) => {
      if (event.target.id === "quickInputLine" && event.key === "Enter") {
        event.preventDefault();
        await runQuickParse();
      }
    });
  });
})();
