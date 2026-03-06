const { AppError } = require("../lib/AppError");
const { fireflyRequest } = require("../lib/fireflyClient");
const {
  mapFireflyAbout,
  mapFireflyAccounts,
  mapSingleFireflyAccount,
  mapFireflyTransactions,
  mapFireflyTransaction,
  mapFireflyBudgets,
  mapFireflyCategories,
  mapFireflyTags,
  mapFireflyRecurrences
} = require("./fireflyAdapters");

function ensurePagedPayload(payload, resourceName) {
  if (!payload || !Array.isArray(payload.data)) {
    throw new AppError(`Malformed Firefly ${resourceName} response.`, {
      status: 502,
      code: "FIREFLY_MALFORMED_RESPONSE",
      details: payload
    });
  }

  return payload;
}

function sanitizeString(value) {
  return String(value || "").trim();
}

function sanitizeOptionalString(value) {
  const normalized = sanitizeString(value);
  return normalized || undefined;
}

function toNumber(value, fallback = NaN) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatAmount(value) {
  return toNumber(value, 0).toFixed(2);
}

function isPresent(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === 1 || value === "1" || value === "true") {
    return true;
  }

  if (value === 0 || value === "0" || value === "false") {
    return false;
  }

  return fallback;
}

function ensureValidDate(value, fieldName, { required = false } = {}) {
  if (!isPresent(value)) {
    if (required) {
      throw new AppError(`${fieldName} is required.`, {
        status: 400,
        code: "VALIDATION_ERROR"
      });
    }

    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError(`${fieldName} is invalid.`, {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  return date.toISOString();
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => sanitizeString(entry)).filter(Boolean))];
  }

  if (typeof value === "string") {
    return [
      ...new Set(
        value
          .split(",")
          .map((entry) => sanitizeString(entry))
          .filter(Boolean)
      )
    ];
  }

  return [];
}

async function fetchAllPages(resourcePath, query = {}, resourceName) {
  let page = 1;
  const items = [];

  while (true) {
    const payload = ensurePagedPayload(
      await fireflyRequest(resourcePath, {
        query: { ...query, page }
      }),
      resourceName
    );
    const pagination = payload.meta && payload.meta.pagination
      ? payload.meta.pagination
      : {};
    const currentPage = Number(pagination.current_page || page);
    const totalPages = Number(
      pagination.total_pages || pagination.last_page || currentPage
    );

    items.push(...payload.data);

    if (!Number.isFinite(totalPages) || currentPage >= totalPages) {
      break;
    }

    page = currentPage + 1;
  }

  return { data: items };
}

async function fetchAccountCollection(typeCandidates) {
  let lastTypeError;

  for (const type of typeCandidates) {
    try {
      return await fetchAllPages("/accounts", { type }, "accounts");
    } catch (error) {
      if (
        error.code === "FIREFLY_REQUEST_FAILED" &&
        (error.status === 400 || error.status === 404)
      ) {
        lastTypeError = error;
        continue;
      }

      throw error;
    }
  }

  if (lastTypeError) {
    throw lastTypeError;
  }

  return { data: [] };
}

async function listAccounts() {
  const [assetPayload, liabilityPayload] = await Promise.all([
    fetchAccountCollection(["asset", "defaultAccount"]),
    fetchAccountCollection(["liability", "liabilities"])
  ]);

  return [
    ...mapFireflyAccounts(assetPayload),
    ...mapFireflyAccounts(liabilityPayload)
  ].sort((left, right) => left.name.localeCompare(right.name));
}

async function getAccountById(accountId) {
  const payload = await fireflyRequest(`/accounts/${accountId}`);
  return mapSingleFireflyAccount(payload);
}

function normalizeUiTransactionType(type) {
  switch (sanitizeString(type).toLowerCase()) {
    case "expense":
      return "expense";
    case "income":
      return "income";
    case "transfer":
      return "transfer";
    default:
      throw new AppError(`Unsupported transaction type: ${type}`, {
        status: 400,
        code: "INVALID_TRANSACTION_TYPE"
      });
  }
}

function normalizeFireflyTransactionType(type) {
  switch (normalizeUiTransactionType(type)) {
    case "expense":
      return "withdrawal";
    case "income":
      return "deposit";
    case "transfer":
      return "transfer";
    default:
      return "withdrawal";
  }
}

function normalizeSplitInput(input, parentDescription, parentAmount) {
  if (Array.isArray(input.splits) && input.splits.length) {
    return input.splits;
  }

  return [
    {
      description: input.description || input.category || parentDescription,
      amount: input.amount || parentAmount,
      category_name: input.category_name || input.category,
      category_id: input.category_id,
      budget_name: input.budget_name || input.budget,
      budget_id: input.budget_id,
      tags: input.tags,
      notes: input.notes,
      counterpart_name: input.counterpart_name || input.counterparty
    }
  ];
}

function buildTransactionSplit({
  transactionType,
  date,
  accountId,
  destinationAccountId,
  counterpartName,
  split,
  fallbackDescription
}) {
  const amount = toNumber(split.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("Each split must have a positive amount.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const description = sanitizeString(split.description || fallbackDescription);

  if (!description) {
    throw new AppError("Each transaction split needs a description.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const payload = {
    type: normalizeFireflyTransactionType(transactionType),
    date,
    amount: formatAmount(amount),
    description
  };

  if (isPresent(split.budget_id)) {
    payload.budget_id = String(split.budget_id);
  } else if (isPresent(split.budget_name)) {
    payload.budget_name = sanitizeString(split.budget_name);
  }

  if (isPresent(split.category_id)) {
    payload.category_id = String(split.category_id);
  } else if (isPresent(split.category_name)) {
    payload.category_name = sanitizeString(split.category_name);
  }

  if (isPresent(split.notes)) {
    payload.notes = sanitizeString(split.notes);
  }

  const tags = parseTags(split.tags);
  if (tags.length) {
    payload.tags = tags;
  }

  if (transactionType === "expense") {
    payload.source_id = String(accountId);
    payload.destination_name =
      sanitizeOptionalString(split.counterpart_name) ||
      counterpartName ||
      "Expense";
  }

  if (transactionType === "income") {
    payload.destination_id = String(accountId);
    payload.source_name =
      sanitizeOptionalString(split.counterpart_name) ||
      counterpartName ||
      "Income";
  }

  if (transactionType === "transfer") {
    if (!destinationAccountId) {
      throw new AppError("Transfers require a destination account.", {
        status: 400,
        code: "VALIDATION_ERROR"
      });
    }

    payload.source_id = String(accountId);
    payload.destination_id = String(destinationAccountId);
  }

  return payload;
}

function buildTransactionBody(input) {
  const type = normalizeUiTransactionType(input.type);
  const accountId = sanitizeString(input.account_id);
  const destinationAccountId = sanitizeOptionalString(input.destination_account_id);

  if (!accountId) {
    throw new AppError("Account is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  if (type === "transfer" && accountId === destinationAccountId) {
    throw new AppError("Transfer source and destination accounts must differ.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const date =
    ensureValidDate(input.date, "date") || new Date().toISOString();
  const description =
    sanitizeString(input.description || input.category || `${type} transaction`);
  const counterpartName = sanitizeOptionalString(
    input.counterpart_name || input.counterparty
  );
  const splits = normalizeSplitInput(input, description, input.amount).map(
    (split) =>
      buildTransactionSplit({
        transactionType: type,
        date,
        accountId,
        destinationAccountId,
        counterpartName,
        split,
        fallbackDescription: description
      })
  );

  return {
    error_if_duplicate_hash: false,
    apply_rules: true,
    fire_webhooks: true,
    transactions: splits
  };
}

function matchesTransactionFilter(transaction, filters = {}) {
  const {
    date_from,
    date_to,
    type,
    account_id,
    category_id,
    budget_id
  } = filters;
  const transactionDate = String(transaction.date || "").slice(0, 10);

  if (date_from && transactionDate && transactionDate < String(date_from)) {
    return false;
  }

  if (date_to && transactionDate && transactionDate > String(date_to)) {
    return false;
  }

  if (type && String(transaction.type) !== String(type)) {
    return false;
  }

  if (account_id && String(transaction.account_id || "") !== String(account_id)) {
    return false;
  }

  if (
    category_id &&
    String(transaction.category_id || "") !== String(category_id)
  ) {
    return false;
  }

  if (budget_id && String(transaction.budget_id || "") !== String(budget_id)) {
    return false;
  }

  return true;
}

async function listTransactions(filters = {}) {
  const payload = await fetchAllPages(
    "/transactions",
    { limit: 100 },
    "transactions"
  );

  return mapFireflyTransactions(payload).filter((transaction) =>
    matchesTransactionFilter(transaction, filters)
  );
}

async function createTransaction(input) {
  const body = buildTransactionBody(input);
  const payload = await fireflyRequest("/transactions", {
    method: "POST",
    body
  });
  const transaction = mapFireflyTransaction(payload.data);

  return {
    success: true,
    id: payload.data ? String(payload.data.id) : undefined,
    transaction
  };
}

async function updateTransaction(transactionId, input) {
  if (!transactionId) {
    throw new AppError("Transaction id is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const body = buildTransactionBody(input);
  const payload = await fireflyRequest(`/transactions/${transactionId}`, {
    method: "PUT",
    body
  });
  const transaction = mapFireflyTransaction(payload.data);

  return {
    success: true,
    id: payload.data ? String(payload.data.id) : transactionId,
    transaction
  };
}

async function deleteTransaction(transactionId) {
  if (!transactionId) {
    throw new AppError("Transaction id is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  await fireflyRequest(`/transactions/${transactionId}`, {
    method: "DELETE"
  });

  return { success: true };
}

function normalizeAccountKind(kind) {
  const normalized = sanitizeString(kind).toLowerCase();

  if (["bank", "cash", "savings", "credit", "liability"].includes(normalized)) {
    return normalized;
  }

  throw new AppError(`Unsupported account type: ${kind}`, {
    status: 400,
    code: "VALIDATION_ERROR"
  });
}

function buildAccountBody(input, { partial = false } = {}) {
  const hasName = isPresent(input.name);
  const hasKind = isPresent(input.kind || input.type);
  const name = sanitizeString(input.name);
  const kind = hasKind ? normalizeAccountKind(input.kind || input.type) : null;

  if (!partial && !hasName) {
    throw new AppError("Account name is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  if (!partial && !kind) {
    throw new AppError("Account type is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const payload = {};

  if (hasName) {
    payload.name = name;
  }

  if (isPresent(input.notes)) {
    payload.notes = sanitizeString(input.notes);
  }

  if (input.active !== undefined) {
    payload.active = normalizeBoolean(input.active, true);
  }

  if (isPresent(input.currency_code)) {
    payload.currency_code = sanitizeString(input.currency_code).toUpperCase();
  }

  if (input.include_net_worth !== undefined) {
    payload.include_net_worth = normalizeBoolean(input.include_net_worth, true);
  }

  const openingBalance = toNumber(input.opening_balance);
  if (Number.isFinite(openingBalance)) {
    payload.opening_balance = formatAmount(Math.abs(openingBalance));
    payload.opening_balance_date =
      ensureValidDate(
        input.opening_balance_date || new Date().toISOString(),
        "opening_balance_date",
        { required: true }
      );
  }

  if (!kind) {
    return payload;
  }

  if (kind === "bank") {
    payload.type = "asset";
    payload.account_role = "defaultAsset";
  }

  if (kind === "cash") {
    payload.type = "asset";
    payload.account_role = "cashWalletAsset";
  }

  if (kind === "savings") {
    payload.type = "asset";
    payload.account_role = "savingAsset";
  }

  if (kind === "credit") {
    payload.type = "liability";
    payload.liability_type = sanitizeString(input.liability_type || "debt");
    payload.liability_direction = "credit";
  }

  if (kind === "liability") {
    payload.type = "liability";
    payload.liability_type = sanitizeString(input.liability_type || "debt");
    payload.liability_direction = "debit";
  }

  const interest = toNumber(input.interest);
  if (Number.isFinite(interest) && payload.type === "liability") {
    payload.interest = String(interest);
    payload.interest_period = sanitizeString(input.interest_period || "monthly");
  }

  return payload;
}

async function createAccount(input) {
  const payload = await fireflyRequest("/accounts", {
    method: "POST",
    body: buildAccountBody(input)
  });

  return {
    success: true,
    account: mapSingleFireflyAccount(payload)
  };
}

async function updateAccount(accountId, input) {
  if (!accountId) {
    throw new AppError("Account id is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const payload = await fireflyRequest(`/accounts/${accountId}`, {
    method: "PUT",
    body: buildAccountBody(input, { partial: false })
  });

  return {
    success: true,
    account: mapSingleFireflyAccount(payload)
  };
}

async function archiveAccount(accountId) {
  if (!accountId) {
    throw new AppError("Account id is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const current = await getAccountById(accountId);
  const payload = await fireflyRequest(`/accounts/${accountId}`, {
    method: "PUT",
    body: buildAccountBody(
      {
        name: current.name,
        kind: current.kind,
        notes: current.notes,
        active: false,
        currency_code: current.currency,
        opening_balance: current.opening_balance
      },
      { partial: false }
    )
  });

  return {
    success: true,
    account: mapSingleFireflyAccount(payload)
  };
}

async function listBudgets() {
  const payload = await fetchAllPages("/budgets", {}, "budgets");
  return mapFireflyBudgets(payload);
}

function buildBudgetBody(input, { partial = false } = {}) {
  const name = sanitizeString(input.name);

  if (!partial && !name) {
    throw new AppError("Budget name is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const payload = {};

  if (name) {
    payload.name = name;
  }

  if (input.active !== undefined) {
    payload.active = normalizeBoolean(input.active, true);
  }

  if (isPresent(input.notes)) {
    payload.notes = sanitizeString(input.notes);
  }

  const amount = toNumber(input.amount);
  if (Number.isFinite(amount) && amount > 0) {
    payload.auto_budget_type = sanitizeString(input.auto_budget_type || "reset");
    payload.auto_budget_amount = formatAmount(amount);
    payload.auto_budget_period = sanitizeString(
      input.auto_budget_period || "monthly"
    );

    if (isPresent(input.currency_code)) {
      payload.currency_code = sanitizeString(input.currency_code).toUpperCase();
    }
  } else if (input.amount === "" || input.amount === null || input.amount === 0) {
    payload.auto_budget_type = "none";
  }

  return payload;
}

async function createBudget(input) {
  const payload = await fireflyRequest("/budgets", {
    method: "POST",
    body: buildBudgetBody(input)
  });

  return {
    success: true,
    budget: mapFireflyBudgets({ data: [payload.data] })[0]
  };
}

async function updateBudget(budgetId, input) {
  if (!budgetId) {
    throw new AppError("Budget id is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const payload = await fireflyRequest(`/budgets/${budgetId}`, {
    method: "PUT",
    body: buildBudgetBody(input)
  });

  return {
    success: true,
    budget: mapFireflyBudgets({ data: [payload.data] })[0]
  };
}

async function deleteBudget(budgetId) {
  if (!budgetId) {
    throw new AppError("Budget id is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  await fireflyRequest(`/budgets/${budgetId}`, {
    method: "DELETE"
  });

  return { success: true };
}

async function listCategories() {
  const payload = await fetchAllPages("/categories", {}, "categories");
  return mapFireflyCategories(payload);
}

function buildCategoryBody(input) {
  const name = sanitizeString(input.name);

  if (!name) {
    throw new AppError("Category name is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  return {
    name,
    ...(isPresent(input.notes) ? { notes: sanitizeString(input.notes) } : {})
  };
}

async function createCategory(input) {
  const payload = await fireflyRequest("/categories", {
    method: "POST",
    body: buildCategoryBody(input)
  });

  return {
    success: true,
    category: mapFireflyCategories({ data: [payload.data] })[0]
  };
}

async function updateCategory(categoryId, input) {
  if (!categoryId) {
    throw new AppError("Category id is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const payload = await fireflyRequest(`/categories/${categoryId}`, {
    method: "PUT",
    body: buildCategoryBody(input)
  });

  return {
    success: true,
    category: mapFireflyCategories({ data: [payload.data] })[0]
  };
}

async function deleteCategory(categoryId) {
  if (!categoryId) {
    throw new AppError("Category id is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  await fireflyRequest(`/categories/${categoryId}`, {
    method: "DELETE"
  });

  return { success: true };
}

async function listTags() {
  const payload = await fetchAllPages("/tags", {}, "tags");
  return mapFireflyTags(payload);
}

function buildTagBody(input) {
  const tag = sanitizeString(input.name || input.tag);

  if (!tag) {
    throw new AppError("Tag name is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  return {
    tag,
    ...(isPresent(input.description)
      ? { description: sanitizeString(input.description) }
      : {}),
    ...(isPresent(input.date)
      ? { date: ensureValidDate(input.date, "date") }
      : {})
  };
}

async function createTag(input) {
  const payload = await fireflyRequest("/tags", {
    method: "POST",
    body: buildTagBody(input)
  });

  return {
    success: true,
    tag: mapFireflyTags({ data: [payload.data] })[0]
  };
}

async function updateTag(tagId, input) {
  if (!tagId) {
    throw new AppError("Tag id is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const payload = await fireflyRequest(`/tags/${tagId}`, {
    method: "PUT",
    body: buildTagBody(input)
  });

  return {
    success: true,
    tag: mapFireflyTags({ data: [payload.data] })[0]
  };
}

async function deleteTag(tagId) {
  if (!tagId) {
    throw new AppError("Tag id is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  await fireflyRequest(`/tags/${tagId}`, {
    method: "DELETE"
  });

  return { success: true };
}

async function listRecurrences() {
  const payload = await fetchAllPages("/recurrences", {}, "recurrences");
  return mapFireflyRecurrences(payload);
}

function buildRecurrenceBody(input) {
  const title = sanitizeString(input.title);
  const type = normalizeUiTransactionType(input.type || "expense");
  const amount = toNumber(input.amount);
  const accountId = sanitizeString(input.account_id);

  if (!title) {
    throw new AppError("Recurring title is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("Recurring amount must be positive.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  if (!accountId) {
    throw new AppError("Recurring account is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const destinationAccountId = sanitizeOptionalString(input.destination_account_id);
  const firstDate = ensureValidDate(input.first_date, "first_date", {
    required: true
  });
  const repetitionType = sanitizeString(input.frequency_type || "monthly");
  const repetitionMoment = sanitizeString(input.frequency_moment || "1");
  const repetitionSkip = toNumber(input.frequency_skip, 0);
  const repetitionWeekend = toNumber(input.frequency_weekend, 1);

  const transaction = buildTransactionSplit({
    transactionType: type,
    date: firstDate,
    accountId,
    destinationAccountId,
    counterpartName: sanitizeOptionalString(input.counterpart_name),
    split: {
      amount,
      description:
        input.transaction_description || input.description || input.title,
      budget_name: input.budget_name,
      budget_id: input.budget_id,
      category_name: input.category_name,
      category_id: input.category_id,
      tags: input.tags
    },
    fallbackDescription: title
  });

  const body = {
    type: normalizeFireflyTransactionType(type),
    title,
    description: sanitizeOptionalString(input.description),
    first_date: firstDate,
    active: normalizeBoolean(input.active, true),
    apply_rules: true,
    repetitions: [
      {
        type: repetitionType,
        moment: repetitionMoment,
        skip: Number.isFinite(repetitionSkip) ? repetitionSkip : 0,
        weekend: Number.isFinite(repetitionWeekend) ? repetitionWeekend : 1
      }
    ],
    transactions: [transaction]
  };

  const repeatUntil = ensureValidDate(input.repeat_until, "repeat_until");
  if (repeatUntil) {
    body.repeat_until = repeatUntil;
  }

  const totalRepeats = toNumber(input.nr_of_repetitions);
  if (Number.isFinite(totalRepeats) && totalRepeats > 0) {
    body.nr_of_repetitions = totalRepeats;
  }

  if (isPresent(input.notes)) {
    body.notes = sanitizeString(input.notes);
  }

  return body;
}

async function createRecurrence(input) {
  const payload = await fireflyRequest("/recurrences", {
    method: "POST",
    body: buildRecurrenceBody(input)
  });

  return {
    success: true,
    recurrence: mapFireflyRecurrences({ data: [payload.data] })[0]
  };
}

async function updateRecurrence(recurrenceId, input) {
  if (!recurrenceId) {
    throw new AppError("Recurring item id is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const payload = await fireflyRequest(`/recurrences/${recurrenceId}`, {
    method: "PUT",
    body: buildRecurrenceBody(input)
  });

  return {
    success: true,
    recurrence: mapFireflyRecurrences({ data: [payload.data] })[0]
  };
}

async function deleteRecurrence(recurrenceId) {
  if (!recurrenceId) {
    throw new AppError("Recurring item id is required.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  await fireflyRequest(`/recurrences/${recurrenceId}`, {
    method: "DELETE"
  });

  return { success: true };
}

async function getConnectionHealth() {
  const payload = await fireflyRequest("/about");
  const about = mapFireflyAbout(payload);

  return {
    ok: true,
    configured: true,
    firefly: about
  };
}

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
  archiveAccount,
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  listBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listTags,
  createTag,
  updateTag,
  deleteTag,
  listRecurrences,
  createRecurrence,
  updateRecurrence,
  deleteRecurrence,
  getConnectionHealth
};
