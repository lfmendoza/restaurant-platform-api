const { ObjectId } = require("mongodb");
const AppError = require("./errors/AppError");

function requireFields(data, fields) {
  const missing = fields.filter(
    (f) => data[f] === undefined || data[f] === null || data[f] === ""
  );
  if (missing.length > 0) {
    throw AppError.badRequest(`Missing required fields: ${missing.join(", ")}`);
  }
}

function toObjectId(value, fieldName = "id") {
  if (!value) throw AppError.badRequest(`${fieldName} is required`);
  if (value instanceof ObjectId) return value;
  if (typeof value !== "string" || !ObjectId.isValid(value)) {
    throw AppError.badRequest(`Invalid ${fieldName} format`);
  }
  return new ObjectId(value);
}

function requirePositiveNumber(value, fieldName) {
  const num = Number(value);
  if (Number.isNaN(num) || num <= 0) {
    throw AppError.badRequest(`${fieldName} must be a positive number`);
  }
  return num;
}

function requireIntInRange(value, fieldName, min, max) {
  const num = parseInt(value, 10);
  if (Number.isNaN(num) || num < min || num > max) {
    throw AppError.badRequest(`${fieldName} must be an integer between ${min} and ${max}`);
  }
  return num;
}

module.exports = { requireFields, toObjectId, requirePositiveNumber, requireIntInRange };
