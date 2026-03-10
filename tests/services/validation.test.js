const { ObjectId } = require("mongodb");
const { requireFields, toObjectId, requirePositiveNumber, requireIntInRange } = require("../../src/validation");

describe("requireFields", () => {
  it("does nothing when all fields are present", () => {
    expect(() => requireFields({ a: 1, b: "x" }, ["a", "b"])).not.toThrow();
  });

  it("throws 400 listing missing fields", () => {
    expect(() => requireFields({ a: 1 }, ["a", "b", "c"])).toThrow(/b, c/);
  });

  it("treats null, undefined, and empty string as missing", () => {
    expect(() => requireFields({ a: null, b: undefined, c: "" }, ["a", "b", "c"]))
      .toThrow(/a, b, c/);
  });

  it("accepts 0 and false as valid values", () => {
    expect(() => requireFields({ a: 0, b: false }, ["a", "b"])).not.toThrow();
  });
});

describe("toObjectId", () => {
  it("converts valid 24-char hex string to ObjectId", () => {
    const oid = toObjectId("aaaaaaaaaaaaaaaaaaaaaaaa", "testId");
    expect(oid).toBeInstanceOf(ObjectId);
  });

  it("returns same ObjectId if already an ObjectId", () => {
    const original = new ObjectId();
    const result = toObjectId(original, "testId");
    expect(result).toBe(original);
  });

  it("throws 400 when value is null/undefined", () => {
    expect(() => toObjectId(null, "testId")).toThrow(/testId.*required/i);
  });

  it("throws 400 on invalid format", () => {
    expect(() => toObjectId("not-an-id", "testId")).toThrow(/testId.*format/i);
  });

  it("throws 400 on numeric input", () => {
    expect(() => toObjectId(12345, "testId")).toThrow(/testId.*format/i);
  });
});

describe("requirePositiveNumber", () => {
  it("accepts positive numbers", () => {
    expect(requirePositiveNumber(5, "price")).toBe(5);
    expect(requirePositiveNumber("10.5", "price")).toBe(10.5);
  });

  it("throws 400 on zero", () => {
    expect(() => requirePositiveNumber(0, "price")).toThrow(/price.*positive/i);
  });

  it("throws 400 on negative", () => {
    expect(() => requirePositiveNumber(-1, "price")).toThrow(/price.*positive/i);
  });

  it("throws 400 on NaN", () => {
    expect(() => requirePositiveNumber("abc", "price")).toThrow(/price.*positive/i);
  });
});

describe("requireIntInRange", () => {
  it("accepts integers within range", () => {
    expect(requireIntInRange(3, "rating", 1, 5)).toBe(3);
    expect(requireIntInRange("1", "rating", 1, 5)).toBe(1);
    expect(requireIntInRange("5", "rating", 1, 5)).toBe(5);
  });

  it("throws 400 below minimum", () => {
    expect(() => requireIntInRange(0, "rating", 1, 5)).toThrow(/rating.*between 1 and 5/i);
  });

  it("throws 400 above maximum", () => {
    expect(() => requireIntInRange(6, "rating", 1, 5)).toThrow(/rating.*between 1 and 5/i);
  });

  it("throws 400 on NaN", () => {
    expect(() => requireIntInRange("abc", "rating", 1, 5)).toThrow(/rating.*between 1 and 5/i);
  });
});
