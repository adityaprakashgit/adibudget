const express = require("express");

const { getMissingConfig } = require("../config/env");
const financeService = require("../services/fireflyFinanceService");

const financeRouter = express.Router();

financeRouter.get("/api/health", (req, res) => {
  const missing = getMissingConfig();

  res.json({
    ok: missing.length === 0,
    configured: missing.length === 0,
    missing
  });
});

financeRouter.get("/accounts", async (req, res) => {
  const accounts = await financeService.listAccounts();
  res.json(accounts);
});

financeRouter.get("/transactions", async (req, res) => {
  const transactions = await financeService.listTransactions();
  res.json(transactions);
});

financeRouter.get("/budgets", async (req, res) => {
  const budgets = await financeService.listBudgets();
  res.json(budgets);
});

financeRouter.post("/transactions", async (req, res) => {
  const result = await financeService.createTransaction(req.body);
  res.status(201).json(result);
});

financeRouter.delete("/transactions/:id", async (req, res) => {
  const result = await financeService.deleteTransaction(req.params.id);
  res.json(result);
});

module.exports = { financeRouter };
