const request = require("supertest");
const { connect, getClient } = require("../src/db");
const app = require("../src/app");

beforeAll(async () => { await connect(); }, 30000);
afterAll(async () => { const c = getClient(); if (c) await c.close(); });

describe("Restaurants endpoints", () => {
  it("GET /restaurants should return an array with data", async () => {
    const res = await request(app).get("/restaurants?limit=3").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("name");
    expect(res.body[0]).toHaveProperty("cuisineTypes");
  });

  it("GET /restaurants/search requires lat and lng", async () => {
    const res = await request(app).get("/restaurants/search").expect(400);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /restaurants/search with valid coords returns results", async () => {
    const res = await request(app)
      .get("/restaurants/search?lat=14.6&lng=-90.5")
      .expect(200);
    expect(res.body).toHaveProperty("restaurants");
    expect(Array.isArray(res.body.restaurants)).toBe(true);
  });
});
