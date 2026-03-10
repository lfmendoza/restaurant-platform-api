jest.mock("../../src/db");

const { getDb } = require("../../src/db");
const ReviewService = require("../../src/services/ReviewService");
const { setupMockDb } = require("../helpers/mock-db");
const { ID, ORDERS, REVIEWS } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb));
});

describe("ReviewService.create", () => {
  const validInput = {
    userId: ID.user1.toString(),
    orderId: ID.order1.toString(),
    restaurantId: ID.rest1.toString(),
    rating: 5,
    title: "Genial",
    comment: "Muy buena comida",
    tags: ["recomendado"],
  };

  it("creates review when order is delivered and no duplicate exists", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.delivered);
    col("reviews").findOne.mockResolvedValue(null);
    col("reviews").insertOne.mockResolvedValue({ insertedId: ID.review1 });

    const review = await ReviewService.create(validInput);

    expect(review._id).toEqual(ID.review1);
    expect(review.rating).toBe(5);
    expect(review.tags).toContain("recomendado");
    expect(review.restaurantResponse).toBeNull();
    expect(review.helpfulVotes).toEqual([]);
  });

  it("queries orders with userId + status:delivered constraint", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.delivered);
    col("reviews").findOne.mockResolvedValue(null);
    col("reviews").insertOne.mockResolvedValue({ insertedId: ID.review1 });

    await ReviewService.create(validInput);

    const orderQuery = col("orders").findOne.mock.calls[0][0];
    expect(orderQuery._id).toEqual(ID.order1);
    expect(orderQuery.userId).toEqual(ID.user1);
    expect(orderQuery.status).toBe("delivered");
  });

  it("throws 400 when order not delivered or not found", async () => {
    col("orders").findOne.mockResolvedValue(null);

    await expect(ReviewService.create(validInput))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 409 when duplicate review exists", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.delivered);
    col("reviews").findOne.mockResolvedValue(REVIEWS.positive);

    await expect(ReviewService.create(validInput))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/already submitted/i) });
  });

  it("sets defaults for optional fields", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.delivered);
    col("reviews").findOne.mockResolvedValue(null);
    col("reviews").insertOne.mockResolvedValue({ insertedId: ID.review1 });

    const review = await ReviewService.create({
      userId: ID.user1.toString(),
      orderId: ID.order1.toString(),
      restaurantId: ID.rest1.toString(),
      rating: 3,
    });

    expect(review.title).toBe("");
    expect(review.comment).toBe("");
    expect(review.tags).toEqual([]);
  });
});
