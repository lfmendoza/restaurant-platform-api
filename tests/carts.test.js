jest.mock("../src/db");

const request = require("supertest");
const { getDb } = require("../src/db");
const app = require("../src/app");
const { setupMockDb } = require("./helpers/mock-db");
const { ID, MENU_ITEMS, CARTS } = require("./helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb));
});

describe("GET /carts", () => {
  it("returns 400 when userId is missing", async () => {
    const res = await request(app).get("/carts").expect(400);
    expect(res.body.error).toMatch(/userId/i);
  });

  it("returns cart for user", async () => {
    col("carts").findOne.mockResolvedValue(CARTS.withItems);

    const res = await request(app).get(`/carts?userId=${ID.user1}`).expect(200);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.subtotal).toBe(196.0);
  });

  it("returns 404 when cart not found", async () => {
    col("carts").findOne.mockResolvedValue(null);

    await request(app).get(`/carts?userId=${ID.user1}`).expect(404);
  });
});

describe("POST /carts/items (upsert + $push + $setOnInsert)", () => {
  it("adds item to cart after validating menu item", async () => {
    col("menu_items").findOne.mockResolvedValue({
      _id: ID.item1,
      name: "Pizza Margherita",
      price: 89.0,
      restaurantId: ID.rest1,
    });
    col("carts").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    col("carts").findOne
      .mockResolvedValueOnce({
        _id: ID.cart1,
        items: [{ menuItemId: ID.item1, price: 89.0, quantity: 1, subtotal: 89.0 }],
      })
      .mockResolvedValueOnce({
        _id: ID.cart1,
        items: [{ menuItemId: ID.item1, price: 89.0, quantity: 1, subtotal: 89.0 }],
        subtotal: 89.0,
      });

    const res = await request(app)
      .post("/carts/items")
      .send({ userId: ID.user1.toString(), menuItemId: ID.item1.toString(), quantity: 1 })
      .expect(200);

    expect(res.body).toHaveProperty("subtotal");
    const updateCall = col("carts").updateOne.mock.calls[0];
    expect(updateCall[1].$push).toHaveProperty("items");
    expect(updateCall[1].$setOnInsert).toHaveProperty("expiresAt");
    expect(updateCall[2]).toEqual({ upsert: true });
  });

  it("returns 404 when menu item unavailable", async () => {
    col("menu_items").findOne.mockResolvedValue(null);

    await request(app)
      .post("/carts/items")
      .send({ userId: ID.user1.toString(), menuItemId: ID.item1.toString() })
      .expect(404);
  });
});

describe("PATCH /carts/items/:menuItemId (positional $ operator)", () => {
  it("updates quantity and recalculates subtotal", async () => {
    const cartWithItem = {
      ...CARTS.withItems,
      items: [{ menuItemId: ID.item1, name: "Pizza", price: 89.0, quantity: 1, subtotal: 89.0 }],
    };
    col("carts").findOne
      .mockResolvedValueOnce(cartWithItem)
      .mockResolvedValueOnce({
        ...cartWithItem,
        _id: ID.cart1,
        items: [{ menuItemId: ID.item1, price: 89.0, quantity: 3, subtotal: 267.0 }],
      })
      .mockResolvedValueOnce({
        _id: ID.cart1,
        items: [{ menuItemId: ID.item1, price: 89.0, quantity: 3, subtotal: 267.0 }],
        subtotal: 267.0,
      });
    col("carts").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const res = await request(app)
      .patch(`/carts/items/${ID.item1}`)
      .send({ userId: ID.user1.toString(), quantity: 3 })
      .expect(200);

    const positionalUpdate = col("carts").updateOne.mock.calls[0][1];
    expect(positionalUpdate.$set["items.$.quantity"]).toBe(3);
    expect(positionalUpdate.$set["items.$.subtotal"]).toBe(267.0);
  });

  it("returns 400 when quantity < 1", async () => {
    await request(app)
      .patch(`/carts/items/${ID.item1}`)
      .send({ userId: ID.user1.toString(), quantity: 0 })
      .expect(400);
  });

  it("returns 404 when cart not found", async () => {
    col("carts").findOne.mockResolvedValue(null);

    await request(app)
      .patch(`/carts/items/${ID.item1}`)
      .send({ userId: ID.user1.toString(), quantity: 2 })
      .expect(404);
  });
});

describe("DELETE /carts/items/:menuItemId ($pull)", () => {
  it("removes item from cart and recalculates subtotal", async () => {
    col("carts").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    col("carts").findOne.mockResolvedValue({
      _id: ID.cart1,
      items: [{ menuItemId: ID.item2, price: 18.0, quantity: 1, subtotal: 18.0 }],
    });

    const res = await request(app)
      .delete(`/carts/items/${ID.item1}?userId=${ID.user1}`)
      .expect(200);

    expect(res.body.removed).toBe(1);
    const pullArg = col("carts").updateOne.mock.calls[0][1];
    expect(pullArg.$pull.items).toHaveProperty("menuItemId");
  });
});

describe("DELETE /carts", () => {
  it("deletes entire cart", async () => {
    col("carts").deleteOne.mockResolvedValue({ deletedCount: 1 });

    const res = await request(app)
      .delete(`/carts?userId=${ID.user1}`)
      .expect(200);

    expect(res.body.deleted).toBe(1);
  });

  it("returns 400 without userId", async () => {
    await request(app).delete("/carts").expect(400);
  });
});
