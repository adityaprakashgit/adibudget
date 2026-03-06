const { AppError } = require("../lib/AppError");
const { fireflyRequest } = require("../lib/fireflyClient");
const {
  mapFireflyAccounts,
  mapSingleFireflyAccount,
  mapFireflyTransactions,
  mapFireflyTransaction,
  mapFireflyBudgets
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
  ];
}

async function getAccountById(accountId) {
  const payload = await fireflyRequest(`/accounts/${accountId}`);

  return mapSingleFireflyAccount(payload);
}

async function listTransactions() {
  const payload = await fetchAllPages(
    "/transactions",
    { limit: 100 },
    "transactions"
  );

  return mapFireflyTransactions(payload);
}

async function listBudgets() {
  const payload = await fetchAllPages("/budgets", {}, "budgets");

  return mapFireflyBudgets(payload);
}

function buildTransactionBody({ type, amount, category, account }) {
  const safeCategory = (category || "").trim();
  const description =
    safeCategory ||
    (type === "income"
      ? `Income into ${account.name}`
      : `Expense from ${account.name}`);
  const split = {
    amount: amount.toFixed(2),
    date: new Date().toISOString(),
    description
  };

  if (safeCategory) {
    split.category_name = safeCategory;
  }

  if (type === "expense") {
    split.type = "withdrawal";
    split.source_id = String(account.id);
    split.destination_name = safeCategory || "General expenses";
  } else if (type === "income") {
    if (account.type === "credit") {
      throw new AppError("Income is not allowed on a credit account.", {
        status: 400,
        code: "INVALID_TRANSACTION"
      });
    }

    split.type = "deposit";
    split.source_name = safeCategory || "General income";
    split.destination_id = String(account.id);
  } else {
    throw new AppError(`Unsupported transaction type: ${type}`, {
      status: 400,
      code: "INVALID_TRANSACTION_TYPE"
    });
  }

  return {
    error_if_duplicate_hash: false,
    apply_rules: true,
    fire_webhooks: true,
    transactions: [split]
  };
}

async function createTransaction(input) {
  const normalizedType = String(input.type || "").toLowerCase();
  const amount = Number(input.amount);
  const accountId = input.account_id;

  if (!normalizedType || !Number.isFinite(amount) || amount <= 0 || !accountId) {
    throw new AppError("Missing required transaction fields.", {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const account = await getAccountById(accountId);
  const body = buildTransactionBody({
    type: normalizedType,
    amount,
    category: input.category,
    account
  });
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

module.exports = {
  listAccounts,
  listTransactions,
  listBudgets,
  createTransaction,
  deleteTransaction
};
