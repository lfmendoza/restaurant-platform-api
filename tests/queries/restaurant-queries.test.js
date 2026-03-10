jest.mock("../../src/db");

const { getDb, getReadDb } = require("../../src/db");
const RestaurantQueries = require("../../src/queries/RestaurantQueries");
const { setupMockDb, createCursor } = require("../helpers/mock-db");
const { ID, RESTAURANTS, DELIVERY_ZONES } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb, null, null, getReadDb));
});

describe("RestaurantQueries.search", () => {
  it("throws 400 when lat/lng missing", async () => {
    await expect(RestaurantQueries.search({}))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns empty when no delivery zones match", async () => {
    col("delivery_zones").find.mockReturnValue(createCursor([]));

    const result = await RestaurantQueries.search({ lat: "14.59", lng: "-90.51" });

    expect(result).toEqual({ restaurants: [], total: 0 });
  });

  it("enriches restaurants with stats and delivery info", async () => {
    col("delivery_zones").find.mockReturnValue(createCursor([DELIVERY_ZONES.centro]));
    col("restaurants").find.mockReturnValue(createCursor([RESTAURANTS.active]));
    col("restaurant_stats").find.mockReturnValue(createCursor([{
      _id: ID.rest1, avgRating: 4.5, totalReviews: 120, totalOrders: 500,
    }]));

    const result = await RestaurantQueries.search({ lat: "14.59", lng: "-90.51" });

    expect(result.restaurants).toHaveLength(1);
    expect(result.restaurants[0].avgRating).toBe(4.5);
    expect(result.restaurants[0].totalReviews).toBe(120);
    expect(result.restaurants[0].deliveryFee).toBe(15.0);
    expect(result.restaurants[0].estimatedMinutes).toBe(25);
  });

  it("uses $geoIntersects on delivery_zones", async () => {
    col("delivery_zones").find.mockReturnValue(createCursor([]));
    await RestaurantQueries.search({ lat: "14.59", lng: "-90.51" });

    const filter = col("delivery_zones").find.mock.calls[0][0];
    expect(filter.area.$geoIntersects.$geometry).toEqual({
      type: "Point",
      coordinates: [-90.51, 14.59],
    });
  });
});

describe("RestaurantQueries.getById", () => {
  it("returns restaurant with stats", async () => {
    col("restaurants").findOne.mockResolvedValue(RESTAURANTS.active);
    col("restaurant_stats").findOne.mockResolvedValue({
      _id: ID.rest1, avgRating: 4.2, totalReviews: 50, totalOrders: 200,
    });

    const result = await RestaurantQueries.getById(ID.rest1.toString());

    expect(result.name).toBe("Bella Italia #1");
    expect(result.stats.avgRating).toBe(4.2);
  });

  it("throws 404 when not found", async () => {
    col("restaurants").findOne.mockResolvedValue(null);
    await expect(RestaurantQueries.getById(ID.rest1.toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns empty stats when no data", async () => {
    col("restaurants").findOne.mockResolvedValue(RESTAURANTS.active);
    col("restaurant_stats").findOne.mockResolvedValue(null);

    const result = await RestaurantQueries.getById(ID.rest1.toString());
    expect(result.stats).toEqual({});
  });
});

describe("RestaurantQueries.list", () => {
  it("applies cuisine filter", async () => {
    col("restaurants").find.mockReturnValue(createCursor([]));

    await RestaurantQueries.list({ cuisine: "italiana" });

    const filter = col("restaurants").find.mock.calls[0][0];
    expect(filter.cuisineTypes).toBe("italiana");
  });

  it("applies boolean filters correctly", async () => {
    col("restaurants").find.mockReturnValue(createCursor([]));

    await RestaurantQueries.list({ isActive: "true", isAcceptingOrders: "false" });

    const filter = col("restaurants").find.mock.calls[0][0];
    expect(filter.isActive).toBe(true);
    expect(filter.isAcceptingOrders).toBe(false);
  });
});

describe("RestaurantQueries.menuCategories", () => {
  it("calls distinct on menu_items with restaurantId filter", async () => {
    col("menu_items").distinct.mockResolvedValue(["Pizzas", "Pastas", "Bebidas"]);

    const result = await RestaurantQueries.menuCategories(ID.rest1.toString());

    expect(result).toEqual(["Pizzas", "Pastas", "Bebidas"]);
    const args = col("menu_items").distinct.mock.calls[0];
    expect(args[0]).toBe("category");
    expect(args[1].available).toBe(true);
  });
});
