jest.mock("../../src/db");

const { getDb } = require("../../src/db");
const CartCommands = require("../../src/commands/CartCommands");
const { setupMockDb } = require("../helpers/mock-db");
const { ID } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb));
});

describe("CartCommands.addItem — validation", () => {
  it("throws 400 when userId is missing", async () => {
    await expect(CartCommands.addItem(null, ID.item1.toString(), 1))
      .rejects.toMatchObject({ statusCode: 400, message: /userId/ });
  });

  it("throws 400 when menuItemId is missing", async () => {
    await expect(CartCommands.addItem(ID.user1.toString(), null, 1))
      .rejects.toMatchObject({ statusCode: 400, message: /menuItemId/ });
  });

  it("throws 400 on invalid userId format", async () => {
    await expect(CartCommands.addItem("bad", ID.item1.toString(), 1))
      .rejects.toMatchObject({ statusCode: 400, message: /userId/ });
  });
});

describe("CartCommands.updateItemQuantity — validation", () => {
  it("throws 400 when userId is missing", async () => {
    await expect(CartCommands.updateItemQuantity(null, ID.item1.toString(), 1))
      .rejects.toMatchObject({ statusCode: 400, message: /userId/ });
  });

  it("throws 400 on invalid menuItemId", async () => {
    await expect(CartCommands.updateItemQuantity(ID.user1.toString(), "bad", 1))
      .rejects.toMatchObject({ statusCode: 400, message: /menuItemId/ });
  });
});

describe("CartCommands.removeItem — validation", () => {
  it("throws 400 when userId is missing", async () => {
    await expect(CartCommands.removeItem(null, ID.item1.toString()))
      .rejects.toMatchObject({ statusCode: 400, message: /userId/ });
  });

  it("throws 400 on invalid menuItemId", async () => {
    await expect(CartCommands.removeItem(ID.user1.toString(), "bad"))
      .rejects.toMatchObject({ statusCode: 400, message: /menuItemId/ });
  });
});

describe("CartCommands.deleteCart", () => {
  it("deletes cart by userId", async () => {
    col("carts").deleteOne.mockResolvedValue({ deletedCount: 1 });

    const result = await CartCommands.deleteCart({ userId: ID.user1.toString() });

    expect(result.deleted).toBe(1);
    const filter = col("carts").deleteOne.mock.calls[0][0];
    expect(filter.userId).toEqual(ID.user1);
  });

  it("includes restaurantId in filter when provided", async () => {
    col("carts").deleteOne.mockResolvedValue({ deletedCount: 1 });

    await CartCommands.deleteCart({
      userId: ID.user1.toString(),
      restaurantId: ID.rest1.toString(),
    });

    const filter = col("carts").deleteOne.mock.calls[0][0];
    expect(filter.restaurantId).toEqual(ID.rest1);
  });

  it("throws 400 when userId missing", async () => {
    await expect(CartCommands.deleteCart({}))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 on invalid restaurantId format", async () => {
    await expect(CartCommands.deleteCart({ userId: ID.user1.toString(), restaurantId: "bad" }))
      .rejects.toMatchObject({ statusCode: 400, message: /restaurantId/ });
  });
});
