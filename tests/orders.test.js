const request = require("supertest");
const { connect, getClient } = require("../src/db");
const app = require("../src/app");

beforeAll(async () => { await connect(); }, 30000);
afterAll(async () => { const c = getClient(); if (c) await c.close(); });

describe("Orders endpoints", () => {
  it("GET /orders returns an array with order data", async () => {
    const res = await request(app).get("/orders?limit=3").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("orderNumber");
    expect(res.body[0]).toHaveProperty("status");
    expect(res.body[0]).toHaveProperty("items");
    expect(res.body[0]).toHaveProperty("statusHistory");
  });

  it("GET /orders can filter by status", async () => {
    const res = await request(app)
      .get("/orders?status=delivered&limit=3")
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach((order) => {
      expect(order.status).toBe("delivered");
    });
  });
});
