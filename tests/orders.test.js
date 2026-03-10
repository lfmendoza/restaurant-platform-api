jest.mock("../src/db");

const request = require("supertest");
const { getDb, getClient } = require("../src/db");
const app = require("../src/app");
const { setupMockDb, createCursor } = require("./helpers/mock-db");
const { ID, CARTS, MENU_ITEMS, RESTAURANTS, DELIVERY_ZONES, ORDERS, VALID_TRANSITIONS } = require("./helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb, getClient));
});

describe("POST /orders (multi-document transaction)", () => {
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

  it("creates order: validates cart → items → restaurant → zone, calculates totals", async () => {
    setupHappyPath();

    const res = await request(app)
      .post("/orders")
      .send({
        userId: ID.user1.toString(),
        cartId: ID.cart1.toString(),
        deliveryAddress: {
          street: "Calle Test",
          city: "Guatemala",
          zone: "Zona 10",
          coordinates: { type: "Point", coordinates: [-90.51, 14.59] },
        },
        paymentMethod: "card",
      })
      .expect(201);

    expect(res.body).toHaveProperty("orderNumber");
    expect(res.body.status).toBe("pending");
    expect(res.body.statusHistory).toHaveLength(1);
    expect(res.body.statusHistory[0].status).toBe("pending");
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.tax).toBeGreaterThan(0);

    expect(col("orders").insertOne).toHaveBeenCalledTimes(1);
    expect(col("carts").deleteOne).toHaveBeenCalledTimes(1);
    expect(col("users").updateOne).toHaveBeenCalledTimes(1);

    const userUpdate = col("users").updateOne.mock.calls[0][1];
    expect(userUpdate.$push.orderHistory.$slice).toBe(-50);
  });

  it("fails when cart not found", async () => {
    col("carts").findOne.mockResolvedValue(null);

    const res = await request(app)
      .post("/orders")
      .send({ userId: ID.user1.toString(), cartId: ID.cart1.toString(), deliveryAddress: {}, paymentMethod: "card" })
      .expect(400);

    expect(res.body.error).toMatch(/Cart not found/i);
  });

  it("fails when cart has unavailable items", async () => {
    col("carts").findOne.mockResolvedValue({ ...CARTS.withItems, hasUnavailableItems: true });

    const res = await request(app)
      .post("/orders")
      .send({ userId: ID.user1.toString(), cartId: ID.cart1.toString(), deliveryAddress: {}, paymentMethod: "card" })
      .expect(400);

    expect(res.body.error).toMatch(/unavailable/i);
  });

  it("fails when some menu items are no longer available", async () => {
    col("carts").findOne.mockResolvedValue(CARTS.withItems);
    col("menu_items").find.mockReturnValue(createCursor([MENU_ITEMS.pizza]));

    const res = await request(app)
      .post("/orders")
      .send({ userId: ID.user1.toString(), cartId: ID.cart1.toString(), deliveryAddress: {}, paymentMethod: "card" })
      .expect(400);

    expect(res.body.error).toMatch(/no longer available/i);
  });

  it("fails when restaurant not accepting orders", async () => {
    col("carts").findOne.mockResolvedValue(CARTS.withItems);
    col("menu_items").find.mockReturnValue(createCursor([MENU_ITEMS.pizza, MENU_ITEMS.coffee]));
    col("restaurants").findOne.mockResolvedValue(null);

    const res = await request(app)
      .post("/orders")
      .send({ userId: ID.user1.toString(), cartId: ID.cart1.toString(), deliveryAddress: {}, paymentMethod: "card" })
      .expect(400);

    expect(res.body.error).toMatch(/not accepting/i);
  });

  it("fails when delivery address outside coverage", async () => {
    col("carts").findOne.mockResolvedValue(CARTS.withItems);
    col("menu_items").find.mockReturnValue(createCursor([MENU_ITEMS.pizza, MENU_ITEMS.coffee]));
    col("restaurants").findOne.mockResolvedValue(RESTAURANTS.active);
    col("delivery_zones").findOne.mockResolvedValue(null);

    const res = await request(app)
      .post("/orders")
      .send({
        userId: ID.user1.toString(),
        cartId: ID.cart1.toString(),
        deliveryAddress: { coordinates: { type: "Point", coordinates: [0, 0] } },
        paymentMethod: "card",
      })
      .expect(400);

    expect(res.body.error).toMatch(/outside coverage/i);
  });
});

describe("GET /orders ($lookup users + restaurants)", () => {
  it("returns enriched orders with user and restaurant data", async () => {
    col("orders").aggregate.mockReturnValue(createCursor([
      { ...ORDERS.delivered, user: { name: "Test", email: "t@t.com" }, restaurant: { name: "Bella Italia #1" } },
    ]));

    const res = await request(app).get("/orders?limit=5").expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty("user");
    expect(res.body[0]).toHaveProperty("restaurant");
  });

  it("filters by status", async () => {
    col("orders").aggregate.mockReturnValue(createCursor([]));

    await request(app).get("/orders?status=delivered").expect(200);

    const pipeline = col("orders").aggregate.mock.calls[0][0];
    const matchStage = pipeline.find((s) => s.$match);
    expect(matchStage.$match.status).toBe("delivered");
  });
});

describe("GET /orders/:id", () => {
  it("returns order", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.pending);
    const res = await request(app).get(`/orders/${ID.order2}`).expect(200);
    expect(res.body.orderNumber).toBe(ORDERS.pending.orderNumber);
  });

  it("returns 404", async () => {
    col("orders").findOne.mockResolvedValue(null);
    await request(app).get(`/orders/${ID.order1}`).expect(404);
  });
});

describe("PATCH /orders/:id/status (FSM transitions)", () => {
  Object.entries(VALID_TRANSITIONS).forEach(([from, validTargets]) => {
    if (validTargets.length > 0) {
      it(`allows ${from} → ${validTargets[0]}`, async () => {
        col("orders").findOne.mockResolvedValue({ ...ORDERS.pending, status: from, statusHistory: [{ status: from, timestamp: new Date() }] });
        col("orders").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

        const res = await request(app)
          .patch(`/orders/${ID.order2}/status`)
          .send({ status: validTargets[0], actor: "system" })
          .expect(200);

        expect(res.body.status).toBe(validTargets[0]);
        expect(res.body.transition).toBe(`${from} → ${validTargets[0]}`);
      });
    }
  });

  it("rejects invalid transition pending → delivered", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.pending);

    const res = await request(app)
      .patch(`/orders/${ID.order2}/status`)
      .send({ status: "delivered" })
      .expect(400);

    expect(res.body.error).toMatch(/not allowed/i);
    expect(res.body.allowed).toEqual(["confirmed", "cancelled"]);
  });

  it("rejects transitions from terminal states", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.delivered);

    const res = await request(app)
      .patch(`/orders/${ID.order1}/status`)
      .send({ status: "cancelled" })
      .expect(400);

    expect(res.body.allowed).toEqual([]);
  });

  it("records cancellation reason when cancelling", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.pending);
    col("orders").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    await request(app)
      .patch(`/orders/${ID.order2}/status`)
      .send({ status: "cancelled", reason: "Customer request" })
      .expect(200);

    const update = col("orders").updateOne.mock.calls[0][1];
    expect(update.$set.cancellationReason).toBe("Customer request");
  });

  it("stores durationFromPrevSec in statusHistory", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.pending);
    col("orders").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    await request(app)
      .patch(`/orders/${ID.order2}/status`)
      .send({ status: "confirmed" })
      .expect(200);

    const pushArg = col("orders").updateOne.mock.calls[0][1].$push.statusHistory;
    expect(pushArg).toHaveProperty("durationFromPrevSec");
    expect(typeof pushArg.durationFromPrevSec).toBe("number");
  });
});

describe("DELETE /orders/cancelled (deleteMany)", () => {
  it("deletes cancelled orders older than date", async () => {
    col("orders").deleteMany.mockResolvedValue({ deletedCount: 5 });

    const res = await request(app)
      .delete("/orders/cancelled?before=2025-01-01")
      .expect(200);

    expect(res.body.deleted).toBe(5);
    const filter = col("orders").deleteMany.mock.calls[0][0];
    expect(filter.status).toBe("cancelled");
    expect(filter.createdAt.$lt).toBeInstanceOf(Date);
  });
});

describe("DELETE /orders/:id", () => {
  it("deletes order", async () => {
    col("orders").deleteOne.mockResolvedValue({ deletedCount: 1 });
    const res = await request(app).delete(`/orders/${ID.order1}`).expect(200);
    expect(res.body.deleted).toBe(1);
  });

  it("returns 404", async () => {
    col("orders").deleteOne.mockResolvedValue({ deletedCount: 0 });
    await request(app).delete(`/orders/${ID.order1}`).expect(404);
  });
});
