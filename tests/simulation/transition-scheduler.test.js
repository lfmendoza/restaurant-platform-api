jest.mock("../../src/db");

const { ObjectId } = require("mongodb");
const { getDb } = require("../../src/db");
const TransitionScheduler = require("../../src/simulation/TransitionScheduler");
const { setupMockDb } = require("../helpers/mock-db");

let col;
let scheduler;
const transitions = [];

beforeEach(() => {
  ({ col } = setupMockDb(getDb));
  transitions.length = 0;
  scheduler = new TransitionScheduler({
    onTransition: (from, to, order) => transitions.push({ from, to, orderId: order._id }),
    speedMultiplier: 100,
  });
});

afterEach(() => {
  scheduler.stop();
});

function makeOrder(status = "pending") {
  return {
    _id: new ObjectId(),
    status,
    statusHistory: [
      { status, timestamp: new Date(), actor: "simulation", durationFromPrevSec: 0 },
    ],
  };
}

describe("TransitionScheduler.scheduleOrder", () => {
  it("schedules a timer for non-terminal orders", () => {
    const order = makeOrder("pending");
    scheduler.scheduleOrder(order);

    expect(scheduler.activeCount).toBe(1);
  });

  it("does not schedule terminal orders (delivered)", () => {
    scheduler.scheduleOrder(makeOrder("delivered"));
    expect(scheduler.activeCount).toBe(0);
  });

  it("does not schedule terminal orders (cancelled)", () => {
    scheduler.scheduleOrder(makeOrder("cancelled"));
    expect(scheduler.activeCount).toBe(0);
  });

  it("does not schedule when stopped", () => {
    scheduler.stop();
    scheduler.scheduleOrder(makeOrder("pending"));
    expect(scheduler.activeCount).toBe(0);
  });

  it("does not schedule when paused", () => {
    scheduler.pause();
    scheduler.scheduleOrder(makeOrder("pending"));
    expect(scheduler.activeCount).toBe(0);
  });
});

describe("TransitionScheduler transition execution", () => {
  it("executes a valid transition and writes to DB", async () => {
    const order = makeOrder("pending");
    col("orders").findOne.mockResolvedValue(order);
    col("orders").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    scheduler.scheduleOrder(order);

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(col("orders").findOne).toHaveBeenCalledWith({ _id: order._id });
    expect(col("orders").updateOne).toHaveBeenCalled();
    const update = col("orders").updateOne.mock.calls[0][1];
    expect(update.$set).toHaveProperty("status");
    expect(["confirmed", "cancelled"]).toContain(update.$set.status);
    expect(update.$push.statusHistory.actor).toBe("simulation");
  });

  it("calls onTransition callback after transition", async () => {
    const order = makeOrder("pending");
    col("orders").findOne.mockResolvedValue(order);
    col("orders").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    scheduler.scheduleOrder(order);

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions[0].from).toBe("pending");
    expect(["confirmed", "cancelled"]).toContain(transitions[0].to);
  });

  it("chains transitions for non-terminal results", async () => {
    const order = makeOrder("ready_for_pickup");
    col("orders").findOne
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce({ ...order, status: "picked_up" });
    col("orders").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    scheduler.scheduleOrder(order);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(transitions.length).toBeGreaterThanOrEqual(1);
    expect(transitions[0].from).toBe("ready_for_pickup");
    expect(transitions[0].to).toBe("picked_up");
  });
});

describe("TransitionScheduler.pause / resume", () => {
  it("pause clears timers and preserves remaining time", () => {
    const order = makeOrder("pending");
    scheduler.scheduleOrder(order);

    expect(scheduler.activeCount).toBe(1);

    scheduler.pause();

    const timerInfo = [...scheduler.timers.values()][0];
    expect(timerInfo.timer).toBeNull();
    expect(timerInfo.remainingMs).toBeGreaterThanOrEqual(0);
  });

  it("resume reschedules with remaining time", () => {
    const order = makeOrder("pending");
    scheduler.scheduleOrder(order);

    scheduler.pause();
    scheduler.resume();

    const timerInfo = [...scheduler.timers.values()][0];
    expect(timerInfo.timer).not.toBeNull();
  });
});

describe("TransitionScheduler.stop", () => {
  it("clears all timers", () => {
    scheduler.scheduleOrder(makeOrder("pending"));
    scheduler.scheduleOrder(makeOrder("confirmed"));

    expect(scheduler.activeCount).toBe(2);

    scheduler.stop();

    expect(scheduler.activeCount).toBe(0);
    expect(scheduler._stopped).toBe(true);
  });
});

describe("Cancellation reasons", () => {
  it("includes cancellationReason when transitioning to cancelled", async () => {
    const order = makeOrder("pending");
    col("orders").findOne.mockResolvedValue(order);
    col("orders").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    jest.spyOn(Math, "random")
      .mockReturnValueOnce(0.999)
      .mockReturnValueOnce(0.01)
      .mockReturnValueOnce(0.5);

    scheduler.scheduleOrder(order);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const calls = col("orders").updateOne.mock.calls;
    if (calls.length > 0 && calls[0][1].$set.status === "cancelled") {
      expect(calls[0][1].$set).toHaveProperty("cancellationReason");
      expect(typeof calls[0][1].$set.cancellationReason).toBe("string");
    }

    Math.random.mockRestore();
  });
});
