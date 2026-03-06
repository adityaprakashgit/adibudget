class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "AppError";
    this.status = options.status || 500;
    this.code = options.code || "APP_ERROR";
    this.details = options.details;
  }
}

module.exports = { AppError };
