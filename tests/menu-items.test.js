const request = require("supertest");
const { connect, getClient } = require("../src/db");
const app = require("../src/app");

beforeAll(async () => { await connect(); }, 30000);
afterAll(async () => { const c = getClient(); if (c) await c.close(); });

describe("Menu Items endpoints", () => {
  it("GET /menu-items returns items with correct fields", async () => {
    const res = await request(app).get("/menu-items?limit=5").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("name");
    expect(res.body[0]).toHaveProperty("price");
    expect(res.body[0]).toHaveProperty("category");
    expect(res.body[0]).toHaveProperty("allergens");
  });

  it("GET /menu-items can filter by category", async () => {
    const res = await request(app)
      .get("/menu-items?category=Postres&limit=5")
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach((item) => {
      expect(item.category).toBe("Postres");
    });
  });

  it("Categories are coherent with dish names", async () => {
    const res = await request(app)
      .get("/menu-items?category=Bebidas&limit=10")
      .expect(200);
    const beverageNames = ["Café", "Té", "Limonada", "Agua", "Jugo", "Smoothie", "Coca-Cola", "Cerveza"];
    res.body.forEach((item) => {
      const matchesBeverage = beverageNames.some((b) => item.name.includes(b));
      expect(matchesBeverage).toBe(true);
    });
  });
});
