// ===============================
// PERSONAL CFO SERVER
// ===============================

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
const PORT = 3000;

// ===============================
// MIDDLEWARE
// ===============================

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

  // ACCOUNTS TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('bank','credit')),
      balance REAL DEFAULT 0,
      credit_limit REAL DEFAULT 0
    )
  `);

  // TRANSACTIONS TABLE
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

// ROOT CHECK
app.get("/", (req, res) => {
  res.json({ message: "Personal CFO API running" });
});

// ===============================
// GET ALL TRANSACTIONS
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
// ADD TRANSACTION
// ===============================

app.post("/transactions", (req, res) => {

  let { type, amount, category } = req.body;

  if (!type || !amount) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // 🔥 normalize to lowercase
  type = type.toLowerCase();

  const allowedTypes = ["income", "expense", "transfer"];

  if (!allowedTypes.includes(type)) {
    return res.status(400).json({ error: "Invalid transaction type" });
  }

  const date = new Date().toISOString();

  db.run(
    `INSERT INTO transactions (type, amount, category, date)
     VALUES (?, ?, ?, ?)`,
    [type, amount, category || null, date],
    function (err) {

      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Insert failed" });
      }

      res.json({
        success: true,
        id: this.lastID
      });

    }
  );

});

// ===============================
// DELETE TRANSACTION
// ===============================

app.delete("/transactions/:id", (req, res) => {

  const { id } = req.params;

  db.run(
    `DELETE FROM transactions WHERE id = ?`,
    [id],
    function (err) {

      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Delete failed" });
      }

      res.json({ success: true });

    }
  );

});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
