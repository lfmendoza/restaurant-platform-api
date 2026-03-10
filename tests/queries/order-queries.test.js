jest.mock("../../src/db");

const { getDb, getReadDb } = require("../../src/db");
const OrderQueries = require("../../src/queries/OrderQueries");
const { setupMockDb, createCursor } = require("../helpers/mock-db");
const { ID, ORDERS } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb, null, null, getReadDb));
});

describe("OrderQueries.list", () => {
  it("uses aggregate with $lookup to users and restaurants", async () => {
    col("orders").aggregate.mockReturnValue(createCursor([ORDERS.delivered]));

    const result = await OrderQueries.list({});

    expect(result).toHaveLength(1);
    const pipeline = col("orders").aggregate.mock.calls[0][0];
    const lookups = pipeline.filter((s) => s.$lookup);
    expect(lookups).toHaveLength(2);
    expect(lookups[0].$lookup.from).toBe("users");
    expect(lookups[1].$lookup.from).toBe("restaurants");
  });

  it("applies restaurantId filter in $match", async () => {
    col("orders").aggregate.mockReturnValue(createCursor([]));

    await OrderQueries.list({ restaurantId: ID.rest1.toString() });

    const pipeline = col("orders").aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.restaurantId).toEqual(ID.rest1);
  });

  it("applies status filter in $match", async () => {
    col("orders").aggregate.mockReturnValue(createCursor([]));

    await OrderQueries.list({ status: "pending" });

    const pipeline = col("orders").aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.status).toBe("pending");
  });

  it("applies skip and limit", async () => {
    col("orders").aggregate.mockReturnValue(createCursor([]));

    await OrderQueries.list({ skip: 10, limit: 5 });

    const pipeline = col("orders").aggregate.mock.calls[0][0];
    const skipStage = pipeline.find((s) => s.$skip !== undefined);
    const limitStage = pipeline.find((s) => s.$limit !== undefined);
    expect(skipStage.$skip).toBe(10);
    expect(limitStage.$limit).toBe(5);
  });
});

describe("OrderQueries.getById", () => {
  it("returns order when found", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.delivered);

    const result = await OrderQueries.getById(ID.order1.toString());
    expect(result.orderNumber).toBe(ORDERS.delivered.orderNumber);
  });

  it("throws 404 when not found", async () => {
    col("orders").findOne.mockResolvedValue(null);

    await expect(OrderQueries.getById(ID.order1.toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
