const { AppError } = require("../lib/AppError");

function ensureDataArray(payload, resourceName) {
  if (!payload || !Array.isArray(payload.data)) {
    throw new AppError(`Malformed Firefly ${resourceName} response.`, {
      status: 502,
      code: "FIREFLY_MALFORMED_RESPONSE",
      details: payload
    });
  }

  return payload.data;
}

function ensureDataObject(payload, resourceName) {
  if (!payload || !payload.data || typeof payload.data !== "object") {
    throw new AppError(`Malformed Firefly ${resourceName} response.`, {
      status: 502,
      code: "FIREFLY_MALFORMED_RESPONSE",
      details: payload
    });
  }

  return payload.data;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveAmount(value) {
  return Math.abs(toNumber(value, 0));
}

function getAttributes(item) {
  if (!item || typeof item !== "object" || !item.attributes) {
    throw new AppError("Malformed Firefly resource item.", {
      status: 502,
      code: "FIREFLY_MALFORMED_RESPONSE",
      details: item
    });
  }

  return item.attributes;
}

function normalizeAccountType(attributes) {
  const signature = [
    attributes.type,
    attributes.liability_type,
    attributes.account_role,
    attributes.credit_card_type,
    attributes.sub_type
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    signature.includes("credit") ||
    signature.includes("liability") ||
    signature.includes("debt")
  ) {
    return "credit";
  }

  return "bank";
}

function getAccountBalance(attributes, type) {
  if (type === "credit") {
    return toPositiveAmount(
      attributes.current_debt ??
        attributes.current_balance ??
        attributes.current_amount
    );
  }

  return toNumber(
    attributes.current_balance ?? attributes.current_amount ?? 0,
    0
  );
}

function getCreditLimit(attributes) {
  return toNumber(
    attributes.credit_card_limit ??
      attributes.credit_limit ??
      attributes.monthly_payment_amount ??
      0,
    0
  );
}

function mapFireflyAccount(item) {
  const attributes = getAttributes(item);
  const type = normalizeAccountType(attributes);

  return {
    id: String(item.id),
    name: attributes.name || "Unnamed account",
    type,
    balance: getAccountBalance(attributes, type),
    credit_limit: type === "credit" ? getCreditLimit(attributes) : 0
  };
}

function mapFireflyAccounts(payload) {
  return ensureDataArray(payload, "accounts").map(mapFireflyAccount);
}

function mapSingleFireflyAccount(payload) {
  return mapFireflyAccount(ensureDataObject(payload, "account"));
}

function normalizeTransactionType(type) {
  switch (String(type || "").toLowerCase()) {
    case "deposit":
      return "income";
    case "withdrawal":
      return "expense";
    case "transfer":
      return "transfer";
    default:
      return null;
  }
}

function getPrimarySplit(item) {
  const attributes = getAttributes(item);
  const splits = Array.isArray(attributes.transactions)
    ? attributes.transactions
    : [];

  if (!splits.length) {
    throw new AppError("Transaction is missing split data.", {
      status: 502,
      code: "FIREFLY_MALFORMED_RESPONSE",
      details: item
    });
  }

  return splits.find((split) => normalizeTransactionType(split.type)) || splits[0];
}

function getTransactionAccount(split) {
  const normalizedType = normalizeTransactionType(split.type);

  if (normalizedType === "income") {
    return {
      id: split.destination_id || "",
      name: split.destination_name || ""
    };
  }

  return {
    id: split.source_id || "",
    name: split.source_name || ""
  };
}

function mapFireflyTransaction(item) {
  const attributes = getAttributes(item);
  const split = getPrimarySplit(item);
  const type = normalizeTransactionType(split.type);

  if (!type) {
    return null;
  }

  const account = getTransactionAccount(split);

  return {
    id: String(item.id),
    type,
    amount: toPositiveAmount(split.amount),
    category:
      split.category_name ||
      split.budget_name ||
      split.description ||
      attributes.group_title ||
      "Uncategorized",
    account_id: account.id ? String(account.id) : "",
    account_name: account.name || "",
    date:
      split.date ||
      attributes.created_at ||
      attributes.updated_at ||
      new Date().toISOString()
  };
}

function mapFireflyTransactions(payload) {
  return ensureDataArray(payload, "transactions")
    .map(mapFireflyTransaction)
    .filter(Boolean)
    .sort((left, right) => new Date(right.date) - new Date(left.date));
}

function readMoneyValue(value) {
  if (Array.isArray(value)) {
    return value.reduce((sum, entry) => sum + readMoneyValue(entry), 0);
  }

  if (!value || typeof value !== "object") {
    return toNumber(value, 0);
  }

  return toNumber(
    value.sum ??
      value.amount ??
      value.spent ??
      value.value ??
      value.currency_amount ??
      0,
    0
  );
}

function readCurrency(value, fallback) {
  if (Array.isArray(value)) {
    return readCurrency(value[0], fallback);
  }

  if (!value || typeof value !== "object") {
    return fallback || "INR";
  }

  return (
    value.currency_code ||
    value.currency_symbol ||
    fallback ||
    "INR"
  );
}

function mapFireflyBudget(item) {
  const attributes = getAttributes(item);
  const limitSource =
    attributes.budget_limit ??
    attributes.budgeted ??
    attributes.auto_budget_amount ??
    attributes.limits ??
    attributes.limit ??
    0;
  const spentSource =
    attributes.spent ??
    attributes.active_spent ??
    attributes.current_spent ??
    0;
  const amount = readMoneyValue(limitSource);
  const spent = readMoneyValue(spentSource);

  return {
    id: String(item.id),
    name: attributes.name || "Unnamed budget",
    amount,
    spent,
    remaining: amount > 0 ? amount - spent : null,
    currency: readCurrency(limitSource, readCurrency(spentSource, "INR"))
  };
}

function mapFireflyBudgets(payload) {
  return ensureDataArray(payload, "budgets").map(mapFireflyBudget);
}

module.exports = {
  mapFireflyAccounts,
  mapSingleFireflyAccount,
  mapFireflyTransactions,
  mapFireflyTransaction,
  mapFireflyBudgets
};
