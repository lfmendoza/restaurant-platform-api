jest.mock("../src/db");

const request = require("supertest");
const { getDb } = require("../src/db");
const app = require("../src/app");
const { setupMockDb, createCursor } = require("./helpers/mock-db");
const { ID, ORDERS, REVIEWS } = require("./helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb));
});

describe("POST /reviews", () => {
  it("creates review for a delivered order", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.delivered);
    col("reviews").findOne.mockResolvedValue(null);
    col("reviews").insertOne.mockResolvedValue({ insertedId: ID.review1 });

    const res = await request(app)
      .post("/reviews")
      .send({
        userId: ID.user1.toString(),
        orderId: ID.order1.toString(),
        restaurantId: ID.rest1.toString(),
        rating: 5,
        title: "Excelente",
        comment: "Muy bueno",
        tags: ["recomendado"],
      })
      .expect(201);

    expect(res.body.rating).toBe(5);
    expect(res.body.tags).toContain("recomendado");
    expect(res.body.restaurantResponse).toBeNull();

    const orderQuery = col("orders").findOne.mock.calls[0][0];
    expect(orderQuery.status).toBe("delivered");
  });

  it("rejects review when order not delivered", async () => {
    col("orders").findOne.mockResolvedValue(null);

    const res = await request(app)
      .post("/reviews")
      .send({
        userId: ID.user1.toString(),
        orderId: ID.order2.toString(),
        restaurantId: ID.rest1.toString(),
        rating: 3,
      })
      .expect(400);

    expect(res.body.error).toMatch(/not found.*not delivered/i);
  });

  it("prevents duplicate review for same order (409)", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.delivered);
    col("reviews").findOne.mockResolvedValue(REVIEWS.positive);

    const res = await request(app)
      .post("/reviews")
      .send({
        userId: ID.user1.toString(),
        orderId: ID.order1.toString(),
        restaurantId: ID.rest1.toString(),
        rating: 4,
      })
      .expect(409);

    expect(res.body.error).toMatch(/already submitted/i);
  });
});

describe("GET /reviews", () => {
  it("returns paginated list with filters", async () => {
    col("reviews").find.mockReturnValue(createCursor([REVIEWS.positive]));

    const res = await request(app)
      .get(`/reviews?restaurantId=${ID.rest1}&limit=5`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty("rating");
    expect(res.body[0]).toHaveProperty("tags");
  });

  it("applies rating filter", async () => {
    col("reviews").find.mockReturnValue(createCursor([]));

    await request(app).get("/reviews?rating=5").expect(200);

    const filter = col("reviews").find.mock.calls[0][0];
    expect(filter.rating).toBe(5);
  });

  it("applies tag filter (multikey index)", async () => {
    col("reviews").find.mockReturnValue(createCursor([]));

    await request(app).get("/reviews?tag=recomendado").expect(200);

    const filter = col("reviews").find.mock.calls[0][0];
    expect(filter.tags).toBe("recomendado");
  });

  it("applies text search", async () => {
    col("reviews").find.mockReturnValue(createCursor([]));

    await request(app).get("/reviews?q=excelente").expect(200);

    const filter = col("reviews").find.mock.calls[0][0];
    expect(filter.$text).toEqual({ $search: "excelente" });
  });
});

describe("GET /reviews/:id", () => {
  it("returns review", async () => {
    col("reviews").findOne.mockResolvedValue(REVIEWS.positive);

    const res = await request(app).get(`/reviews/${ID.review1}`).expect(200);
    expect(res.body.title).toBe("Excelente servicio");
  });

  it("returns 404", async () => {
    col("reviews").findOne.mockResolvedValue(null);
    await request(app).get(`/reviews/${ID.review1}`).expect(404);
  });
});

describe("PATCH /reviews/:id/response (embedded 1:1)", () => {
  it("sets restaurant response with timestamp", async () => {
    col("reviews").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const res = await request(app)
      .patch(`/reviews/${ID.review1}/response`)
      .send({ message: "Gracias por tu reseña" })
      .expect(200);

    expect(res.body.updated).toBe(1);
    const setArg = col("reviews").updateOne.mock.calls[0][1].$set;
    expect(setArg.restaurantResponse.message).toBe("Gracias por tu reseña");
    expect(setArg.restaurantResponse.respondedAt).toBeInstanceOf(Date);
  });

  it("returns 404 when review not found", async () => {
    col("reviews").updateOne.mockResolvedValue({ matchedCount: 0 });
    await request(app)
      .patch(`/reviews/${ID.review1}/response`)
      .send({ message: "Thanks" })
      .expect(404);
  });
});

describe("PATCH /reviews/:id/tag ($addToSet)", () => {
  it("adds tag without duplicates", async () => {
    col("reviews").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    await request(app)
      .patch(`/reviews/${ID.review1}/tag`)
      .send({ tag: "delicioso" })
      .expect(200);

    const update = col("reviews").updateOne.mock.calls[0][1];
    expect(update.$addToSet.tags).toBe("delicioso");
  });
});

describe("PATCH /reviews/:id/helpful ($addToSet)", () => {
  it("adds voter ID to helpfulVotes", async () => {
    col("reviews").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    await request(app)
      .patch(`/reviews/${ID.review1}/helpful`)
      .send({ voterId: ID.user2.toString() })
      .expect(200);

    const update = col("reviews").updateOne.mock.calls[0][1];
    expect(update.$addToSet.helpfulVotes).toEqual(ID.user2);
  });
});

describe("DELETE /reviews/:id", () => {
  it("deletes review", async () => {
    col("reviews").deleteOne.mockResolvedValue({ deletedCount: 1 });
    const res = await request(app).delete(`/reviews/${ID.review1}`).expect(200);
    expect(res.body.deleted).toBe(1);
  });

  it("returns 404", async () => {
    col("reviews").deleteOne.mockResolvedValue({ deletedCount: 0 });
    await request(app).delete(`/reviews/${ID.review1}`).expect(404);
  });
});

describe("DELETE /reviews (deleteMany)", () => {
  it("deletes by restaurantId", async () => {
    col("reviews").deleteMany.mockResolvedValue({ deletedCount: 10 });

    const res = await request(app)
      .delete(`/reviews?restaurantId=${ID.rest1}`)
      .expect(200);

    expect(res.body.deleted).toBe(10);
  });

  it("requires at least one filter", async () => {
    await request(app).delete("/reviews").expect(400);
  });
});
