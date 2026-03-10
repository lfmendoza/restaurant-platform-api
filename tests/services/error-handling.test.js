const AppError = require("../../src/errors/AppError");
const errorHandler = require("../../src/middleware/errorHandler");

describe("AppError", () => {
  it("creates operational error with status code", () => {
    const err = new AppError("something wrong", 422);
    expect(err.message).toBe("something wrong");
    expect(err.statusCode).toBe(422);
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });

  describe("factory methods", () => {
    it("badRequest returns 400", () => {
      const err = AppError.badRequest("invalid input");
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe("invalid input");
    });

    it("badRequest with details", () => {
      const err = AppError.badRequest("invalid", { allowed: ["a", "b"] });
      expect(err.details).toEqual({ allowed: ["a", "b"] });
    });

    it("notFound returns 404 with formatted message", () => {
      const err = AppError.notFound("User");
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe("User not found");
    });

    it("conflict returns 409", () => {
      const err = AppError.conflict("already exists");
      expect(err.statusCode).toBe(409);
      expect(err.message).toBe("already exists");
    });
  });
});

describe("errorHandler middleware", () => {
  let res;
  const next = jest.fn();

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it("handles AppError with correct status and message", () => {
    const err = AppError.notFound("Order");
    errorHandler(err, {}, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Order not found" });
  });

  it("merges AppError.details into response body", () => {
    const err = AppError.badRequest("invalid transition", { allowed: ["a"] });
    errorHandler(err, {}, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "invalid transition",
      allowed: ["a"],
    });
  });

  it("handles MongoDB duplicate key error (code 11000)", () => {
    const err = new Error("dup key");
    err.code = 11000;
    err.keyPattern = { email: 1 };
    errorHandler(err, {}, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: "Duplicate value for email" });
  });

  it("handles unexpected errors with 500", () => {
    const err = new Error("unexpected crash");
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    errorHandler(err, {}, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "unexpected crash" });
    consoleSpy.mockRestore();
  });
});
