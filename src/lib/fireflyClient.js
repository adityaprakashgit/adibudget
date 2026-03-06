const { config, getMissingConfig } = require("../config/env");
const { AppError } = require("./AppError");

function buildUrl(resourcePath, query = {}) {
  const baseUrl = new URL(config.fireflyBaseUrl);
  const url = new URL(`/api/v1${resourcePath}`, baseUrl);

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

async function parseResponseBody(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new AppError("Firefly returned malformed JSON.", {
      status: 502,
      code: "FIREFLY_MALFORMED_RESPONSE",
      details: { bodyPreview: text.slice(0, 500) }
    });
  }
}

function extractErrorMessage(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }

  if (payload.errors && typeof payload.errors === "object") {
    const messages = Object.values(payload.errors)
      .flat()
      .filter(Boolean)
      .map((value) => String(value));

    if (messages.length) {
      return messages.join(", ");
    }
  }

  return "";
}

async function fireflyRequest(resourcePath, options = {}) {
  const missing = getMissingConfig();

  if (missing.length) {
    throw new AppError(
      `Missing environment configuration: ${missing.join(", ")}`,
      {
        status: 500,
        code: "FIREFLY_CONFIG_MISSING"
      }
    );
  }

  const { method = "GET", body, query } = options;
  let response;

  try {
    response = await fetch(buildUrl(resourcePath, query), {
      method,
      headers: {
        Accept: "application/vnd.api+json",
        Authorization: `Bearer ${config.fireflyAccessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    throw new AppError("Firefly III is unavailable.", {
      status: 503,
      code: "FIREFLY_UNAVAILABLE",
      details: { message: error.message }
    });
  }

  const payload = await parseResponseBody(response);

  if (response.status === 401 || response.status === 403) {
    throw new AppError(
      "Firefly access token is invalid or missing required permissions.",
      {
        status: 401,
        code: "FIREFLY_AUTH_INVALID",
        details: payload
      }
    );
  }

  if (!response.ok) {
    throw new AppError(
      extractErrorMessage(payload) ||
        `Firefly request failed with status ${response.status}.`,
      {
        status: response.status >= 500 ? 502 : response.status,
        code: "FIREFLY_REQUEST_FAILED",
        details: payload
      }
    );
  }

  return payload;
}

module.exports = { fireflyRequest };
