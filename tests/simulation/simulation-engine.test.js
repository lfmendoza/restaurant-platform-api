jest.mock("../../src/db");

const { ObjectId } = require("mongodb");
const { getDb } = require("../../src/db");
const SimulationEngine = require("../../src/simulation/SimulationEngine");
const { setupMockDb } = require("../helpers/mock-db");

let col;

function setupSeedMocks() {
  const restId = new ObjectId();

  col("users").find.mockReturnValue({
    limit: jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue([
        { _id: new ObjectId(), defaultAddress: { street: "Test", city: "Guatemala", zone: "Zona 10", coordinates: { type: "Point", coordinates: [-90.51, 14.59] } } },
      ]),
    }),
  });

  col("restaurants").find.mockReturnValue({
    toArray: jest.fn().mockResolvedValue([
      { _id: restId, name: "TestRest", cuisineTypes: ["italiana"], menuItemCount: 3, address: { zone: "Zona 10" } },
    ]),
  });

  col("menu_items").find.mockReturnValue({
    toArray: jest.fn().mockResolvedValue([
      { _id: new ObjectId(), restaurantId: restId, name: "Item1", price: 50, category: "Main" },
      { _id: new ObjectId(), restaurantId: restId, name: "Item2", price: 30, category: "Side" },
    ]),
  });

  col("delivery_zones").find.mockReturnValue({
    toArray: jest.fn().mockResolvedValue([
      { _id: new ObjectId(), restaurantId: restId, zoneName: "Zone1", deliveryFee: 15, estimatedMinutes: 25, isActive: true },
    ]),
  });

  col("orders").insertOne.mockResolvedValue({ insertedId: new ObjectId() });
  col("orders").insertMany.mockImplementation((docs) => {
    const insertedIds = {};
    docs.forEach((_, i) => { insertedIds[i] = new ObjectId(); });
    return Promise.resolve({ insertedIds, insertedCount: docs.length });
  });
  col("orders").updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
}

beforeEach(() => {
  ({ col } = setupMockDb(getDb));
  setupSeedMocks();
});

describe("SimulationEngine lifecycle", () => {
  let engine;

  afterEach(() => {
    try { engine.stop(); } catch (e) { /* already stopped */ }
  });

  it("starts in idle state", () => {
    engine = new SimulationEngine();
    expect(engine.state).toBe("idle");
  });

  it("transitions to running on start", async () => {
    engine = new SimulationEngine();
    const status = await engine.start({ durationMinutes: 1, ordersPerMinute: 5 });

    expect(engine.state).toBe("running");
    expect(status.state).toBe("running");
    expect(status.config.durationMinutes).toBe(1);
  });

  it("rejects invalid duration", async () => {
    engine = new SimulationEngine();
    await expect(engine.start({ durationMinutes: 7 }))
      .rejects.toThrow("durationMinutes must be one of");
  });

  it("cannot start when already running", async () => {
    engine = new SimulationEngine();
    await engine.start({ durationMinutes: 1 });

    await expect(engine.start({ durationMinutes: 1 }))
      .rejects.toThrow("Cannot start");
  });

  it("pauses a running simulation", async () => {
    engine = new SimulationEngine();
    await engine.start({ durationMinutes: 1, ordersPerMinute: 5 });

    const status = engine.pause();
    expect(engine.state).toBe("paused");
    expect(status.state).toBe("paused");
  });

  it("cannot pause when not running", () => {
    engine = new SimulationEngine();
    expect(() => engine.pause()).toThrow("Cannot pause");
  });

  it("resumes a paused simulation", async () => {
    engine = new SimulationEngine();
    await engine.start({ durationMinutes: 1, ordersPerMinute: 5 });
    engine.pause();

    const status = engine.resume();
    expect(engine.state).toBe("running");
    expect(status.state).toBe("running");
  });

  it("cannot resume when not paused", async () => {
    engine = new SimulationEngine();
    await engine.start({ durationMinutes: 1, ordersPerMinute: 5 });
    expect(() => engine.resume()).toThrow("Cannot resume");
  });

  it("stops a running simulation", async () => {
    engine = new SimulationEngine();
    await engine.start({ durationMinutes: 1, ordersPerMinute: 5 });

    const status = engine.stop();
    expect(engine.state).toBe("stopped");
    expect(status.state).toBe("stopped");
  });

  it("stops a paused simulation", async () => {
    engine = new SimulationEngine();
    await engine.start({ durationMinutes: 1, ordersPerMinute: 5 });
    engine.pause();

    const status = engine.stop();
    expect(engine.state).toBe("stopped");
    expect(status.state).toBe("stopped");
  });

  it("cannot stop when idle", () => {
    engine = new SimulationEngine();
    expect(() => engine.stop()).toThrow("Cannot stop");
  });
});

describe("SimulationEngine events", () => {
  let engine;

  afterEach(() => {
    try { engine.stop(); } catch (e) { /* already stopped */ }
  });

  it("emits simulation:started on start", async () => {
    engine = new SimulationEngine();
    const events = [];
    engine.on("simulation:started", (data) => events.push(data));

    await engine.start({ durationMinutes: 1 });

    expect(events).toHaveLength(1);
    expect(events[0].durationMinutes).toBe(1);
  });

  it("emits simulation:paused on pause", async () => {
    engine = new SimulationEngine();
    const events = [];
    engine.on("simulation:paused", () => events.push("paused"));

    await engine.start({ durationMinutes: 1 });
    engine.pause();

    expect(events).toHaveLength(1);
  });

  it("emits simulation:resumed on resume", async () => {
    engine = new SimulationEngine();
    const events = [];
    engine.on("simulation:resumed", () => events.push("resumed"));

    await engine.start({ durationMinutes: 1 });
    engine.pause();
    engine.resume();

    expect(events).toHaveLength(1);
  });

  it("emits simulation:complete on stop", async () => {
    engine = new SimulationEngine();
    const events = [];
    engine.on("simulation:complete", (data) => events.push(data));

    await engine.start({ durationMinutes: 1 });
    engine.stop();

    expect(events).toHaveLength(1);
    expect(events[0]).toHaveProperty("orders");
    expect(events[0]).toHaveProperty("throughput");
    expect(events[0]).toHaveProperty("latency");
  });

  it("emits order:created for stratified orders", async () => {
    engine = new SimulationEngine();
    const events = [];
    engine.on("order:created", (data) => events.push(data));

    await engine.start({ durationMinutes: 1, ordersPerMinute: 1 });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty("orderId");
    expect(events[0]).toHaveProperty("zone");
    expect(events[0]).toHaveProperty("paymentMethod");
  });
});

describe("SimulationEngine.status", () => {
  let engine;

  afterEach(() => {
    try { engine.stop(); } catch (e) { /* already stopped */ }
  });

  it("returns complete status object", async () => {
    engine = new SimulationEngine();
    await engine.start({ durationMinutes: 1 });

    const status = engine.status();

    expect(status).toHaveProperty("state", "running");
    expect(status).toHaveProperty("config");
    expect(status).toHaveProperty("elapsed");
    expect(status.elapsed).toHaveProperty("ms");
    expect(status.elapsed).toHaveProperty("seconds");
    expect(status.elapsed).toHaveProperty("formatted");
    expect(status).toHaveProperty("remaining");
    expect(status).toHaveProperty("orders");
    expect(status.orders).toHaveProperty("totalCreated");
    expect(status.orders).toHaveProperty("inFlight");
    expect(status.orders).toHaveProperty("completed");
    expect(status.orders).toHaveProperty("cancelled");
  });

  it("tracks elapsed time correctly when paused", async () => {
    engine = new SimulationEngine();
    await engine.start({ durationMinutes: 1 });

    await new Promise((resolve) => setTimeout(resolve, 100));
    engine.pause();

    const pausedStatus = engine.status();
    const pausedElapsed = pausedStatus.elapsed.ms;

    await new Promise((resolve) => setTimeout(resolve, 200));

    const stillPausedStatus = engine.status();
    expect(stillPausedStatus.elapsed.ms).toBe(pausedElapsed);
  });
});

describe("SimulationEngine.getMetrics", () => {
  let engine;

  afterEach(() => {
    try { engine.stop(); } catch (e) { /* already stopped */ }
  });

  it("returns metrics snapshot", async () => {
    engine = new SimulationEngine();
    await engine.start({ durationMinutes: 1 });

    const metrics = engine.getMetrics();

    expect(metrics).toHaveProperty("elapsed");
    expect(metrics).toHaveProperty("orders");
    expect(metrics).toHaveProperty("throughput");
    expect(metrics).toHaveProperty("latency");
    expect(metrics).toHaveProperty("concurrency");
    expect(metrics).toHaveProperty("zoneHeatmap");
    expect(metrics).toHaveProperty("statusDistribution");
    expect(metrics).toHaveProperty("patterns");
  });
});
