jest.mock("../src/db");

const { ObjectId } = require("mongodb");
const request = require("supertest");
const { getDb, getReadDb } = require("../src/db");
const app = require("../src/app");
const { setupMockDb, createCursor } = require("./helpers/mock-db");
const { ID, RESTAURANTS, DELIVERY_ZONES } = require("./helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb, null, null, getReadDb));
});

describe("POST /restaurants", () => {
  it("creates restaurant with correct schema", async () => {
    col("restaurants").insertOne.mockResolvedValue({ insertedId: ID.rest1 });

    const body = {
      name: "New Place",
      location: { type: "Point", coordinates: [-90.5, 14.6] },
      address: { street: "Calle 1", city: "Guatemala", zone: "Zona 1" },
      operatingHours: { monday: { open: "10:00", close: "22:00" } },
      cuisineTypes: ["mexicana"],
    };

    const res = await request(app).post("/restaurants").send(body).expect(201);

    expect(res.body).toMatchObject({
      name: "New Place",
      isActive: true,
      isAcceptingOrders: true,
      menuItemCount: 0,
    });
    expect(col("restaurants").insertOne).toHaveBeenCalledTimes(1);
  });
});

describe("GET /restaurants", () => {
  it("returns paginated list with projection", async () => {
    col("restaurants").find.mockReturnValue(createCursor([RESTAURANTS.active]));

    const res = await request(app).get("/restaurants?limit=5").expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Bella Italia #1");
  });

  it("applies cuisine filter", async () => {
    col("restaurants").find.mockReturnValue(createCursor([]));

    await request(app).get("/restaurants?cuisine=japonesa").expect(200);

    expect(col("restaurants").find).toHaveBeenCalledWith(
      { cuisineTypes: "japonesa" },
      expect.any(Object)
    );
  });

  it("applies isActive filter", async () => {
    col("restaurants").find.mockReturnValue(createCursor([]));

    await request(app).get("/restaurants?isActive=true").expect(200);

    expect(col("restaurants").find).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true }),
      expect.any(Object)
    );
  });
});

describe("GET /restaurants/search", () => {
  it("returns 400 when lat/lng missing", async () => {
    const res = await request(app).get("/restaurants/search").expect(400);
    expect(res.body.error).toMatch(/lat.*lng/i);
  });

  it("performs geospatial query via delivery_zones", async () => {
    col("delivery_zones").find.mockReturnValue(createCursor([DELIVERY_ZONES.centro]));
    col("restaurants").find.mockReturnValue(createCursor([RESTAURANTS.active]));
    col("restaurant_stats").find.mockReturnValue(createCursor([]));

    const res = await request(app)
      .get("/restaurants/search?lat=14.59&lng=-90.51")
      .expect(200);

    expect(res.body).toHaveProperty("restaurants");
    expect(res.body).toHaveProperty("total");
    const dzFilter = col("delivery_zones").find.mock.calls[0][0];
    expect(dzFilter).toHaveProperty("area.$geoIntersects.$geometry");
    expect(dzFilter.isActive).toBe(true);
  });

  it("returns empty when no delivery zones match", async () => {
    col("delivery_zones").find.mockReturnValue(createCursor([]));

    const res = await request(app)
      .get("/restaurants/search?lat=0&lng=0")
      .expect(200);

    expect(res.body).toEqual({ restaurants: [], total: 0 });
  });
});

describe("POST /restaurants/many", () => {
  it("inserts multiple restaurants", async () => {
    col("restaurants").insertMany.mockResolvedValue({
      insertedCount: 3,
      insertedIds: { 0: new ObjectId(), 1: new ObjectId(), 2: new ObjectId() },
    });
    col("delivery_zones").insertMany.mockResolvedValue({ insertedCount: 9 });

    const res = await request(app)
      .post("/restaurants/many")
      .send({
        restaurants: [
          { name: "R1", location: { type: "Point", coordinates: [0, 0] }, address: {}, operatingHours: {} },
          { name: "R2", location: { type: "Point", coordinates: [1, 1] }, address: {}, operatingHours: {} },
          { name: "R3", location: { type: "Point", coordinates: [2, 2] }, address: {}, operatingHours: {} },
        ],
      })
      .expect(201);

    expect(res.body.insertedCount).toBe(3);
  });

  it("rejects empty array", async () => {
    await request(app).post("/restaurants/many").send({ restaurants: [] }).expect(400);
  });
});

describe("GET /restaurants/:id", () => {
  it("returns restaurant enriched with stats", async () => {
    col("restaurants").findOne.mockResolvedValue(RESTAURANTS.active);
    col("restaurant_stats").findOne.mockResolvedValue({
      _id: ID.rest1, avgRating: 4.5, totalReviews: 10, totalOrders: 50,
    });

    const res = await request(app).get(`/restaurants/${ID.rest1}`).expect(200);

    expect(res.body.name).toBe("Bella Italia #1");
    expect(res.body.stats).toMatchObject({ avgRating: 4.5, totalReviews: 10 });
  });

  it("returns 404 for non-existent restaurant", async () => {
    col("restaurants").findOne.mockResolvedValue(null);
    await request(app).get(`/restaurants/${ID.rest1}`).expect(404);
  });
});

describe("PATCH /restaurants/:id", () => {
  it("updates restaurant fields", async () => {
    col("restaurants").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const res = await request(app)
      .patch(`/restaurants/${ID.rest1}`)
      .send({ name: "Updated Name", cuisineTypes: ["peruana"] })
      .expect(200);

    expect(res.body.updated).toBe(1);
    const setFields = col("restaurants").updateOne.mock.calls[0][1].$set;
    expect(setFields.name).toBe("Updated Name");
    expect(setFields.cuisineTypes).toEqual(["peruana"]);
  });

  it("returns 404 when not found", async () => {
    col("restaurants").updateOne.mockResolvedValue({ matchedCount: 0 });
    await request(app).patch(`/restaurants/${ID.rest1}`).send({ name: "X" }).expect(404);
  });
});

describe("PATCH /restaurants/:id/status", () => {
  it("toggles isAcceptingOrders", async () => {
    col("restaurants").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const res = await request(app)
      .patch(`/restaurants/${ID.rest1}/status`)
      .send({ isAcceptingOrders: false })
      .expect(200);

    expect(res.body.updated).toBe(1);
    const setFields = col("restaurants").updateOne.mock.calls[0][1].$set;
    expect(setFields.isAcceptingOrders).toBe(false);
  });
});

describe("DELETE /restaurants/:id", () => {
  it("deletes restaurant", async () => {
    col("restaurants").deleteOne.mockResolvedValue({ deletedCount: 1 });
    const res = await request(app).delete(`/restaurants/${ID.rest1}`).expect(200);
    expect(res.body.deleted).toBe(1);
  });

  it("returns 404 when not found", async () => {
    col("restaurants").deleteOne.mockResolvedValue({ deletedCount: 0 });
    await request(app).delete(`/restaurants/${ID.rest1}`).expect(404);
  });
});

describe("GET /restaurants/:id/menu-categories", () => {
  it("returns distinct categories for restaurant", async () => {
    col("menu_items").distinct.mockResolvedValue(["Entradas", "Platos Principales", "Postres", "Bebidas"]);

    const res = await request(app).get(`/restaurants/${ID.rest1}/menu-categories`).expect(200);

    expect(res.body).toEqual(["Entradas", "Platos Principales", "Postres", "Bebidas"]);
    expect(col("menu_items").distinct).toHaveBeenCalledWith(
      "category",
      expect.objectContaining({ restaurantId: ID.rest1, available: true })
    );
  });
});
