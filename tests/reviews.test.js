const request = require("supertest");
const { connect, getClient } = require("../src/db");
const app = require("../src/app");

beforeAll(async () => { await connect(); }, 30000);
afterAll(async () => { const c = getClient(); if (c) await c.close(); });

describe("Reviews endpoints", () => {
  it("GET /reviews returns an array with review data", async () => {
    const res = await request(app).get("/reviews?limit=3").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("rating");
    expect(res.body[0]).toHaveProperty("title");
    expect(res.body[0]).toHaveProperty("tags");
  });
});
