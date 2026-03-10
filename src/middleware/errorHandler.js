function errorHandler(err, _req, res, _next) {
  if (err.isOperational) {
    const body = { error: err.message };
    if (err.details) Object.assign(body, err.details);
    return res.status(err.statusCode).json(body);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "key";
    return res.status(409).json({ error: `Duplicate value for ${field}` });
  }

  console.error("Unexpected error:", err);
  res.status(500).json({ error: err.message });
}

module.exports = errorHandler;
