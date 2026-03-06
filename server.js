const path = require("path");
const express = require("express");
const cors = require("cors");

const { config, getMissingConfig } = require("./src/config/env");
const { financeRouter } = require("./src/routes/financeRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.use(financeRouter);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  const payload = {
    error: error.message || "Unexpected server error",
    code: error.code || "INTERNAL_SERVER_ERROR"
  };

  if (error.details) {
    payload.details = error.details;
  }

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json(payload);
});

app.listen(config.port, () => {
  const missing = getMissingConfig();
  const suffix = missing.length
    ? ` (missing ${missing.join(", ")})`
    : "";

  console.log(
    `Server running on http://localhost:${config.port}${suffix}`
  );
});
