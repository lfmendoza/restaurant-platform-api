jest.mock("../src/db");

const request = require("supertest");
const { getDb, getReadDb } = require("../src/db");
const app = require("../src/app");
const AnalyticsQueries = require("../src/queries/AnalyticsQueries");
const { setupMockDb, createCursor } = require("./helpers/mock-db");
const { ID } = require("./helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb, null, null, getReadDb));
  AnalyticsQueries.invalidateCache();
});

describe("GET /analytics/dashboard (batch endpoint)", () => {
  it("returns all analytics data in a single response", async () => {
    col("orders").countDocuments.mockResolvedValue(100);
    col("reviews").countDocuments.mockResolvedValue(50);
    col("orders").distinct.mockResolvedValue(["pending", "delivered"]);
    col("menu_items").distinct.mockResolvedValue(["Platos Principales", "Bebidas"]);
    col("reviews").aggregate.mockReturnValue(createCursor([]));
    col("orders").aggregate.mockReturnValue(createCursor([]));
    col("menu_items").aggregate.mockReturnValue(createCursor([]));
    col("restaurant_stats").aggregate.mockReturnValue(createCursor([]));

    const res = await request(app).get("/analytics/dashboard").expect(200);

    expect(res.body).toHaveProperty("count_orders");
    expect(res.body).toHaveProperty("count_reviews");
    expect(res.body).toHaveProperty("distinct_status");
    expect(res.body).toHaveProperty("distinct_categories");
    expect(res.body).toHaveProperty("top_rest");
    expect(res.body).toHaveProperty("best_items");
    expect(res.body).toHaveProperty("rev_month");
    expect(res.body).toHaveProperty("rev_category");
    expect(res.body).toHaveProperty("tags");
    expect(res.body).toHaveProperty("allergens");
    expect(res.body).toHaveProperty("rest_stats");
    expect(res.body).toHaveProperty("daily_rev");
  });
});

describe("GET /analytics/count (countDocuments)", () => {
  it("counts documents in specified collection", async () => {
    col("orders").countDocuments.mockResolvedValue(42);

    const res = await request(app)
      .get("/analytics/count?collection=orders&status=delivered")
      .expect(200);

    expect(res.body.count).toBe(42);
    expect(res.body.collection).toBe("orders");
  });

  it("returns 400 without collection param", async () => {
    await request(app).get("/analytics/count").expect(400);
  });
});

describe("GET /analytics/distinct", () => {
  it("returns distinct values for field", async () => {
    col("menu_items").distinct.mockResolvedValue(["Entradas", "Platos Principales", "Postres"]);

    const res = await request(app)
      .get("/analytics/distinct?collection=menu_items&field=category")
      .expect(200);

    expect(res.body.values).toEqual(["Entradas", "Platos Principales", "Postres"]);
  });

  it("returns 400 without required params", async () => {
    await request(app).get("/analytics/distinct?collection=menu_items").expect(400);
    await request(app).get("/analytics/distinct?field=category").expect(400);
  });
});

describe("GET /analytics/top-restaurants (Pipeline 1: $group + $match + $lookup)", () => {
  it("returns ranked restaurants with avg rating", async () => {
    col("reviews").aggregate.mockReturnValue(createCursor([
      { _id: ID.rest1, restaurant: { name: "Bella Italia #1", cuisineTypes: ["italiana"] }, avgRating: 4.5, reviewCount: 20 },
    ]));

    const res = await request(app).get("/analytics/top-restaurants?limit=5").expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty("restaurant.name");
    expect(res.body[0]).toHaveProperty("avgRating");
    expect(res.body[0]).toHaveProperty("reviewCount");
  });
});

describe("GET /analytics/best-selling-items (Pipeline 2: $unwind + $group + $lookup)", () => {
  it("returns items ranked by quantity sold", async () => {
    col("orders").aggregate.mockReturnValue(createCursor([
      { _id: ID.item1, name: "Pizza Margherita", totalQty: 150, totalRevenue: 13350.0, category: "Platos Principales", price: 89 },
    ]));

    const res = await request(app).get("/analytics/best-selling-items?limit=5").expect(200);

    expect(res.body[0]).toHaveProperty("name");
    expect(res.body[0]).toHaveProperty("totalQty");
    expect(res.body[0]).toHaveProperty("totalRevenue");
  });
});

describe("GET /analytics/revenue-by-month (Pipeline 3: temporal $group)", () => {
  it("returns monthly revenue grouped by restaurant", async () => {
    col("orders").aggregate.mockReturnValue(createCursor([
      { restaurantName: "Bella Italia #1", year: 2025, month: 6, totalRevenue: 5000.0, orderCount: 50, avgOrderValue: 100.0 },
    ]));

    const res = await request(app).get("/analytics/revenue-by-month").expect(200);

    expect(res.body[0]).toHaveProperty("restaurantName");
    expect(res.body[0]).toHaveProperty("year");
    expect(res.body[0]).toHaveProperty("month");
    expect(res.body[0]).toHaveProperty("totalRevenue");
  });
});

describe("GET /analytics/rating-distribution/:restaurantId (Pipeline 4: $group + $push)", () => {
  it("returns rating distribution for restaurant", async () => {
    col("reviews").aggregate.mockReturnValue(createCursor([
      { distribution: [{ rating: 1, count: 2 }, { rating: 5, count: 15 }], total: 17 },
    ]));

    const res = await request(app)
      .get(`/analytics/rating-distribution/${ID.rest1}`)
      .expect(200);

    expect(res.body).toHaveProperty("distribution");
    expect(res.body).toHaveProperty("total");
    expect(res.body.distribution[0]).toHaveProperty("rating");
    expect(res.body.distribution[0]).toHaveProperty("count");
  });

  it("returns empty distribution when no reviews", async () => {
    col("reviews").aggregate.mockReturnValue(createCursor([]));

    const res = await request(app)
      .get(`/analytics/rating-distribution/${ID.rest1}`)
      .expect(200);

    expect(res.body).toEqual({ distribution: [], total: 0 });
  });
});

describe("GET /analytics/order-velocity/:restaurantId (Pipeline 5: $dateTrunc Time Series)", () => {
  it("returns order counts in 5-minute windows", async () => {
    col("order_events").aggregate.mockReturnValue(createCursor([
      { window: new Date("2025-06-01T10:00:00Z"), count: 3 },
      { window: new Date("2025-06-01T10:05:00Z"), count: 7 },
    ]));

    const res = await request(app)
      .get(`/analytics/order-velocity/${ID.rest1}?hoursBack=2`)
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty("window");
    expect(res.body[0]).toHaveProperty("count");
  });
});

describe("GET /analytics/avg-transition-time/:restaurantId (Pipeline 6)", () => {
  it("returns average duration between state transitions", async () => {
    col("order_events").aggregate.mockReturnValue(createCursor([
      { from: "pending", to: "confirmed", avgDurationSec: 180, count: 25 },
      { from: "confirmed", to: "preparing", avgDurationSec: 300, count: 22 },
    ]));

    const res = await request(app)
      .get(`/analytics/avg-transition-time/${ID.rest1}`)
      .expect(200);

    expect(res.body[0]).toHaveProperty("from");
    expect(res.body[0]).toHaveProperty("to");
    expect(res.body[0]).toHaveProperty("avgDurationSec");
  });
});

describe("GET /analytics/tags ($unwind + $group on arrays)", () => {
  it("returns tag frequency distribution", async () => {
    col("reviews").aggregate.mockReturnValue(createCursor([
      { tag: "recomendado", count: 45 },
      { tag: "buen-servicio", count: 30 },
    ]));

    const res = await request(app).get("/analytics/tags?limit=5").expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual({ tag: "recomendado", count: 45 });
  });
});

describe("GET /analytics/allergens ($unwind + $group on arrays)", () => {
  it("returns allergen frequency distribution", async () => {
    col("menu_items").aggregate.mockReturnValue(createCursor([
      { allergen: "gluten", count: 200 },
      { allergen: "lácteos", count: 180 },
    ]));

    const res = await request(app).get("/analytics/allergens").expect(200);

    expect(res.body[0]).toHaveProperty("allergen");
    expect(res.body[0]).toHaveProperty("count");
  });
});

describe("GET /analytics/revenue-by-category ($unwind items + $lookup)", () => {
  it("returns revenue grouped by menu category", async () => {
    col("orders").aggregate.mockReturnValue(createCursor([
      { category: "Platos Principales", totalRevenue: 8500, totalQty: 100 },
      { category: "Bebidas", totalRevenue: 1200, totalQty: 80 },
    ]));

    const res = await request(app).get("/analytics/revenue-by-category").expect(200);

    expect(res.body[0]).toHaveProperty("category");
    expect(res.body[0]).toHaveProperty("totalRevenue");
    expect(res.body[0]).toHaveProperty("totalQty");
  });
});

describe("GET /analytics/daily-revenue", () => {
  it("returns daily revenue aggregated from orders", async () => {
    col("orders").aggregate.mockReturnValue(createCursor([
      { date: "2026-03-10", totalRevenue: 2500, orderCount: 30, avgOrderValue: 83.33 },
    ]));

    const res = await request(app).get("/analytics/daily-revenue?days=7").expect(200);

    expect(res.body[0]).toHaveProperty("date");
    expect(res.body[0]).toHaveProperty("totalRevenue");
    expect(res.body[0]).toHaveProperty("orderCount");
  });
});

describe("GET /analytics/restaurant-stats", () => {
  it("returns stats with restaurantName via $lookup", async () => {
    col("restaurant_stats").aggregate.mockReturnValue(createCursor([
      { _id: ID.rest1, restaurantName: "Bella Italia #1", totalOrders: 50, avgRating: 4.5, totalRevenue: 5000 },
    ]));

    const res = await request(app).get("/analytics/restaurant-stats?limit=5").expect(200);

    expect(res.body[0]).toHaveProperty("restaurantName");
    expect(res.body[0]).toHaveProperty("totalOrders");
    expect(res.body[0]).toHaveProperty("avgRating");
  });
});

describe("POST /analytics/run-batch ($merge materialized view)", () => {
  it("triggers daily revenue batch job", async () => {
    col("orders").aggregate.mockReturnValue(createCursor([]));
    col("daily_revenue").countDocuments.mockResolvedValue(30);

    const res = await request(app)
      .post("/analytics/run-batch")
      .send({ job: "daily" })
      .expect(200);

    expect(res.body.job).toBe("daily_revenue");
    expect(res.body).toHaveProperty("count");
  });

  it("triggers weekly reconciliation batch job", async () => {
    col("orders").aggregate.mockReturnValue(createCursor([]));
    col("restaurant_stats").countDocuments.mockResolvedValue(100);

    const res = await request(app)
      .post("/analytics/run-batch")
      .send({ job: "weekly" })
      .expect(200);

    expect(res.body.job).toBe("weekly_reconciliation");
  });

  it("rejects invalid job type", async () => {
    await request(app)
      .post("/analytics/run-batch")
      .send({ job: "invalid" })
      .expect(400);
  });
});
