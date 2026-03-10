jest.mock("../../src/db");

const { getDb, getReadDb } = require("../../src/db");
const ReviewQueries = require("../../src/queries/ReviewQueries");
const { setupMockDb, createCursor } = require("../helpers/mock-db");
const { ID, REVIEWS } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb, null, null, getReadDb));
});

describe("ReviewQueries.list", () => {
  it("applies all filters", async () => {
    col("reviews").find.mockReturnValue(createCursor([REVIEWS.positive]));

    await ReviewQueries.list({
      restaurantId: ID.rest1.toString(),
      userId: ID.user1.toString(),
      rating: "5",
      tag: "recomendado",
      q: "excelente",
    });

    const filter = col("reviews").find.mock.calls[0][0];
    expect(filter.restaurantId).toEqual(ID.rest1);
    expect(filter.userId).toEqual(ID.user1);
    expect(filter.rating).toBe(5);
    expect(filter.tags).toBe("recomendado");
    expect(filter.$text.$search).toBe("excelente");
  });

  it("returns results with projection", async () => {
    col("reviews").find.mockReturnValue(createCursor([REVIEWS.positive]));

    const result = await ReviewQueries.list({});

    expect(result).toHaveLength(1);
    const projection = col("reviews").find.mock.calls[0][1].projection;
    expect(projection).toHaveProperty("rating");
    expect(projection).toHaveProperty("comment");
  });
});

describe("ReviewQueries.getById", () => {
  it("returns review when found", async () => {
    col("reviews").findOne.mockResolvedValue(REVIEWS.positive);
    const review = await ReviewQueries.getById(ID.review1.toString());
    expect(review.title).toBe("Excelente servicio");
  });

  it("throws 404 when not found", async () => {
    col("reviews").findOne.mockResolvedValue(null);
    await expect(ReviewQueries.getById(ID.review1.toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
