jest.mock("../../src/db");

const { getDb } = require("../../src/db");
const CartCommands = require("../../src/commands/CartCommands");
const { setupMockDb } = require("../helpers/mock-db");
const { ID, MENU_ITEMS, CARTS } = require("../helpers/fixtures");
const { ObjectId } = require("mongodb");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb));
});

describe("CartCommands.recalculateSubtotal", () => {
  it("sums all item subtotals and updates the cart", async () => {
    const cart = {
      _id: ID.cart1,
      items: [
        { subtotal: 89.0 },
        { subtotal: 18.0 },
        { subtotal: 45.5 },
      ],
    };
    col("carts").findOne
      .mockResolvedValueOnce(cart)
      .mockResolvedValueOnce({ ...cart, subtotal: 152.5 });
    col("carts").updateOne.mockResolvedValue({ matchedCount: 1 });

    const result = await CartCommands.recalculateSubtotal({ _id: ID.cart1 });

    expect(result.subtotal).toBe(152.5);
    const updateCall = col("carts").updateOne.mock.calls[0];
    expect(updateCall[1].$set.subtotal).toBe(152.5);
  });

  it("returns null when cart not found", async () => {
    col("carts").findOne.mockResolvedValue(null);
    const result = await CartCommands.recalculateSubtotal({ _id: ID.cart1 });
    expect(result).toBeNull();
  });

  it("rounds to 2 decimal places", async () => {
    const cart = {
      _id: ID.cart1,
      items: [{ subtotal: 10.333 }, { subtotal: 20.666 }],
    };
    col("carts").findOne
      .mockResolvedValueOnce(cart)
      .mockResolvedValueOnce({ ...cart, subtotal: 31.0 });
    col("carts").updateOne.mockResolvedValue({ matchedCount: 1 });

    await CartCommands.recalculateSubtotal({ _id: ID.cart1 });
    const stored = col("carts").updateOne.mock.calls[0][1].$set.subtotal;
    expect(stored).toBe(31.0);
  });
});

describe("CartCommands.addItem", () => {
  it("validates menu item exists and is available", async () => {
    col("menu_items").findOne.mockResolvedValue(null);

    await expect(CartCommands.addItem(ID.user1.toString(), ID.item1.toString(), 1))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("upserts cart with embedded item and recalculates", async () => {
    col("menu_items").findOne.mockResolvedValue({
      _id: ID.item1, name: "Pizza", price: 89, restaurantId: ID.rest1,
    });
    col("carts").updateOne.mockResolvedValue({ matchedCount: 1 });
    col("carts").findOne
      .mockResolvedValueOnce({
        _id: ID.cart1,
        items: [{ menuItemId: ID.item1, subtotal: 178 }],
      })
      .mockResolvedValueOnce({
        _id: ID.cart1,
        items: [{ menuItemId: ID.item1, subtotal: 178 }],
        subtotal: 178,
      });

    const cart = await CartCommands.addItem(ID.user1.toString(), ID.item1.toString(), 2);

    expect(cart.subtotal).toBe(178);

    const upsertCall = col("carts").updateOne.mock.calls[0];
    expect(upsertCall[1].$push.items.price).toBe(89);
    expect(upsertCall[1].$push.items.quantity).toBe(2);
    expect(upsertCall[1].$push.items.subtotal).toBe(178);
    expect(upsertCall[1].$setOnInsert).toHaveProperty("expiresAt");
    expect(upsertCall[2]).toEqual({ upsert: true });
  });
});

describe("CartCommands.updateItemQuantity", () => {
  it("rejects quantity < 1 with 400", async () => {
    await expect(CartCommands.updateItemQuantity(ID.user1.toString(), ID.item1.toString(), 0))
      .rejects.toMatchObject({ statusCode: 400, message: /quantity/ });
  });

  it("returns 404 when cart not found", async () => {
    col("carts").findOne.mockResolvedValue(null);

    await expect(CartCommands.updateItemQuantity(ID.user1.toString(), ID.item1.toString(), 2))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns 404 when item not in cart", async () => {
    col("carts").findOne.mockResolvedValue({
      _id: ID.cart1,
      items: [{ menuItemId: new ObjectId("000000000000000000000099") }],
    });

    await expect(CartCommands.updateItemQuantity(ID.user1.toString(), ID.item1.toString(), 2))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("uses positional $ operator with correct subtotal", async () => {
    col("carts").findOne
      .mockResolvedValueOnce({
        _id: ID.cart1,
        items: [{ menuItemId: ID.item1, price: 89 }],
      })
      .mockResolvedValueOnce({
        _id: ID.cart1,
        items: [{ menuItemId: ID.item1, price: 89, quantity: 3, subtotal: 267 }],
      })
      .mockResolvedValueOnce({
        _id: ID.cart1,
        subtotal: 267,
      });
    col("carts").updateOne.mockResolvedValue({ matchedCount: 1 });

    await CartCommands.updateItemQuantity(ID.user1.toString(), ID.item1.toString(), 3);

    const updateCall = col("carts").updateOne.mock.calls[0];
    expect(updateCall[1].$set["items.$.quantity"]).toBe(3);
    expect(updateCall[1].$set["items.$.subtotal"]).toBe(267);
  });
});

describe("CartCommands.removeItem", () => {
  it("throws 404 when cart not found", async () => {
    col("carts").updateOne.mockResolvedValue({ matchedCount: 0 });

    await expect(CartCommands.removeItem(ID.user1.toString(), ID.item1.toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("uses $pull and recalculates subtotal", async () => {
    col("carts").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    col("carts").findOne
      .mockResolvedValueOnce({ _id: ID.cart1, items: [] })
      .mockResolvedValueOnce({ _id: ID.cart1, items: [], subtotal: 0 });

    const removed = await CartCommands.removeItem(ID.user1.toString(), ID.item1.toString());

    expect(removed).toBe(1);
    const pullCall = col("carts").updateOne.mock.calls[0][1];
    expect(pullCall.$pull.items).toHaveProperty("menuItemId");
  });
});
