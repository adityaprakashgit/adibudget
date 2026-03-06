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

function toBoolean(value, fallback = false) {
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

function toStringValue(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
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

function readCurrencyCode(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = readCurrencyCode(...value);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (value && typeof value === "object") {
      const nested = readCurrencyCode(
        value.currency_code,
        value.currencyCode,
        value.currency_symbol,
        value.currencySymbol
      );
      if (nested) {
        return nested;
      }
      continue;
    }

    const stringValue = String(value || "").trim();
    if (stringValue) {
      return stringValue;
    }
  }

  return "INR";
}

function normalizeAccountKind(attributes) {
  const accountRole = toStringValue(attributes.account_role).toLowerCase();
  const signature = [
    attributes.type,
    attributes.liability_type,
    attributes.liability_direction,
    attributes.account_role,
    attributes.credit_card_type,
    attributes.sub_type
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (accountRole === "cashwalletasset") {
    return "cash";
  }

  if (accountRole === "savingasset") {
    return "savings";
  }

  if (accountRole === "ccasset") {
    return "credit";
  }

  if (signature.includes("credit")) {
    return "credit";
  }

  if (
    signature.includes("liability") ||
    signature.includes("loan") ||
    signature.includes("mortgage") ||
    signature.includes("debit")
  ) {
    return "liability";
  }

  return "bank";
}

function getAccountBalance(attributes, kind) {
  if (kind === "credit" || kind === "liability") {
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
  const kind = normalizeAccountKind(attributes);
  const active = toBoolean(attributes.active, true);

  return {
    id: String(item.id),
    name: attributes.name || "Unnamed account",
    type: kind,
    kind,
    group:
      kind === "credit" || kind === "liability" ? "liability" : "asset",
    role: attributes.account_role || "",
    liability_type: attributes.liability_type || "",
    active,
    archived: !active,
    balance: getAccountBalance(attributes, kind),
    currency: readCurrencyCode(
      attributes.currency_code,
      attributes.current_balance_currency_code,
      attributes.opening_balance_currency_code
    ),
    credit_limit:
      kind === "credit" || kind === "liability"
        ? getCreditLimit(attributes)
        : 0,
    opening_balance: toNumber(attributes.opening_balance, 0),
    notes: attributes.notes || "",
    include_net_worth: toBoolean(attributes.include_net_worth, true)
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

function mapTransactionSplit(split, fallbackDate = "") {
  const type = normalizeTransactionType(split.type);

  if (!type) {
    return null;
  }

  let account = {
    id: "",
    name: ""
  };
  let counterpart = {
    id: "",
    name: ""
  };

  if (type === "income") {
    account = {
      id: toStringValue(split.destination_id),
      name: split.destination_name || ""
    };
    counterpart = {
      id: toStringValue(split.source_id),
      name: split.source_name || ""
    };
  } else {
    account = {
      id: toStringValue(split.source_id),
      name: split.source_name || ""
    };
    counterpart = {
      id: toStringValue(split.destination_id),
      name: split.destination_name || ""
    };
  }

  return {
    type,
    amount: toPositiveAmount(split.amount),
    date: split.date || fallbackDate || new Date().toISOString(),
    description: split.description || "",
    notes: split.notes || "",
    account,
    counterpart,
    budget: {
      id: toStringValue(split.budget_id),
      name: split.budget_name || ""
    },
    category: {
      id: toStringValue(split.category_id),
      name: split.category_name || ""
    },
    tags: Array.isArray(split.tags)
      ? split.tags.filter(Boolean).map((tag) => String(tag))
      : [],
    currency: readCurrencyCode(
      split.currency_code,
      split.foreign_currency_code,
      split.currency_symbol
    )
  };
}

function getPrimarySplit(mappedSplits) {
  if (!mappedSplits.length) {
    throw new AppError("Transaction is missing split data.", {
      status: 502,
      code: "FIREFLY_MALFORMED_RESPONSE"
    });
  }

  return mappedSplits[0];
}

function mapFireflyTransaction(item) {
  const attributes = getAttributes(item);
  const rawSplits = Array.isArray(attributes.transactions)
    ? attributes.transactions
    : [];
  const mappedSplits = rawSplits
    .map((split) =>
      mapTransactionSplit(
        split,
        attributes.created_at || attributes.updated_at || ""
      )
    )
    .filter(Boolean);

  const primarySplit = getPrimarySplit(mappedSplits);
  const type = primarySplit.type;
  const amount = mappedSplits.reduce(
    (sum, split) => sum + toPositiveAmount(split.amount),
    0
  );
  const tags = [...new Set(mappedSplits.flatMap((split) => split.tags))];

  return {
    id: String(item.id),
    type,
    description:
      attributes.group_title ||
      primarySplit.description ||
      primarySplit.category.name ||
      "Untitled transaction",
    amount,
    date:
      primarySplit.date ||
      attributes.created_at ||
      attributes.updated_at ||
      new Date().toISOString(),
    account_id: primarySplit.account.id,
    account_name: primarySplit.account.name,
    counterpart_id: primarySplit.counterpart.id,
    counterpart_name: primarySplit.counterpart.name,
    budget_id: primarySplit.budget.id,
    budget_name: primarySplit.budget.name,
    category_id: primarySplit.category.id,
    category_name: primarySplit.category.name,
    category:
      primarySplit.category.name ||
      primarySplit.budget.name ||
      primarySplit.description ||
      "Uncategorized",
    tags,
    notes: primarySplit.notes || "",
    currency: primarySplit.currency,
    split_count: mappedSplits.length,
    splits: mappedSplits
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
  const active = toBoolean(attributes.active, true);

  return {
    id: String(item.id),
    name: attributes.name || "Unnamed budget",
    amount,
    spent,
    remaining: amount > 0 ? amount - spent : null,
    currency: readCurrencyCode(limitSource, spentSource),
    active,
    notes: attributes.notes || "",
    auto_budget_type: attributes.auto_budget_type || "none",
    auto_budget_period: attributes.auto_budget_period || "monthly"
  };
}

function mapFireflyBudgets(payload) {
  return ensureDataArray(payload, "budgets").map(mapFireflyBudget);
}

function mapFireflyCategory(item) {
  const attributes = getAttributes(item);

  return {
    id: String(item.id),
    name: attributes.name || "Unnamed category",
    notes: attributes.notes || ""
  };
}

function mapFireflyCategories(payload) {
  return ensureDataArray(payload, "categories").map(mapFireflyCategory);
}

function mapFireflyTag(item) {
  const attributes = getAttributes(item);

  return {
    id: String(item.id),
    name: attributes.tag || attributes.name || "Unnamed tag",
    description: attributes.description || "",
    date: attributes.date || ""
  };
}

function mapFireflyTags(payload) {
  return ensureDataArray(payload, "tags").map(mapFireflyTag);
}

function mapFireflyRecurrence(item) {
  const attributes = getAttributes(item);
  const repetitions = Array.isArray(attributes.repetitions)
    ? attributes.repetitions
    : [];
  const transactions = Array.isArray(attributes.transactions)
    ? attributes.transactions
    : [];
  const firstRepetition = repetitions[0] || {};
  const firstTransaction = transactions[0] || {};
  const transactionType = normalizeTransactionType(
    attributes.type || firstTransaction.type
  );
  const transactionDetails = mapTransactionSplit(
    {
      ...firstTransaction,
      type: attributes.type || firstTransaction.type
    },
    attributes.first_date || ""
  );

  return {
    id: String(item.id),
    title: attributes.title || "Untitled recurrence",
    description: attributes.description || "",
    notes: attributes.notes || "",
    active: toBoolean(attributes.active, true),
    type: transactionType || "expense",
    first_date: attributes.first_date || "",
    repeat_until: attributes.repeat_until || "",
    nr_of_repetitions: toNumber(attributes.nr_of_repetitions, 0),
    frequency_type: firstRepetition.type || "monthly",
    frequency_moment: toStringValue(firstRepetition.moment || "1"),
    frequency_skip: toNumber(firstRepetition.skip, 0),
    frequency_weekend: toNumber(firstRepetition.weekend, 1),
    amount: transactionDetails ? transactionDetails.amount : 0,
    currency: transactionDetails ? transactionDetails.currency : "INR",
    account_id: transactionDetails ? transactionDetails.account.id : "",
    account_name: transactionDetails ? transactionDetails.account.name : "",
    counterpart_id: transactionDetails
      ? transactionDetails.counterpart.id
      : "",
    counterpart_name: transactionDetails
      ? transactionDetails.counterpart.name
      : "",
    budget_id: transactionDetails ? transactionDetails.budget.id : "",
    budget_name: transactionDetails ? transactionDetails.budget.name : "",
    category_id: transactionDetails ? transactionDetails.category.id : "",
    category_name: transactionDetails ? transactionDetails.category.name : "",
    tags: transactionDetails ? transactionDetails.tags : [],
    transaction_description: transactionDetails
      ? transactionDetails.description
      : ""
  };
}

function mapFireflyRecurrences(payload) {
  return ensureDataArray(payload, "recurrences")
    .map(mapFireflyRecurrence)
    .sort((left, right) => new Date(left.first_date) - new Date(right.first_date));
}

function mapFireflyAbout(payload) {
  if (!payload || !payload.data || typeof payload.data !== "object") {
    throw new AppError("Malformed Firefly about response.", {
      status: 502,
      code: "FIREFLY_MALFORMED_RESPONSE",
      details: payload
    });
  }

  return {
    version: payload.data.version || "",
    api_version: payload.data.api_version || "",
    php_version: payload.data.php_version || "",
    os: payload.data.os || "",
    driver: payload.data.driver || ""
  };
}

module.exports = {
  mapFireflyAbout,
  mapFireflyAccounts,
  mapSingleFireflyAccount,
  mapFireflyTransactions,
  mapFireflyTransaction,
  mapFireflyBudgets,
  mapFireflyCategories,
  mapFireflyTags,
  mapFireflyRecurrences
};
