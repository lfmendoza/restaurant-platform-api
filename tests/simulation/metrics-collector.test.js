const MetricsCollector = require("../../src/simulation/MetricsCollector");
const { ObjectId } = require("mongodb");

describe("MetricsCollector", () => {
  let collector;

  beforeEach(() => {
    collector = new MetricsCollector({ slidingWindowSec: 60 });
    collector.start();
  });

  describe("initial state", () => {
    it("starts with zero counters", () => {
      const snap = collector.snapshot();
      expect(snap.orders.totalCreated).toBe(0);
      expect(snap.orders.totalCompleted).toBe(0);
      expect(snap.orders.totalCancelled).toBe(0);
      expect(snap.concurrency.current).toBe(0);
      expect(snap.concurrency.peak).toBe(0);
    });

    it("has complete snapshot structure", () => {
      const snap = collector.snapshot();
      expect(snap).toHaveProperty("elapsed");
      expect(snap).toHaveProperty("orders");
      expect(snap).toHaveProperty("throughput");
      expect(snap).toHaveProperty("latency");
      expect(snap).toHaveProperty("concurrency");
      expect(snap).toHaveProperty("zoneHeatmap");
      expect(snap).toHaveProperty("statusDistribution");
      expect(snap).toHaveProperty("patterns");
      expect(snap.patterns).toHaveProperty("byPaymentMethod");
      expect(snap.patterns).toHaveProperty("byCuisine");
      expect(snap.patterns).toHaveProperty("byHour");
    });
  });

  describe("recordOrderCreated", () => {
    const makeOrder = (zone = "Zona 10", payment = "card", cuisine = "italiana") => ({
      _id: new ObjectId(),
      deliveryAddress: { zone },
      paymentMethod: payment,
      cuisineType: cuisine,
      createdAt: new Date(),
    });

    it("increments totalCreated and concurrency", () => {
      collector.recordOrderCreated(makeOrder());
      collector.recordOrderCreated(makeOrder());

      const snap = collector.snapshot();
      expect(snap.orders.totalCreated).toBe(2);
      expect(snap.concurrency.current).toBe(2);
    });

    it("tracks peak concurrency", () => {
      collector.recordOrderCreated(makeOrder());
      collector.recordOrderCreated(makeOrder());
      collector.recordOrderCreated(makeOrder());

      expect(collector.snapshot().concurrency.peak).toBe(3);
    });

    it("updates zone heatmap", () => {
      collector.recordOrderCreated(makeOrder("Zona 1"));
      collector.recordOrderCreated(makeOrder("Zona 1"));
      collector.recordOrderCreated(makeOrder("Zona 10"));

      const snap = collector.snapshot();
      expect(snap.zoneHeatmap["Zona 1"]).toBe(2);
      expect(snap.zoneHeatmap["Zona 10"]).toBe(1);
    });

    it("tracks payment method patterns", () => {
      collector.recordOrderCreated(makeOrder("z", "card"));
      collector.recordOrderCreated(makeOrder("z", "cash"));
      collector.recordOrderCreated(makeOrder("z", "card"));

      expect(collector.snapshot().patterns.byPaymentMethod).toEqual({
        card: 2,
        cash: 1,
      });
    });

    it("tracks cuisine patterns", () => {
      collector.recordOrderCreated(makeOrder("z", "card", "italiana"));
      collector.recordOrderCreated(makeOrder("z", "card", "mexicana"));

      expect(collector.snapshot().patterns.byCuisine).toEqual({
        italiana: 1,
        mexicana: 1,
      });
    });

    it("increments pending in status distribution", () => {
      collector.recordOrderCreated(makeOrder());
      expect(collector.snapshot().statusDistribution.pending).toBe(1);
    });
  });

  describe("recordTransition", () => {
    it("updates status distribution on non-terminal transition", () => {
      collector.statusDistribution.pending = 1;
      collector.recordTransition("pending", "confirmed", {});

      const snap = collector.snapshot();
      expect(snap.statusDistribution.pending).toBe(0);
      expect(snap.statusDistribution.confirmed).toBe(1);
    });

    it("decrements concurrency on delivered", () => {
      collector.concurrency = 3;
      collector.recordTransition("picked_up", "delivered", { createdAt: new Date(Date.now() - 5000) });

      expect(collector.concurrency).toBe(2);
      expect(collector.totalCompleted).toBe(1);
    });

    it("decrements concurrency on cancelled", () => {
      collector.concurrency = 2;
      collector.recordTransition("pending", "cancelled", { createdAt: new Date(Date.now() - 3000) });

      expect(collector.concurrency).toBe(1);
      expect(collector.totalCancelled).toBe(1);
    });

    it("records latency for terminal orders", () => {
      const createdAt = new Date(Date.now() - 10000);
      collector.recordTransition("picked_up", "delivered", { createdAt });

      const snap = collector.snapshot();
      expect(snap.latency.count).toBe(1);
      expect(snap.latency.p50).toBeGreaterThan(0);
    });

    it("concurrency never goes below zero", () => {
      collector.concurrency = 0;
      collector.recordTransition("pending", "cancelled", {});
      expect(collector.concurrency).toBe(0);
    });
  });

  describe("latency percentiles", () => {
    it("computes p50, p95, p99", () => {
      for (let i = 1; i <= 100; i++) {
        collector.latencies.push(i * 100);
      }

      const snap = collector.snapshot();
      expect(snap.latency.p50).toBe(5000);
      expect(snap.latency.p95).toBe(9500);
      expect(snap.latency.p99).toBe(9900);
      expect(snap.latency.avg).toBe(5050);
      expect(snap.latency.count).toBe(100);
    });

    it("returns zeros when no latencies recorded", () => {
      const snap = collector.snapshot();
      expect(snap.latency).toEqual({ p50: 0, p95: 0, p99: 0, avg: 0, count: 0 });
    });
  });

  describe("throughput", () => {
    it("counts completed orders in sliding window", () => {
      collector.completionTimestamps.push(Date.now());
      collector.completionTimestamps.push(Date.now());
      collector.completionTimestamps.push(Date.now() - 120000);

      const snap = collector.snapshot();
      expect(snap.throughput.completedInWindow).toBe(2);
    });
  });

  describe("cancellation rate", () => {
    it("computes correctly", () => {
      collector.totalCreated = 100;
      collector.totalCancelled = 15;

      const snap = collector.snapshot();
      expect(snap.orders.cancellationRate).toBe(15);
    });

    it("returns 0 when no orders", () => {
      expect(collector.snapshot().orders.cancellationRate).toBe(0);
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      collector.recordOrderCreated({ deliveryAddress: { zone: "Z1" }, paymentMethod: "card", cuisineType: "x", createdAt: new Date() });
      collector.reset();

      const snap = collector.snapshot();
      expect(snap.orders.totalCreated).toBe(0);
      expect(snap.concurrency.current).toBe(0);
    });
  });

  describe("elapsed formatting", () => {
    it("formats duration correctly", () => {
      expect(collector._formatDuration(90000)).toBe("1m 30s");
      expect(collector._formatDuration(0)).toBe("0m 0s");
      expect(collector._formatDuration(61000)).toBe("1m 1s");
    });
  });
});
