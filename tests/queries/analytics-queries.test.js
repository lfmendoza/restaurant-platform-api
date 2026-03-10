jest.mock("../../src/db");

const { getDb, getReadDb } = require("../../src/db");
const AnalyticsQueries = require("../../src/queries/AnalyticsQueries");
const { setupMockDb, createCursor } = require("../helpers/mock-db");
const { ID } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb, null, null, getReadDb));
  AnalyticsQueries.invalidateCache();
});

describe("AnalyticsQueries.count", () => {
  it("throws 400 when collection missing", async () => {
    await expect(AnalyticsQueries.count({}))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns count from specified collection", async () => {
    col("orders").countDocuments.mockResolvedValue(42);

    const result = await AnalyticsQueries.count({ collection: "orders" });

    expect(result.count).toBe(42);
    expect(result.collection).toBe("orders");
  });

  it("applies restaurantId and status filters", async () => {
    col("orders").countDocuments.mockResolvedValue(5);

    await AnalyticsQueries.count({
      collection: "orders",
      restaurantId: ID.rest1.toString(),
      status: "delivered",
    });

    const filter = col("orders").countDocuments.mock.calls[0][0];
    expect(filter.restaurantId).toEqual(ID.rest1);
    expect(filter.status).toBe("delivered");
  });
});

describe("AnalyticsQueries.distinct", () => {
  it("throws 400 when collection or field missing", async () => {
    await expect(AnalyticsQueries.distinct({ collection: "orders" }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(AnalyticsQueries.distinct({ field: "status" }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns distinct values", async () => {
    col("orders").distinct.mockResolvedValue(["pending", "delivered", "cancelled"]);

    const result = await AnalyticsQueries.distinct({ collection: "orders", field: "status" });
    expect(result.values).toEqual(["pending", "delivered", "cancelled"]);
  });
});

describe("AnalyticsQueries.topRestaurants", () => {
  it("uses $group → $match → $sort → $limit → $lookup pipeline", async () => {
    col("reviews").aggregate.mockReturnValue(createCursor([
      { _id: ID.rest1, avgRating: 4.8, reviewCount: 50, restaurant: { name: "Best" } },
    ]));

    const result = await AnalyticsQueries.topRestaurants({ minReviews: 5, limit: 10 });

    expect(result).toHaveLength(1);
    const pipeline = col("reviews").aggregate.mock.calls[0][0];
    expect(pipeline[0].$group._id).toBe("$restaurantId");
    expect(pipeline[1].$match.count.$gte).toBe(5);
    expect(pipeline[3].$limit).toBe(10);
    expect(pipeline[4].$lookup.from).toBe("restaurants");
  });
});

describe("AnalyticsQueries — time series and aggregated reads", () => {
  it("orderVelocity queries order_events with $dateTrunc", async () => {
    col("order_events").aggregate.mockReturnValue(createCursor([
      { window: new Date(), count: 3 },
    ]));

    const result = await AnalyticsQueries.orderVelocity(ID.rest1.toString(), { hoursBack: 2 });

    expect(result).toHaveLength(1);
    const pipeline = col("order_events").aggregate.mock.calls[0][0];
    expect(pipeline[0].$match["metadata.restaurantId"]).toEqual(ID.rest1);
    expect(pipeline[0].$match.toStatus).toBe("pending");
    const groupStage = pipeline[1].$group._id;
    expect(groupStage.$dateTrunc.unit).toBe("minute");
    expect(groupStage.$dateTrunc.binSize).toBe(5);
  });

  it("avgTransitionTime queries order_events for status_change", async () => {
    col("order_events").aggregate.mockReturnValue(createCursor([
      { from: "pending", to: "confirmed", avgDurationSec: 120, count: 10 },
    ]));

    const result = await AnalyticsQueries.avgTransitionTime(ID.rest1.toString());
    expect(result).toHaveLength(1);
    expect(result[0].avgDurationSec).toBe(120);
  });

  it("dailyRevenue aggregates delivered orders by day", async () => {
    col("orders").aggregate.mockReturnValue(createCursor([
      { date: "2026-03-10", totalRevenue: 5000, orderCount: 20, avgOrderValue: 250 },
    ]));

    const result = await AnalyticsQueries.dailyRevenue({ days: 7 });

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-03-10");
    const pipeline = col("orders").aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.status).toBe("delivered");
    expect(pipeline[0].$match.createdAt.$gte).toBeInstanceOf(Date);
  });

  it("restaurantStats aggregates from restaurant_stats with $lookup for name", async () => {
    col("restaurant_stats").aggregate.mockReturnValue(createCursor([
      { _id: ID.rest1, avgRating: 4.5, totalOrders: 200, restaurantName: "Test" },
    ]));

    const result = await AnalyticsQueries.restaurantStats({ skip: 0, limit: 10 });

    expect(result).toHaveLength(1);
    expect(result[0].avgRating).toBe(4.5);
    expect(result[0].restaurantName).toBe("Test");
    const pipeline = col("restaurant_stats").aggregate.mock.calls[0][0];
    const lookupStage = pipeline.find((s) => s.$lookup);
    expect(lookupStage.$lookup.from).toBe("restaurants");
  });
});

describe("AnalyticsQueries — array aggregations", () => {
  it("tags uses $unwind → $group on reviews", async () => {
    col("reviews").aggregate.mockReturnValue(createCursor([
      { tag: "recomendado", count: 15 },
    ]));

    const result = await AnalyticsQueries.tags({ limit: 10 });

    expect(result).toHaveLength(1);
    const pipeline = col("reviews").aggregate.mock.calls[0][0];
    expect(pipeline[0].$unwind).toBe("$tags");
  });

  it("allergens uses $unwind → $group on menu_items", async () => {
    col("menu_items").aggregate.mockReturnValue(createCursor([
      { allergen: "gluten", count: 30 },
    ]));

    const result = await AnalyticsQueries.allergens();
    expect(result).toHaveLength(1);
    expect(result[0].allergen).toBe("gluten");
  });
});

describe("AnalyticsQueries.dashboard", () => {
  it("runs all queries in parallel and returns keyed results", async () => {
    col("orders").countDocuments.mockResolvedValue(10);
    col("reviews").countDocuments.mockResolvedValue(5);
    col("orders").distinct.mockResolvedValue(["pending", "delivered"]);
    col("menu_items").distinct.mockResolvedValue(["Main"]);
    col("reviews").aggregate.mockReturnValue(createCursor([]));
    col("orders").aggregate.mockReturnValue(createCursor([]));
    col("menu_items").aggregate.mockReturnValue(createCursor([]));
    col("restaurant_stats").aggregate.mockReturnValue(createCursor([]));

    AnalyticsQueries.invalidateCache();
    const result = await AnalyticsQueries.dashboard();

    expect(result).toHaveProperty("count_orders");
    expect(result.count_orders.count).toBe(10);
    expect(result).toHaveProperty("count_reviews");
    expect(result).toHaveProperty("distinct_status");
    expect(result).toHaveProperty("top_rest");
    expect(result).toHaveProperty("best_items");
    expect(result).toHaveProperty("rev_month");
    expect(result).toHaveProperty("rev_category");
    expect(result).toHaveProperty("tags");
    expect(result).toHaveProperty("allergens");
    expect(result).toHaveProperty("rest_stats");
    expect(result).toHaveProperty("daily_rev");
  });

  it("uses cache on subsequent calls", async () => {
    col("orders").countDocuments.mockResolvedValue(10);
    col("reviews").countDocuments.mockResolvedValue(5);
    col("orders").distinct.mockResolvedValue(["pending"]);
    col("menu_items").distinct.mockResolvedValue(["Main"]);
    col("reviews").aggregate.mockReturnValue(createCursor([]));
    col("orders").aggregate.mockReturnValue(createCursor([]));
    col("menu_items").aggregate.mockReturnValue(createCursor([]));
    col("restaurant_stats").aggregate.mockReturnValue(createCursor([]));

    AnalyticsQueries.invalidateCache();
    await AnalyticsQueries.dashboard();
    const callCount = col("orders").countDocuments.mock.calls.length;

    col("orders").countDocuments.mockResolvedValue(999);
    col("reviews").countDocuments.mockResolvedValue(999);
    col("orders").distinct.mockResolvedValue([]);
    col("menu_items").distinct.mockResolvedValue([]);
    col("reviews").aggregate.mockReturnValue(createCursor([]));
    col("orders").aggregate.mockReturnValue(createCursor([]));
    col("menu_items").aggregate.mockReturnValue(createCursor([]));
    col("restaurant_stats").aggregate.mockReturnValue(createCursor([]));

    const result2 = await AnalyticsQueries.dashboard();

    expect(result2.count_orders.count).toBe(10);
    expect(col("orders").countDocuments.mock.calls.length).toBe(callCount);
  });
});
