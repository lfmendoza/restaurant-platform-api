jest.mock("../../src/db");

const { getDb } = require("../../src/db");
const OrderCommands = require("../../src/commands/OrderCommands");
const { setupMockDb } = require("../helpers/mock-db");
const { ID, ORDERS } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb));
});

describe("OrderCommands.updateStatus — validation", () => {
  it("throws 400 on invalid orderId", async () => {
    await expect(OrderCommands.updateStatus("bad", "confirmed"))
      .rejects.toMatchObject({ statusCode: 400, message: /orderId/ });
  });

  it("throws 400 when newStatus is missing", async () => {
    await expect(OrderCommands.updateStatus(ID.order2.toString(), ""))
      .rejects.toMatchObject({ statusCode: 400, message: /newStatus/ });
  });
});

describe("OrderCommands.delete — validation", () => {
  it("throws 400 on invalid orderId", async () => {
    await expect(OrderCommands.delete("bad"))
      .rejects.toMatchObject({ statusCode: 400, message: /orderId/ });
  });
});

describe("OrderCommands.updateStatus", () => {
  it("finds order, validates transition, and writes update", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.pending);
    col("orders").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const result = await OrderCommands.updateStatus(
      ID.order2.toString(), "confirmed", "restaurant"
    );

    expect(result.status).toBe("confirmed");
    expect(result.transition).toContain("pending → confirmed");

    const update = col("orders").updateOne.mock.calls[0][1];
    expect(update.$set.status).toBe("confirmed");
    expect(update.$push.statusHistory.status).toBe("confirmed");
    expect(update.$push.statusHistory.actor).toBe("restaurant");
  });

  it("throws 404 when order not found", async () => {
    col("orders").findOne.mockResolvedValue(null);

    await expect(OrderCommands.updateStatus(ID.order1.toString(), "confirmed"))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 400 on invalid transition", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.pending);

    await expect(OrderCommands.updateStatus(ID.order2.toString(), "delivered"))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("includes cancellationReason when cancelling with reason", async () => {
    col("orders").findOne.mockResolvedValue(ORDERS.pending);
    col("orders").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    await OrderCommands.updateStatus(
      ID.order2.toString(), "cancelled", "customer", "Too slow"
    );

    const update = col("orders").updateOne.mock.calls[0][1];
    expect(update.$set.cancellationReason).toBe("Too slow");
  });
});

describe("OrderCommands.deleteCancelled", () => {
  it("deletes all cancelled orders", async () => {
    col("orders").deleteMany.mockResolvedValue({ deletedCount: 5 });

    const result = await OrderCommands.deleteCancelled({});

    expect(result.deleted).toBe(5);
    const filter = col("orders").deleteMany.mock.calls[0][0];
    expect(filter.status).toBe("cancelled");
  });

  it("applies before date filter", async () => {
    col("orders").deleteMany.mockResolvedValue({ deletedCount: 2 });

    await OrderCommands.deleteCancelled({ before: "2025-06-01" });

    const filter = col("orders").deleteMany.mock.calls[0][0];
    expect(filter.createdAt.$lt).toBeInstanceOf(Date);
  });
});

describe("OrderCommands.delete", () => {
  it("deletes single order", async () => {
    col("orders").deleteOne.mockResolvedValue({ deletedCount: 1 });
    const result = await OrderCommands.delete(ID.order1.toString());
    expect(result.deleted).toBe(1);
  });

  it("throws 404 when not found", async () => {
    col("orders").deleteOne.mockResolvedValue({ deletedCount: 0 });
    await expect(OrderCommands.delete(ID.order1.toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
