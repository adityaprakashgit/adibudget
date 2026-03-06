const financeService = require("./fireflyFinanceService");
const { AppError } = require("../lib/AppError");
const {
  getPreferences,
  addRecentSearch,
  setQuickEntryDefaults
} = require("../lib/uxPreferencesStore");

function sanitizeString(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return sanitizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function formatMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseMonthInput(month) {
  const normalized = sanitizeString(month);

  if (!normalized) {
    return formatMonthKey(new Date());
  }

  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    throw new AppError("Month must use YYYY-MM format.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  return normalized;
}

function getMonthRange(month) {
  const key = parseMonthInput(month);
  const [yearString, monthString] = key.split("-");
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));

  return {
    key,
    start,
    end,
    totalDays: end.getUTCDate()
  };
}

function getPreviousMonth(month) {
  const range = getMonthRange(month);
  const previous = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth() - 1, 1));
  return formatMonthKey(previous);
}

function isTransactionInMonth(transaction, month) {
  const date = new Date(transaction.date);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return formatMonthKey(date) === month;
}

function sumAmounts(transactions, type) {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];

  items.forEach((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(item);
  });

  return result;
}

function buildAliasEntries(items, getLabel) {
  return items.flatMap((item) => {
    const name = sanitizeString(getLabel(item));
    const normalized = normalizeText(name);
    const tokens = normalized.split(" ").filter(Boolean);
    const aliases = new Set([normalized, ...tokens.filter((token) => token.length >= 3)]);

    return [...aliases].map((alias) => ({
      alias,
      item
    }));
  });
}

function matchEntities(tokens, items, getLabel) {
  const aliasEntries = buildAliasEntries(items, getLabel);
  const matched = [];
  const consumed = new Set();

  tokens.forEach((token, index) => {
    const entry = aliasEntries.find(({ alias }) => alias === token);

    if (!entry) {
      return;
    }

    matched.push(entry.item);
    consumed.add(index);
  });

  return {
    matched: uniqueBy(matched, (item) => String(item.id)),
    consumed
  };
}

function detectQuickType(tokens, fallback = "expense") {
  const signature = new Set(tokens);

  if (signature.has("transfer") || signature.has("move")) {
    return "transfer";
  }

  if (
    signature.has("income") ||
    signature.has("salary") ||
    signature.has("refund") ||
    signature.has("bonus") ||
    signature.has("deposit")
  ) {
    return "income";
  }

  return fallback;
}

function findSimilarTransaction(transactions, descriptionTokens) {
  if (!descriptionTokens.length) {
    return null;
  }

  const query = descriptionTokens.join(" ");

  return transactions.find((transaction) => {
    const haystack = normalizeText(
      [
        transaction.description,
        transaction.counterpart_name,
        transaction.category_name,
        transaction.account_name
      ].join(" ")
    );

    return haystack.includes(query) || query.includes(haystack);
  }) || null;
}

async function parseQuickEntry(input, overrides = {}) {
  const text = sanitizeString(input);

  if (!text) {
    throw new AppError("Quick add input is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const [accounts, categories, transactions] = await Promise.all([
    financeService.listAccounts(),
    financeService.listCategories(),
    financeService.listTransactions({})
  ]);
  const preferences = getPreferences();
  const rawTokens = tokenize(text);
  const amountIndex = rawTokens.findIndex((token) => /^\d+(\.\d+)?$/.test(token));

  if (amountIndex === -1) {
    throw new AppError("Quick add could not find an amount in the input.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const amount = Number(rawTokens[amountIndex]);
  const remainingTokens = rawTokens.filter((token, index) => index !== amountIndex);
  const accountMatch = matchEntities(remainingTokens, accounts, (account) => account.name);
  const categoryMatch = matchEntities(
    remainingTokens,
    categories,
    (category) => category.name
  );
  const matchedAccount = accountMatch.matched[0] || null;
  const matchedDestination = accountMatch.matched[1] || null;
  const matchedCategory = categoryMatch.matched[0] || null;
  const type = detectQuickType(
    remainingTokens,
    preferences.quickEntryDefaults.type || "expense"
  );
  const consumedIndexes = new Set([...accountMatch.consumed, ...categoryMatch.consumed]);
  const descriptionTokens = remainingTokens.filter((token, index) => {
    const isTypeKeyword =
      ["income", "salary", "refund", "bonus", "deposit", "transfer", "move"].includes(
        token
      );

    return !consumedIndexes.has(index) && !isTypeKeyword;
  });
  const similarTransaction = findSimilarTransaction(transactions, descriptionTokens);
  const description = sanitizeString(
    overrides.description ||
      descriptionTokens.join(" ") ||
      matchedCategory?.name ||
      similarTransaction?.description ||
      "quick entry"
  );
  const account =
    accounts.find((item) => String(item.id) === String(overrides.account_id)) ||
    matchedAccount ||
    accounts.find(
      (item) => String(item.id) === String(preferences.quickEntryDefaults.account_id)
    ) ||
    (similarTransaction
      ? accounts.find((item) => String(item.id) === String(similarTransaction.account_id))
      : null);
  const category =
    categories.find((item) => String(item.id) === String(overrides.category_id)) ||
    matchedCategory ||
    categories.find(
      (item) => String(item.id) === String(similarTransaction?.category_id)
    ) ||
    categories.find(
      (item) => String(item.id) === String(preferences.quickEntryDefaults.category_id)
    ) ||
    null;

  return {
    input: text,
    amount,
    type: overrides.type || similarTransaction?.type || type,
    date: overrides.date || new Date().toISOString().slice(0, 10),
    description,
    account_id: account ? String(account.id) : "",
    account_name: account ? account.name : "",
    destination_account_id:
      overrides.destination_account_id ||
      (matchedDestination && (overrides.type || type) === "transfer"
        ? String(matchedDestination.id)
        : ""),
    destination_account_name:
      matchedDestination && (overrides.type || type) === "transfer"
        ? matchedDestination.name
        : "",
    category_id: category ? String(category.id) : "",
    category_name: category ? category.name : "",
    tags: similarTransaction?.tags || [],
    confidence: [
      amount ? 0.35 : 0,
      account ? 0.25 : 0,
      category ? 0.2 : 0,
      similarTransaction ? 0.2 : 0
    ].reduce((sum, value) => sum + value, 0),
    suggestions: {
      accounts: uniqueBy(
        [matchedAccount, matchedDestination, account].filter(Boolean),
        (item) => String(item.id)
      ),
      categories: uniqueBy([matchedCategory, category].filter(Boolean), (item) => String(item.id)),
      similar: similarTransaction
        ? {
            id: similarTransaction.id,
            description: similarTransaction.description,
            account_name: similarTransaction.account_name,
            category_name: similarTransaction.category_name,
            amount: similarTransaction.amount
          }
        : null
    }
  };
}

function buildQuickPayload(parsed, overrides = {}) {
  const amount = Number(overrides.amount || parsed.amount);
  const accountId = sanitizeString(overrides.account_id || parsed.account_id);
  const type = sanitizeString(overrides.type || parsed.type);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("Quick add needs a positive amount.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  if (!accountId) {
    throw new AppError("Quick add needs an account.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  return {
    type,
    date: overrides.date || parsed.date,
    account_id: accountId,
    destination_account_id:
      overrides.destination_account_id || parsed.destination_account_id || "",
    counterpart_name: sanitizeString(overrides.counterpart_name || ""),
    description: sanitizeString(overrides.description || parsed.description),
    category_id: overrides.category_id || parsed.category_id || "",
    category_name: overrides.category_name || parsed.category_name || "",
    amount,
    tags: overrides.tags || parsed.tags || []
  };
}

async function previewQuickTransaction(input, overrides = {}) {
  return parseQuickEntry(input, overrides);
}

async function createQuickTransaction(input, overrides = {}) {
  const parsed = await parseQuickEntry(input, overrides);
  const payload = buildQuickPayload(parsed, overrides);
  const result = await financeService.createTransaction(payload);

  setQuickEntryDefaults({
    type: payload.type,
    account_id: payload.account_id,
    category_id: payload.category_id || ""
  });

  return {
    success: true,
    parsed,
    transaction: result.transaction
  };
}

function buildUsageMap(items, getKey, getValue) {
  const map = new Map();

  items.forEach((item) => {
    const key = sanitizeString(getKey(item));
    if (!key) {
      return;
    }

    const current = map.get(key) || {
      key,
      count: 0,
      value: getValue(item)
    };
    current.count += 1;
    map.set(key, current);
  });

  return [...map.values()].sort((left, right) => right.count - left.count);
}

async function getSuggestions(query = "") {
  const normalizedQuery = normalizeText(query);
  const [accounts, categories, tags, transactions] = await Promise.all([
    financeService.listAccounts(),
    financeService.listCategories(),
    financeService.listTags(),
    financeService.listTransactions({})
  ]);
  const preferences = getPreferences();
  const recentMerchants = buildUsageMap(
    transactions
      .filter((transaction) => transaction.type !== "transfer")
      .map((transaction) => ({
        label: transaction.counterpart_name || transaction.description,
        transaction
      })),
    (entry) => entry.label,
    (entry) => ({
      name: entry.label,
      amount: entry.transaction.amount,
      type: entry.transaction.type,
      account_id: entry.transaction.account_id,
      category_id: entry.transaction.category_id
    })
  )
    .filter((entry) =>
      normalizedQuery ? normalizeText(entry.key).includes(normalizedQuery) : true
    )
    .slice(0, 8)
    .map((entry) => entry.value);
  const favoriteAccounts = accounts.filter((account) =>
    preferences.favoriteAccounts.includes(String(account.id))
  );
  const favoriteCategories = categories.filter((category) =>
    preferences.favoriteCategories.includes(String(category.id))
  );
  const derivedFavoriteAccounts = buildUsageMap(
    transactions.filter((transaction) => transaction.account_id),
    (transaction) => String(transaction.account_id),
    (transaction) =>
      accounts.find((account) => String(account.id) === String(transaction.account_id))
  )
    .map((entry) => entry.value)
    .filter(Boolean)
    .slice(0, 4);
  const derivedFavoriteCategories = buildUsageMap(
    transactions.filter((transaction) => transaction.category_id),
    (transaction) => String(transaction.category_id),
    (transaction) =>
      categories.find(
        (category) => String(category.id) === String(transaction.category_id)
      )
  )
    .map((entry) => entry.value)
    .filter(Boolean)
    .slice(0, 4);

  return {
    query: query || "",
    quickEntryDefaults: preferences.quickEntryDefaults,
    recentSearches: preferences.recentSearches.slice(0, 6),
    favorites: {
      accounts: favoriteAccounts.length ? favoriteAccounts : derivedFavoriteAccounts,
      categories: favoriteCategories.length
        ? favoriteCategories
        : derivedFavoriteCategories
    },
    accounts: accounts
      .filter((account) =>
        normalizedQuery
          ? normalizeText(account.name).includes(normalizedQuery)
          : true
      )
      .slice(0, 8),
    categories: categories
      .filter((category) =>
        normalizedQuery
          ? normalizeText(category.name).includes(normalizedQuery)
          : true
      )
      .slice(0, 8),
    tags: tags
      .filter((tag) =>
        normalizedQuery ? normalizeText(tag.name).includes(normalizedQuery) : true
      )
      .slice(0, 8),
    recentMerchants
  };
}

function searchMatch(transaction, params) {
  const q = normalizeText(params.q || "");
  const month = sanitizeString(params.month);
  const tag = normalizeText(params.tag || "");
  const amountMin = sanitizeString(params.amount_min);
  const amountMax = sanitizeString(params.amount_max);
  const parsedAmountMin = amountMin ? Number(amountMin) : NaN;
  const parsedAmountMax = amountMax ? Number(amountMax) : NaN;

  if (month && !isTransactionInMonth(transaction, month)) {
    return false;
  }

  if (params.type && transaction.type !== params.type) {
    return false;
  }

  if (
    params.account_id &&
    String(transaction.account_id || "") !== String(params.account_id)
  ) {
    return false;
  }

  if (
    params.category_id &&
    String(transaction.category_id || "") !== String(params.category_id)
  ) {
    return false;
  }

  if (
    params.budget_id &&
    String(transaction.budget_id || "") !== String(params.budget_id)
  ) {
    return false;
  }

  if (tag && !transaction.tags.some((item) => normalizeText(item).includes(tag))) {
    return false;
  }

  if (
    Number.isFinite(parsedAmountMin) &&
    Number(transaction.amount || 0) < parsedAmountMin
  ) {
    return false;
  }

  if (
    Number.isFinite(parsedAmountMax) &&
    Number(transaction.amount || 0) > parsedAmountMax
  ) {
    return false;
  }

  if (!q) {
    return true;
  }

  const haystack = normalizeText(
    [
      transaction.description,
      transaction.counterpart_name,
      transaction.account_name,
      transaction.category_name,
      transaction.budget_name,
      ...(transaction.tags || [])
    ].join(" ")
  );

  return haystack.includes(q);
}

async function searchTransactions(params = {}) {
  const transactions = await financeService.listTransactions({});
  const results = transactions.filter((transaction) => searchMatch(transaction, params));

  if (params.q || params.month) {
    addRecentSearch(`${sanitizeString(params.q || "")} ${sanitizeString(params.month || "")}`.trim());
  }

  return {
    query: sanitizeString(params.q),
    month: sanitizeString(params.month),
    count: results.length,
    summary: {
      income: sumAmounts(results, "income"),
      expense: sumAmounts(results, "expense"),
      transfer: sumAmounts(results, "transfer")
    },
    results: results.slice(0, 200)
  };
}

function buildCategoryBreakdown(transactions) {
  return buildUsageMap(
    transactions.filter((transaction) => transaction.type === "expense"),
    (transaction) => transaction.category_name || transaction.category || "Uncategorized",
    (transaction) => ({
      name: transaction.category_name || transaction.category || "Uncategorized",
      amount: Number(transaction.amount || 0)
    })
  )
    .map((entry) => ({
      name: entry.value.name,
      amount: transactions
        .filter(
          (transaction) =>
            (transaction.category_name || transaction.category || "Uncategorized") ===
            entry.value.name &&
            transaction.type === "expense"
        )
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
    }))
    .slice(0, 5);
}

function buildMerchantBreakdown(transactions) {
  return buildUsageMap(
    transactions.filter((transaction) => transaction.type !== "transfer"),
    (transaction) => transaction.counterpart_name || transaction.description,
    (transaction) => ({
      name: transaction.counterpart_name || transaction.description,
      amount: Number(transaction.amount || 0)
    })
  )
    .map((entry) => ({
      name: entry.value.name,
      amount: transactions
        .filter(
          (transaction) =>
            (transaction.counterpart_name || transaction.description) ===
              entry.value.name && transaction.type !== "transfer"
        )
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
    }))
    .slice(0, 5);
}

function buildUnusualTransactions(transactions) {
  const expenses = transactions.filter((transaction) => transaction.type === "expense");
  const average =
    expenses.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0) /
      (expenses.length || 1);

  return expenses
    .filter((transaction) => Number(transaction.amount || 0) > average * 1.8)
    .slice(0, 5)
    .map((transaction) => ({
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      account_name: transaction.account_name,
      category_name: transaction.category_name,
      date: transaction.date
    }));
}

async function getMonthlyReview(month) {
  const monthKey = parseMonthInput(month);
  const previousMonth = getPreviousMonth(monthKey);
  const transactions = await financeService.listTransactions({});
  const currentTransactions = transactions.filter((transaction) =>
    isTransactionInMonth(transaction, monthKey)
  );
  const previousTransactions = transactions.filter((transaction) =>
    isTransactionInMonth(transaction, previousMonth)
  );
  const currentIncome = sumAmounts(currentTransactions, "income");
  const currentExpense = sumAmounts(currentTransactions, "expense");
  const previousIncome = sumAmounts(previousTransactions, "income");
  const previousExpense = sumAmounts(previousTransactions, "expense");

  return {
    month: monthKey,
    totals: {
      income: currentIncome,
      expense: currentExpense,
      savings: currentIncome - currentExpense
    },
    comparison: {
      previousMonth,
      income_delta: currentIncome - previousIncome,
      expense_delta: currentExpense - previousExpense,
      savings_delta:
        (currentIncome - currentExpense) - (previousIncome - previousExpense)
    },
    topCategories: buildCategoryBreakdown(currentTransactions),
    biggestMerchants: buildMerchantBreakdown(currentTransactions),
    unusualTransactions: buildUnusualTransactions(currentTransactions),
    recentTransactions: currentTransactions.slice(0, 8)
  };
}

async function getBudgetProjection(month) {
  const monthRange = getMonthRange(month);
  const budgets = await financeService.listBudgets();
  const now = new Date();
  const isCurrentMonth = monthRange.key === formatMonthKey(now);
  const elapsedDays = isCurrentMonth
    ? Math.min(now.getDate(), monthRange.totalDays)
    : monthRange.totalDays;
  const remainingDays = Math.max(0, monthRange.totalDays - elapsedDays);
  const projectedBudgets = budgets.map((budget) => {
    const amount = Number(budget.amount || 0);
    const spent = Number(budget.spent || 0);
    const currency = /^[A-Z]{3}$/.test(String(budget.currency || ""))
      ? String(budget.currency)
      : "INR";
    const projected = elapsedDays > 0 ? (spent / elapsedDays) * monthRange.totalDays : spent;
    const safeToSpend =
      amount > 0
        ? remainingDays > 0
          ? Math.max(0, amount - spent) / remainingDays
          : Math.max(0, amount - spent)
        : 0;
    const usageRatio = amount > 0 ? spent / amount : 0;
    const warning =
      amount > 0 && (projected > amount || usageRatio >= 0.85)
        ? "warning"
        : amount > 0 && usageRatio >= 0.65
          ? "watch"
          : "healthy";

    return {
      id: budget.id,
      name: budget.name,
      currency,
      amount,
      spent,
      projected_month_end: projected,
      safe_to_spend_daily: safeToSpend,
      usage_ratio: usageRatio,
      warning
    };
  });

  return {
    month: monthRange.key,
    summary: {
      total_budgeted: projectedBudgets.reduce((sum, item) => sum + item.amount, 0),
      total_spent: projectedBudgets.reduce((sum, item) => sum + item.spent, 0),
      total_projected: projectedBudgets.reduce(
        (sum, item) => sum + item.projected_month_end,
        0
      ),
      remainingDays
    },
    budgets: projectedBudgets
  };
}

module.exports = {
  previewQuickTransaction,
  createQuickTransaction,
  getSuggestions,
  searchTransactions,
  getMonthlyReview,
  getBudgetProjection
};
