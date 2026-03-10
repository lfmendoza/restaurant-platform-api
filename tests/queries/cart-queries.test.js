jest.mock("../../src/db");

const { getDb, getReadDb } = require("../../src/db");
const CartQueries = require("../../src/queries/CartQueries");
const { setupMockDb } = require("../helpers/mock-db");
const { ID, CARTS } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb, null, null, getReadDb));
});

describe("CartQueries.getByUser", () => {
  it("returns cart for userId", async () => {
    col("carts").findOne.mockResolvedValue(CARTS.withItems);

    const cart = await CartQueries.getByUser({ userId: ID.user1.toString() });

    expect(cart.subtotal).toBe(196.0);
    expect(cart.items).toHaveLength(2);
  });

  it("applies restaurantId filter when provided", async () => {
    col("carts").findOne.mockResolvedValue(CARTS.withItems);

    await CartQueries.getByUser({
      userId: ID.user1.toString(),
      restaurantId: ID.rest1.toString(),
    });

    const filter = col("carts").findOne.mock.calls[0][0];
    expect(filter.restaurantId).toEqual(ID.rest1);
  });

  it("throws 400 when userId missing", async () => {
    await expect(CartQueries.getByUser({}))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 404 when cart not found", async () => {
    col("carts").findOne.mockResolvedValue(null);

    await expect(CartQueries.getByUser({ userId: ID.user1.toString() }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
