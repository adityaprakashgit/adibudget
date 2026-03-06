const fs = require("fs");
const path = require("path");

const dataDir = path.join(process.cwd(), "data");
const storePath = path.join(dataDir, "ux-preferences.json");

const defaultStore = {
  favoriteAccounts: [],
  favoriteCategories: [],
  recentSearches: [],
  quickEntryDefaults: {
    type: "expense",
    account_id: "",
    category_id: "",
    date_mode: "today"
  }
};

function ensureStoreDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function cloneDefaults() {
  return JSON.parse(JSON.stringify(defaultStore));
}

function normalizeStore(input = {}) {
  const store = cloneDefaults();

  if (Array.isArray(input.favoriteAccounts)) {
    store.favoriteAccounts = input.favoriteAccounts.map(String);
  }

  if (Array.isArray(input.favoriteCategories)) {
    store.favoriteCategories = input.favoriteCategories.map(String);
  }

  if (Array.isArray(input.recentSearches)) {
    store.recentSearches = input.recentSearches
      .filter((entry) => entry && typeof entry === "object")
      .slice(0, 12)
      .map((entry) => ({
        query: String(entry.query || ""),
        created_at: String(entry.created_at || new Date().toISOString())
      }));
  }

  if (input.quickEntryDefaults && typeof input.quickEntryDefaults === "object") {
    store.quickEntryDefaults = {
      ...store.quickEntryDefaults,
      ...input.quickEntryDefaults
    };
  }

  return store;
}

function readStore() {
  ensureStoreDir();

  if (!fs.existsSync(storePath)) {
    return cloneDefaults();
  }

  try {
    const raw = fs.readFileSync(storePath, "utf8");
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    return cloneDefaults();
  }
}

function writeStore(nextStore) {
  ensureStoreDir();
  fs.writeFileSync(storePath, JSON.stringify(normalizeStore(nextStore), null, 2));
}

function getPreferences() {
  return readStore();
}

function addRecentSearch(query) {
  const normalizedQuery = String(query || "").trim();

  if (!normalizedQuery) {
    return readStore();
  }

  const store = readStore();
  const deduped = store.recentSearches.filter(
    (entry) => entry.query.toLowerCase() !== normalizedQuery.toLowerCase()
  );

  store.recentSearches = [
    {
      query: normalizedQuery,
      created_at: new Date().toISOString()
    },
    ...deduped
  ].slice(0, 12);

  writeStore(store);
  return store;
}

function setQuickEntryDefaults(input = {}) {
  const store = readStore();
  store.quickEntryDefaults = {
    ...store.quickEntryDefaults,
    ...input
  };
  writeStore(store);
  return store.quickEntryDefaults;
}

module.exports = {
  getPreferences,
  addRecentSearch,
  setQuickEntryDefaults
};
