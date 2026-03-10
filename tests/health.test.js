jest.mock("../src/db");

const request = require("supertest");
const app = require("../src/app");

describe("GET /health", () => {
  it("returns status ok with database name", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toEqual({
      status: "ok",
      db: expect.any(String),
    });
  });

  it("redirects root to /docs", async () => {
    const res = await request(app).get("/").expect(302);
    expect(res.headers.location).toBe("/docs");
  });
});
