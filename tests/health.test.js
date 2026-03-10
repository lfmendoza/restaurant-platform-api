const request = require("supertest");
const { connect, getClient } = require("../src/db");
const app = require("../src/app");

beforeAll(async () => { await connect(); }, 30000);
afterAll(async () => { const c = getClient(); if (c) await c.close(); });

describe("Healthcheck", () => {
  it("GET /health should return ok with db name", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toHaveProperty("status", "ok");
    expect(typeof res.body.db).toBe("string");
  });
});
