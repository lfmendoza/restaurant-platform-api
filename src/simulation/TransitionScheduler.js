const { getDb } = require("../db");
const OrderStateMachine = require("../domain/OrderStateMachine");
const { logNormalRandom, weightedRandom } = require("./distributions");

const TRANSITION_PROBABILITIES = {
  pending: [
    { to: "confirmed", weight: 0.90 },
    { to: "cancelled", weight: 0.10 },
  ],
  confirmed: [
    { to: "preparing", weight: 0.92 },
    { to: "cancelled", weight: 0.08 },
  ],
  preparing: [
    { to: "ready_for_pickup", weight: 0.88 },
    { to: "cancelled", weight: 0.12 },
  ],
  ready_for_pickup: [
    { to: "picked_up", weight: 1.0 },
  ],
  picked_up: [
    { to: "delivered", weight: 1.0 },
  ],
};

const DELAY_PARAMS = {
  pending:          { mu: 2.5, sigma: 0.5 },   // ~12s median
  confirmed:        { mu: 3.0, sigma: 0.6 },   // ~20s median
  preparing:        { mu: 3.5, sigma: 0.5 },   // ~33s median
  ready_for_pickup: { mu: 2.0, sigma: 0.4 },   // ~7s median
  picked_up:        { mu: 3.0, sigma: 0.7 },   // ~20s median
};

class TransitionScheduler {
  constructor({ onTransition, speedMultiplier = 1 } = {}) {
    this.onTransition = onTransition || (() => {});
    this.speedMultiplier = speedMultiplier;
    this.timers = new Map();
    this.paused = false;
    this._stopped = false;
  }

  scheduleOrder(order) {
    if (this._stopped || this.paused) return;

    const status = order.status;
    const transitions = TRANSITION_PROBABILITIES[status];
    if (!transitions) return;

    const delaySec = this._sampleDelay(status);
    const delayMs = Math.max(500, Math.round((delaySec * 1000) / this.speedMultiplier));

    const timerInfo = {
      orderId: order._id,
      currentStatus: status,
      scheduledAt: Date.now(),
      delayMs,
      timer: setTimeout(() => this._executeTransition(order), delayMs),
    };

    this.timers.set(order._id.toString(), timerInfo);
  }

  async _executeTransition(order) {
    if (this._stopped) return;

    const key = order._id.toString();
    this.timers.delete(key);

    const db = getDb();

    try {
      const fresh = await db.collection("orders").findOne({ _id: order._id });
      if (!fresh) return;

      const status = fresh.status;
      const transitions = TRANSITION_PROBABILITIES[status];
      if (!transitions) return;

      const targets = transitions.map((t) => t.to);
      const weights = transitions.map((t) => t.weight);
      const nextStatus = weightedRandom(targets, weights);

      OrderStateMachine.validate(status, nextStatus);

      const now = new Date();
      const lastEntry = fresh.statusHistory[fresh.statusHistory.length - 1];
      const durationFromPrevSec = lastEntry
        ? Math.floor((now - new Date(lastEntry.timestamp)) / 1000)
        : 0;

      const historyEntry = {
        status: nextStatus,
        timestamp: now,
        actor: "simulation",
        durationFromPrevSec,
      };

      const update = {
        $set: { status: nextStatus, updatedAt: now },
        $push: { statusHistory: historyEntry },
      };

      if (nextStatus === "cancelled") {
        const reasons = [
          "Customer changed mind",
          "Restaurant too busy",
          "Delivery too far",
          "Payment issue",
          "Out of stock",
        ];
        update.$set.cancellationReason =
          reasons[Math.floor(Math.random() * reasons.length)];
      }

      await db.collection("orders").updateOne({ _id: order._id }, update);

      const updatedOrder = {
        ...fresh,
        status: nextStatus,
        statusHistory: [...fresh.statusHistory, historyEntry],
        updatedAt: now,
      };

      this.onTransition(status, nextStatus, updatedOrder);

      const isTerminal = nextStatus === "delivered" || nextStatus === "cancelled";
      if (!isTerminal) {
        this.scheduleOrder(updatedOrder);
      }
    } catch (err) {
      console.error(`TransitionScheduler error [${key}]:`, err.message);
    }
  }

  _sampleDelay(status) {
    const params = DELAY_PARAMS[status] || { mu: 2.5, sigma: 0.5 };
    return logNormalRandom(params.mu, params.sigma);
  }

  pause() {
    this.paused = true;
    const now = Date.now();

    for (const [key, info] of this.timers) {
      clearTimeout(info.timer);
      const elapsed = now - info.scheduledAt;
      info.remainingMs = Math.max(0, info.delayMs - elapsed);
      info.timer = null;
    }
  }

  resume() {
    this.paused = false;

    for (const [key, info] of this.timers) {
      if (info.timer) continue;

      info.scheduledAt = Date.now();
      info.delayMs = info.remainingMs || 0;
      info.timer = setTimeout(
        () => this._executeTransition({ _id: info.orderId, status: info.currentStatus, statusHistory: [] }),
        info.delayMs
      );
    }
  }

  stop() {
    this._stopped = true;
    for (const [, info] of this.timers) {
      if (info.timer) clearTimeout(info.timer);
    }
    this.timers.clear();
  }

  get activeCount() {
    return this.timers.size;
  }
}

module.exports = TransitionScheduler;
