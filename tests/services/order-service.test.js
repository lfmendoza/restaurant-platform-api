jest.mock("../../src/db");

const { getDb, getClient } = require("../../src/db");
const OrderService = require("../../src/services/OrderService");
const { setupMockDb, createCursor } = require("../helpers/mock-db");
const { ID, CARTS, MENU_ITEMS, RESTAURANTS, DELIVERY_ZONES } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb, getClient));
});

function setupHappyPath() {
  col("carts").findOne.mockResolvedValue(CARTS.withItems);
  col("menu_items").find.mockReturnValue(createCursor([MENU_ITEMS.pizza, MENU_ITEMS.coffee]));
  col("restaurants").findOne.mockResolvedValue(RESTAURANTS.active);
  col("delivery_zones").findOne.mockResolvedValue(DELIVERY_ZONES.centro);
  col("orders").insertOne.mockResolvedValue({ insertedId: ID.order1 });
  col("menu_items").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  col("carts").deleteOne.mockResolvedValue({ deletedCount: 1 });
  col("users").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
}

describe("OrderService.checkout", () => {
  const address = {
    street: "Calle Test",
    city: "Guatemala",
    zone: "Zona 10",
    coordinates: { type: "Point", coordinates: [-90.51, 14.59] },
  };

  it("returns a complete order document with all required fields", async () => {
    setupHappyPath();

    const order = await OrderService.checkout(
      ID.user1.toString(), ID.cart1.toString(), address, "card"
    );

    expect(order).toHaveProperty("orderNumber");
    expect(order.status).toBe("pending");
    expect(order.items).toHaveLength(2);
    expect(order.statusHistory).toHaveLength(1);
    expect(order.subtotal).toBeGreaterThan(0);
    expect(order.tax).toBeGreaterThan(0);
    expect(order.deliveryFee).toBe(15.0);
    expect(order.total).toBeGreaterThan(order.subtotal);
    expect(order.paymentMethod).toBe("card");
    expect(order.estimatedDelivery).toBeInstanceOf(Date);
  });

  it("calculates tax as 12% of subtotal", async () => {
    setupHappyPath();

    const order = await OrderService.checkout(
      ID.user1.toString(), ID.cart1.toString(), address, "card"
    );

    const expectedTax = Math.round(order.subtotal * 0.12 * 100) / 100;
    expect(order.tax).toBe(expectedTax);
  });

  it("snapshots item names + prices from cart into order", async () => {
    setupHappyPath();

    const order = await OrderService.checkout(
      ID.user1.toString(), ID.cart1.toString(), address, "card"
    );

    order.items.forEach((item) => {
      expect(item).toHaveProperty("menuItemId");
      expect(item).toHaveProperty("name");
      expect(item).toHaveProperty("unitPrice");
      expect(item).toHaveProperty("quantity");
      expect(item).toHaveProperty("subtotal");
    });
  });

  it("increments salesCount for each item", async () => {
    setupHappyPath();
    await OrderService.checkout(ID.user1.toString(), ID.cart1.toString(), address, "card");

    const menuUpdateCalls = col("menu_items").updateOne.mock.calls;
    expect(menuUpdateCalls.length).toBe(CARTS.withItems.items.length);
    menuUpdateCalls.forEach((call) => {
      expect(call[1].$inc).toHaveProperty("salesCount");
    });
  });

  it("deletes the cart after order creation", async () => {
    setupHappyPath();
    await OrderService.checkout(ID.user1.toString(), ID.cart1.toString(), address, "card");
    expect(col("carts").deleteOne).toHaveBeenCalledTimes(1);
  });

  it("appends order to user orderHistory with $slice -50 (Subset Pattern)", async () => {
    setupHappyPath();
    await OrderService.checkout(ID.user1.toString(), ID.cart1.toString(), address, "card");

    const userUpdate = col("users").updateOne.mock.calls[0][1];
    expect(userUpdate.$push.orderHistory.$slice).toBe(-50);
  });

  it("throws 400 when cart not found", async () => {
    col("carts").findOne.mockResolvedValue(null);
    await expect(OrderService.checkout(ID.user1.toString(), ID.cart1.toString(), address, "card"))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/cart not found/i) });
  });

  it("throws 400 when cart has unavailable items", async () => {
    col("carts").findOne.mockResolvedValue({ ...CARTS.withItems, hasUnavailableItems: true });
    await expect(OrderService.checkout(ID.user1.toString(), ID.cart1.toString(), address, "card"))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/unavailable/i) });
  });

  it("throws 400 when items no longer available in menu", async () => {
    col("carts").findOne.mockResolvedValue(CARTS.withItems);
    col("menu_items").find.mockReturnValue(createCursor([MENU_ITEMS.pizza]));

    await expect(OrderService.checkout(ID.user1.toString(), ID.cart1.toString(), address, "card"))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/no longer available/i) });
  });

  it("throws 400 when restaurant closed", async () => {
    col("carts").findOne.mockResolvedValue(CARTS.withItems);
    col("menu_items").find.mockReturnValue(createCursor([MENU_ITEMS.pizza, MENU_ITEMS.coffee]));
    col("restaurants").findOne.mockResolvedValue(null);

    await expect(OrderService.checkout(ID.user1.toString(), ID.cart1.toString(), address, "card"))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/not accepting/i) });
  });

  it("throws 400 when outside delivery zone", async () => {
    col("carts").findOne.mockResolvedValue(CARTS.withItems);
    col("menu_items").find.mockReturnValue(createCursor([MENU_ITEMS.pizza, MENU_ITEMS.coffee]));
    col("restaurants").findOne.mockResolvedValue(RESTAURANTS.active);
    col("delivery_zones").findOne.mockResolvedValue(null);

    await expect(OrderService.checkout(ID.user1.toString(), ID.cart1.toString(), address, "card"))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/outside coverage/i) });
  });
});
