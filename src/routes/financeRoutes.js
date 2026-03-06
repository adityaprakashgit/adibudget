const express = require("express");

const { config, getMissingConfig } = require("../config/env");
const financeService = require("../services/fireflyFinanceService");
const v2Service = require("../services/adibudgetV2Service");

const financeRouter = express.Router();

financeRouter.get("/api/health", async (req, res) => {
  const missing = getMissingConfig();
  const backend = {
    port: config.port,
    fireflyBaseUrl: config.fireflyBaseUrl || "",
    hasAccessToken: Boolean(config.fireflyAccessToken)
  };

  if (missing.length) {
    res.json({
      ok: false,
      configured: false,
      missing,
      backend
    });
    return;
  }

  const health = await financeService.getConnectionHealth();
  res.json({
    ...health,
    missing,
    backend
  });
});

financeRouter.get("/accounts", async (req, res) => {
  const accounts = await financeService.listAccounts();
  res.json(accounts);
});

financeRouter.post("/accounts", async (req, res) => {
  const result = await financeService.createAccount(req.body);
  res.status(201).json(result);
});

financeRouter.put("/accounts/:id", async (req, res) => {
  const result = await financeService.updateAccount(req.params.id, req.body);
  res.json(result);
});

financeRouter.post("/accounts/:id/archive", async (req, res) => {
  const result = await financeService.archiveAccount(req.params.id);
  res.json(result);
});

financeRouter.get("/transactions", async (req, res) => {
  const transactions = await financeService.listTransactions(req.query);
  res.json(transactions);
});

financeRouter.post("/transactions", async (req, res) => {
  const result = await financeService.createTransaction(req.body);
  res.status(201).json(result);
});

financeRouter.put("/transactions/:id", async (req, res) => {
  const result = await financeService.updateTransaction(
    req.params.id,
    req.body
  );
  res.json(result);
});

financeRouter.delete("/transactions/:id", async (req, res) => {
  const result = await financeService.deleteTransaction(req.params.id);
  res.json(result);
});

financeRouter.get("/budgets", async (req, res) => {
  const budgets = await financeService.listBudgets();
  res.json(budgets);
});

financeRouter.post("/budgets", async (req, res) => {
  const result = await financeService.createBudget(req.body);
  res.status(201).json(result);
});

financeRouter.put("/budgets/:id", async (req, res) => {
  const result = await financeService.updateBudget(req.params.id, req.body);
  res.json(result);
});

financeRouter.delete("/budgets/:id", async (req, res) => {
  const result = await financeService.deleteBudget(req.params.id);
  res.json(result);
});

financeRouter.get("/categories", async (req, res) => {
  const categories = await financeService.listCategories();
  res.json(categories);
});

financeRouter.post("/categories", async (req, res) => {
  const result = await financeService.createCategory(req.body);
  res.status(201).json(result);
});

financeRouter.put("/categories/:id", async (req, res) => {
  const result = await financeService.updateCategory(req.params.id, req.body);
  res.json(result);
});

financeRouter.delete("/categories/:id", async (req, res) => {
  const result = await financeService.deleteCategory(req.params.id);
  res.json(result);
});

financeRouter.get("/tags", async (req, res) => {
  const tags = await financeService.listTags();
  res.json(tags);
});

financeRouter.post("/tags", async (req, res) => {
  const result = await financeService.createTag(req.body);
  res.status(201).json(result);
});

financeRouter.put("/tags/:id", async (req, res) => {
  const result = await financeService.updateTag(req.params.id, req.body);
  res.json(result);
});

financeRouter.delete("/tags/:id", async (req, res) => {
  const result = await financeService.deleteTag(req.params.id);
  res.json(result);
});

financeRouter.get("/recurring", async (req, res) => {
  const recurrences = await financeService.listRecurrences();
  res.json(recurrences);
});

financeRouter.post("/recurring", async (req, res) => {
  const result = await financeService.createRecurrence(req.body);
  res.status(201).json(result);
});

financeRouter.put("/recurring/:id", async (req, res) => {
  const result = await financeService.updateRecurrence(req.params.id, req.body);
  res.json(result);
});

financeRouter.delete("/recurring/:id", async (req, res) => {
  const result = await financeService.deleteRecurrence(req.params.id);
  res.json(result);
});

financeRouter.post("/api/transactions/quick", async (req, res) => {
  if (req.body && req.body.preview) {
    const result = await v2Service.previewQuickTransaction(
      req.body.input,
      req.body
    );
    res.json(result);
    return;
  }

  const result = await v2Service.createQuickTransaction(req.body.input, req.body);
  res.status(201).json(result);
});

financeRouter.get("/api/suggestions", async (req, res) => {
  const result = await v2Service.getSuggestions(req.query.q || "");
  res.json(result);
});

financeRouter.get("/api/search", async (req, res) => {
  const result = await v2Service.searchTransactions(req.query);
  res.json(result);
});

financeRouter.get("/api/review/monthly", async (req, res) => {
  const result = await v2Service.getMonthlyReview(req.query.month);
  res.json(result);
});

financeRouter.get("/api/budgets/projection", async (req, res) => {
  const result = await v2Service.getBudgetProjection(req.query.month);
  res.json(result);
});

module.exports = { financeRouter };
