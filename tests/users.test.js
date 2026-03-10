jest.mock("../src/db");

const request = require("supertest");
const { getDb, getReadDb } = require("../src/db");
const app = require("../src/app");
const { setupMockDb, createCursor } = require("./helpers/mock-db");
const { ID, USERS } = require("./helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb, null, null, getReadDb));
});

describe("POST /users", () => {
  it("creates a user with valid data", async () => {
    col("users").insertOne.mockResolvedValue({ insertedId: ID.user1 });

    const res = await request(app)
      .post("/users")
      .send({ email: "new@test.com", name: "New User", role: "customer" })
      .expect(201);

    expect(res.body).toMatchObject({ email: "new@test.com", name: "New User", role: "customer" });
    expect(res.body).toHaveProperty("_id");
    expect(res.body).toHaveProperty("createdAt");
    expect(col("users").insertOne).toHaveBeenCalledTimes(1);
  });

  it("returns 409 on duplicate email", async () => {
    const dupError = new Error("duplicate key");
    dupError.code = 11000;
    col("users").insertOne.mockRejectedValue(dupError);

    const res = await request(app)
      .post("/users")
      .send({ email: "dup@test.com", name: "Dup" })
      .expect(409);

    expect(res.body.error).toBe("Email already registered");
  });
});

describe("GET /users", () => {
  it("returns paginated list with projection", async () => {
    col("users").find.mockReturnValue(createCursor([USERS.customer, USERS.admin]));

    const res = await request(app).get("/users?limit=10").expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(col("users").find).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ projection: expect.any(Object) })
    );
  });

  it("filters by role", async () => {
    col("users").find.mockReturnValue(createCursor([USERS.admin]));

    await request(app).get("/users?role=restaurant_admin").expect(200);

    expect(col("users").find).toHaveBeenCalledWith(
      { role: "restaurant_admin" },
      expect.any(Object)
    );
  });
});

describe("GET /users/:id", () => {
  it("returns user with orderHistory sliced", async () => {
    col("users").findOne.mockResolvedValue(USERS.customer);

    const res = await request(app).get(`/users/${ID.user1}`).expect(200);

    expect(res.body.email).toBe("customer@test.com");
    expect(col("users").findOne).toHaveBeenCalledWith(
      { _id: ID.user1 },
      expect.objectContaining({
        projection: expect.objectContaining({ orderHistory: { $slice: -10 } }),
      })
    );
  });

  it("returns 404 for non-existent user", async () => {
    col("users").findOne.mockResolvedValue(null);

    const res = await request(app).get(`/users/${ID.user1}`).expect(404);
    expect(res.body.error).toBe("User not found");
  });
});

describe("PATCH /users/:id", () => {
  it("updates name and phone", async () => {
    col("users").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const res = await request(app)
      .patch(`/users/${ID.user1}`)
      .send({ name: "Updated", phone: "+502 9999" })
      .expect(200);

    expect(res.body.updated).toBe(1);
    const updateArg = col("users").updateOne.mock.calls[0][1];
    expect(updateArg.$set.name).toBe("Updated");
    expect(updateArg.$set.phone).toBe("+502 9999");
  });

  it("returns 404 for non-existent user", async () => {
    col("users").updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    await request(app)
      .patch(`/users/${ID.user1}`)
      .send({ name: "X" })
      .expect(404);
  });
});

describe("PATCH /users/:id/favorites", () => {
  it("adds restaurant to favorites with $push + $slice (Subset Pattern)", async () => {
    col("users").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const res = await request(app)
      .patch(`/users/${ID.user1}/favorites`)
      .send({ restaurantId: ID.rest1.toString() })
      .expect(200);

    expect(res.body.updated).toBe(1);
    const updateArg = col("users").updateOne.mock.calls[0][1];
    expect(updateArg.$push.favoriteRestaurants).toEqual(
      expect.objectContaining({ $each: expect.any(Array), $slice: -20 })
    );
  });
});

describe("DELETE /users/:id", () => {
  it("deletes existing user", async () => {
    col("users").deleteOne.mockResolvedValue({ deletedCount: 1 });

    const res = await request(app).delete(`/users/${ID.user1}`).expect(200);
    expect(res.body.deleted).toBe(1);
  });

  it("returns 404 for non-existent user", async () => {
    col("users").deleteOne.mockResolvedValue({ deletedCount: 0 });

    await request(app).delete(`/users/${ID.user1}`).expect(404);
  });
});
