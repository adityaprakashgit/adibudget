const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());


// Connect to SQLite DB
const db = new sqlite3.Database("./finance.db");

app.get("/", (req, res) => {
    res.send("Finance API Running");
});

// Create tables if not exists
db.serialize(() => {

  db.run(`
    CREATE TABLE IF NOT EXISTS banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      opening_balance REAL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS credit_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      credit_limit REAL,
      opening_outstanding REAL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      mode TEXT,
      amount REAL,
      source TEXT,
      destination TEXT,
      category TEXT,
      upi_app TEXT,
      emotional INTEGER,
      reimbursement INTEGER,
      notes TEXT
    )
  `);

});


// ===========================
// API ROUTES
// ===========================

// Add Transaction
app.post("/transactions", (req, res) => {
  const t = req.body;

  const stmt = db.prepare(`
    INSERT INTO transactions
    (date, mode, amount, source, destination, category, upi_app, emotional, reimbursement, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    t.date,
    t.mode,
    t.amount,
    t.source,
    t.destination,
    t.category,
    t.upi_app,
    t.emotional ? 1 : 0,
    t.reimbursement ? 1 : 0,
    t.notes,
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ success: true, id: this.lastID });
      }
    }
  );
});



// Get All Transactions
app.get("/transactions", (req, res) => {
  db.all("SELECT * FROM transactions ORDER BY date DESC", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

