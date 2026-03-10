const request = require("supertest");
const { connect, getClient } = require("../src/db");
const app = require("../src/app");

beforeAll(async () => { await connect(); }, 30000);
afterAll(async () => { const c = getClient(); if (c) await c.close(); });

describe("Analytics endpoints", () => {
  it("GET /analytics/top-restaurants returns array with restaurant data", async () => {
    const res = await request(app)
      .get("/analytics/top-restaurants?limit=5")
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("restaurant");
    expect(res.body[0]).toHaveProperty("avgRating");
  });

  it("GET /analytics/restaurant-stats returns OLAP data", async () => {
    const res = await request(app)
      .get("/analytics/restaurant-stats?limit=3")
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("totalRevenue");
    expect(res.body[0]).toHaveProperty("avgRating");
  });

  it("GET /analytics/best-selling-items returns results", async () => {
    const res = await request(app)
      .get("/analytics/best-selling-items?limit=5")
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("name");
    expect(res.body[0]).toHaveProperty("totalQty");
  });

  it("GET /analytics/tags returns tag distribution", async () => {
    const res = await request(app)
      .get("/analytics/tags?limit=5")
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("tag");
    expect(res.body[0]).toHaveProperty("count");
  });
});
