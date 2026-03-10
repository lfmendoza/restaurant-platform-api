jest.mock("../src/db");

const request = require("supertest");
const { getDb } = require("../src/db");
const app = require("../src/app");
const { setupMockDb, createCursor } = require("./helpers/mock-db");
const { ID, MENU_ITEMS } = require("./helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb));
});

describe("POST /menu-items", () => {
  it("creates item with required fields", async () => {
    col("menu_items").insertOne.mockResolvedValue({ insertedId: ID.item1 });

    const res = await request(app)
      .post("/menu-items")
      .send({
        restaurantId: ID.rest1.toString(),
        name: "Nachos",
        price: 45,
        category: "Entradas",
        allergens: ["gluten"],
      })
      .expect(201);

    expect(res.body).toMatchObject({
      name: "Nachos",
      price: 45,
      category: "Entradas",
      available: true,
      salesCount: 0,
    });
  });
});

describe("POST /menu-items/many (insertMany)", () => {
  it("inserts multiple items for a restaurant", async () => {
    col("menu_items").insertMany.mockResolvedValue({ insertedCount: 2 });

    const res = await request(app)
      .post("/menu-items/many")
      .send({
        restaurantId: ID.rest1.toString(),
        items: [
          { name: "Item A", price: 30, category: "Entradas" },
          { name: "Item B", price: 50, category: "Postres" },
        ],
      })
      .expect(201);

    expect(res.body.insertedCount).toBe(2);
  });

  it("rejects empty items array", async () => {
    await request(app)
      .post("/menu-items/many")
      .send({ restaurantId: ID.rest1.toString(), items: [] })
      .expect(400);
  });
});

describe("POST /menu-items/bulk (bulkWrite)", () => {
  it("executes mixed operations with ordered:false", async () => {
    col("menu_items").bulkWrite.mockResolvedValue({
      insertedCount: 1, modifiedCount: 1, deletedCount: 0, upsertedCount: 0,
    });

    const res = await request(app)
      .post("/menu-items/bulk")
      .send({
        operations: [
          { insertOne: { document: { restaurantId: ID.rest1.toString(), name: "New", price: 25, category: "Sopas" } } },
          { updateOne: { filter: { _id: ID.item1.toString() }, update: { $set: { price: 100 } } } },
        ],
      })
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({ insertedCount: 1, modifiedCount: 1 })
    );
    expect(col("menu_items").bulkWrite).toHaveBeenCalledWith(
      expect.any(Array),
      { ordered: false }
    );
  });
});

describe("GET /menu-items", () => {
  it("returns list with filters and default sort by salesCount", async () => {
    col("menu_items").find.mockReturnValue(createCursor([MENU_ITEMS.pizza]));

    const res = await request(app)
      .get(`/menu-items?restaurantId=${ID.rest1}&category=Platos Principales&limit=5`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Pizza Margherita");
    const filter = col("menu_items").find.mock.calls[0][0];
    expect(filter.restaurantId).toEqual(ID.rest1);
    expect(filter.category).toBe("Platos Principales");
  });

  it("applies text search when q param is provided", async () => {
    col("menu_items").find.mockReturnValue(createCursor([]));

    await request(app).get("/menu-items?q=pizza").expect(200);

    const filter = col("menu_items").find.mock.calls[0][0];
    expect(filter.$text).toEqual({ $search: "pizza" });
  });

  it("applies price_lte filter", async () => {
    col("menu_items").find.mockReturnValue(createCursor([]));

    await request(app).get("/menu-items?price_lte=50").expect(200);

    const filter = col("menu_items").find.mock.calls[0][0];
    expect(filter.price).toEqual({ $lte: 50 });
  });
});

describe("GET /menu-items/:id", () => {
  it("returns single item", async () => {
    col("menu_items").findOne.mockResolvedValue(MENU_ITEMS.pizza);

    const res = await request(app).get(`/menu-items/${ID.item1}`).expect(200);
    expect(res.body.name).toBe("Pizza Margherita");
  });

  it("returns 404 when not found", async () => {
    col("menu_items").findOne.mockResolvedValue(null);
    await request(app).get(`/menu-items/${ID.item1}`).expect(404);
  });
});

describe("PATCH /menu-items/:id", () => {
  it("updates item fields", async () => {
    col("menu_items").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const res = await request(app)
      .patch(`/menu-items/${ID.item1}`)
      .send({ price: 99, category: "Entradas" })
      .expect(200);

    expect(res.body.updated).toBe(1);
  });
});

describe("PATCH /menu-items/:id/availability (cascade to carts)", () => {
  it("updates item and cascades to carts using arrayFilters", async () => {
    col("menu_items").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    col("carts").updateMany.mockResolvedValue({ matchedCount: 3, modifiedCount: 3 });

    const res = await request(app)
      .patch(`/menu-items/${ID.item1}/availability`)
      .send({ available: false })
      .expect(200);

    expect(res.body).toEqual({ itemUpdated: 1, affectedCarts: 3 });

    const cartUpdate = col("carts").updateMany.mock.calls[0];
    expect(cartUpdate[0]).toEqual({ "items.menuItemId": ID.item1 });
    expect(cartUpdate[2]).toEqual({
      arrayFilters: [{ "elem.menuItemId": ID.item1 }],
    });
  });

  it("returns 404 when item not found", async () => {
    col("menu_items").updateOne.mockResolvedValue({ matchedCount: 0 });
    await request(app)
      .patch(`/menu-items/${ID.item1}/availability`)
      .send({ available: true })
      .expect(404);
  });
});

describe("PATCH /menu-items/restaurant/:restaurantId/category-price ($mul)", () => {
  it("applies price multiplier to all items in category", async () => {
    col("menu_items").updateMany.mockResolvedValue({ matchedCount: 10, modifiedCount: 10 });

    const res = await request(app)
      .patch(`/menu-items/restaurant/${ID.rest1}/category-price`)
      .send({ category: "Bebidas", multiplier: 1.15 })
      .expect(200);

    expect(res.body.updated).toBe(10);
    const updateArg = col("menu_items").updateMany.mock.calls[0][1];
    expect(updateArg.$mul.price).toBe(1.15);
  });
});

describe("DELETE /menu-items/:id", () => {
  it("deletes single item", async () => {
    col("menu_items").deleteOne.mockResolvedValue({ deletedCount: 1 });
    const res = await request(app).delete(`/menu-items/${ID.item1}`).expect(200);
    expect(res.body.deleted).toBe(1);
  });
});

describe("DELETE /menu-items (deleteMany)", () => {
  it("deletes by restaurantId and category", async () => {
    col("menu_items").deleteMany.mockResolvedValue({ deletedCount: 15 });

    const res = await request(app)
      .delete(`/menu-items?restaurantId=${ID.rest1}&category=Postres`)
      .expect(200);

    expect(res.body.deleted).toBe(15);
  });

  it("requires restaurantId", async () => {
    await request(app).delete("/menu-items").expect(400);
  });
});
