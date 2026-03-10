const request = require("supertest");
const { connect, getClient } = require("../src/db");
const app = require("../src/app");

beforeAll(async () => { await connect(); }, 30000);
afterAll(async () => { const c = getClient(); if (c) await c.close(); });

describe("Users endpoints", () => {
  it("GET /users returns an array with user data", async () => {
    const res = await request(app).get("/users?limit=3").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("email");
    expect(res.body[0]).toHaveProperty("name");
    expect(res.body[0]).toHaveProperty("role");
  });

  it("GET /users can filter by role", async () => {
    const res = await request(app)
      .get("/users?role=restaurant_admin&limit=5")
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach((user) => {
      expect(user.role).toBe("restaurant_admin");
    });
  });
});
