const fs = require("fs");
const path = require("path");

const envPath = path.join(process.cwd(), ".env");

function parseEnvLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const normalized = trimmed.startsWith("export ")
    ? trimmed.slice(7)
    : trimmed;
  const separatorIndex = normalized.indexOf("=");

  if (separatorIndex === -1) {
    return null;
  }

  const key = normalized.slice(0, separatorIndex).trim();
  let value = normalized.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadEnvFile() {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const fileContents = fs.readFileSync(envPath, "utf8");

  fileContents.split(/\r?\n/).forEach((line) => {
    const parsed = parseEnvLine(line);

    if (!parsed || process.env[parsed.key] !== undefined) {
      return;
    }

    process.env[parsed.key] = parsed.value;
  });
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

loadEnvFile();

const config = {
  port: Number.parseInt(process.env.PORT, 10) || 3000,
  fireflyBaseUrl: normalizeBaseUrl(process.env.FIREFLY_BASE_URL || ""),
  fireflyAccessToken: (process.env.FIREFLY_ACCESS_TOKEN || "").trim()
};

function getMissingConfig() {
  const missing = [];

  if (!config.fireflyBaseUrl) {
    missing.push("FIREFLY_BASE_URL");
  }

  if (!config.fireflyAccessToken) {
    missing.push("FIREFLY_ACCESS_TOKEN");
  }

  return missing;
}

module.exports = {
  config,
  getMissingConfig
};
