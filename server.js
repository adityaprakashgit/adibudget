// ===============================
// PERSONAL CFO SERVER
// ===============================

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ===============================
// DATABASE
// ===============================

const db = new sqlite3.Database("./database.db", (err) => {
  if (err) {
    console.error("Database connection error:", err);
  } else {
    console.log("Connected to SQLite database.");
  }
});

// ===============================
// CREATE TABLES
// ===============================

db.serialize(() => {

  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('bank','credit')),
      balance REAL DEFAULT 0,
      credit_limit REAL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
      amount REAL NOT NULL,
      category TEXT,
      account_id INTEGER,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    )
  `);

});

// ===============================
// ROUTES
// ===============================

app.get("/", (req, res) => {
  res.json({ message: "Personal CFO API running" });
});

// ===============================
// GET TRANSACTIONS
// ===============================

app.get("/transactions", (req, res) => {

  db.all(
    `SELECT * FROM transactions ORDER BY date DESC`,
    [],
    (err, rows) => {

      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch transactions" });
      }

      res.json(rows);
    }
  );

});

// ===============================
// GET ACCOUNTS
// ===============================

app.get("/accounts", (req, res) => {

  db.all(
    `SELECT * FROM accounts`,
    [],
    (err, rows) => {

      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch accounts" });
      }

      res.json(rows);
    }
  );

});

// ===============================
// ADD TRANSACTION (SMART LOGIC)
// ===============================

app.post("/transactions", (req, res) => {

  let { type, amount, category, account_id } = req.body;

  if (!type || !amount || !account_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  type = type.toLowerCase();
  amount = Number(amount);

  const date = new Date().toISOString();

  db.run(
    `INSERT INTO transactions (type, amount, category, account_id, date)
     VALUES (?, ?, ?, ?, ?)`,
    [type, amount, category || null, account_id, date],
    function (err) {

      if (err) {
        console.error("Insert error:", err);
        return res.status(500).json({ error: "Insert failed" });
      }

      const insertedId = this.lastID;

      db.get(
        `SELECT * FROM accounts WHERE id = ?`,
        [account_id],
        (err2, account) => {

          if (err2 || !account) {
            return res.status(404).json({ error: "Account not found" });
          }

          let balanceChange = 0;

          // BANK LOGIC
          if (account.type === "bank") {
            if (type === "income") balanceChange = amount;
            if (type === "expense") balanceChange = -amount;
          }

          // CREDIT CARD LOGIC
          if (account.type === "credit") {
            if (type === "expense") balanceChange = amount; // liability increases
            if (type === "income") {
              return res.status(400).json({
                error: "Income not allowed on credit card"
              });
            }
          }

          db.run(
            `UPDATE accounts SET balance = balance + ? WHERE id = ?`,
            [balanceChange, account_id],
            function (err3) {

              if (err3) {
                console.error("Balance update error:", err3);
                return res.status(500).json({ error: "Balance update failed" });
              }

              res.json({ success: true, id: insertedId });

            }
          );

        }
      );

    }
  );

});

// ===============================
// DELETE TRANSACTION (SMART REVERSE)
// ===============================

app.delete("/transactions/:id", (req, res) => {

  const { id } = req.params;

  db.get(
    `SELECT * FROM transactions WHERE id = ?`,
    [id],
    (err, transaction) => {

      if (err || !transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      const { type, amount, account_id } = transaction;

      db.get(
        `SELECT * FROM accounts WHERE id = ?`,
        [account_id],
        (err2, account) => {

          if (err2 || !account) {
            return res.status(404).json({ error: "Account not found" });
          }

          let reverseChange = 0;

          // BANK LOGIC
          if (account.type === "bank") {
            if (type === "income") reverseChange = -amount;
            if (type === "expense") reverseChange = amount;
          }

          // CREDIT CARD LOGIC
          if (account.type === "credit") {
            if (type === "expense") reverseChange = -amount;
          }

          db.run(
            `UPDATE accounts SET balance = balance + ? WHERE id = ?`,
            [reverseChange, account_id],
            function (err3) {

              if (err3) {
                console.error("Balance revert error:", err3);
                return res.status(500).json({ error: "Balance revert failed" });
              }

              db.run(
                `DELETE FROM transactions WHERE id = ?`,
                [id],
                function (err4) {

                  if (err4) {
                    return res.status(500).json({ error: "Delete failed" });
                  }

                  res.json({ success: true });

                }
              );

            }
          );

        }
      );

    }
  );

});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
