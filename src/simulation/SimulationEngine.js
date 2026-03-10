const EventEmitter = require("events");
const OrderGenerator = require("./OrderGenerator");
const TransitionScheduler = require("./TransitionScheduler");
const MetricsCollector = require("./MetricsCollector");

const VALID_DURATIONS = [1, 5, 10, 15];
const METRICS_PUSH_INTERVAL_MS = 2000;

class SimulationEngine extends EventEmitter {
  constructor() {
    super();
    this.state = "idle";
    this.config = null;
    this.metrics = new MetricsCollector();
    this.generator = null;
    this.scheduler = null;

    this._durationTimer = null;
    this._metricsInterval = null;
    this._startedAt = null;
    this._pausedAt = null;
    this._totalPausedMs = 0;
    this._elapsedBeforePause = 0;
  }

  async start({ durationMinutes = 1, ordersPerMinute = 10, peakMultiplier = 3, speedMultiplier = 1 } = {}) {
    if (this.state !== "idle" && this.state !== "stopped") {
      throw new Error(`Cannot start: engine is ${this.state}`);
    }

    if (!VALID_DURATIONS.includes(durationMinutes)) {
      throw new Error(`durationMinutes must be one of: ${VALID_DURATIONS.join(", ")}`);
    }

    this.config = { durationMinutes, ordersPerMinute, peakMultiplier, speedMultiplier };

    this.metrics = new MetricsCollector();
    this.metrics.start();

    this.generator = new OrderGenerator({
      onOrderCreated: (order) => this._handleOrderCreated(order),
    });

    this.scheduler = new TransitionScheduler({
      onTransition: (from, to, order) => this._handleTransition(from, to, order),
      speedMultiplier,
    });

    this.state = "running";
    this._startedAt = Date.now();
    this._totalPausedMs = 0;

    await this.generator.loadSeedData();

    const stratifiedOrders = await this.generator.runStratifiedSweep();
    for (const order of stratifiedOrders) {
      this._handleOrderCreated(order);
    }

    this.generator.startPoissonProcess({
      baseRate: ordersPerMinute,
      peakMultiplier,
    });

    const totalMs = durationMinutes * 60 * 1000;
    this._durationTimer = setTimeout(() => this._finish(), totalMs);

    this._metricsInterval = setInterval(() => {
      if (this.state === "running") {
        const snapshot = this.metrics.snapshot();
        const st = this.status();
        this.emit("metrics:update", {
          ...snapshot,
          elapsed: st.elapsed,
          remaining: st.remaining,
        });
      }
    }, METRICS_PUSH_INTERVAL_MS);

    this.emit("simulation:started", this.config);
    return this.status();
  }

  pause() {
    if (this.state !== "running") {
      throw new Error(`Cannot pause: engine is ${this.state}`);
    }

    this.state = "paused";
    this._pausedAt = Date.now();

    if (this._durationTimer) {
      clearTimeout(this._durationTimer);
      this._durationTimer = null;
    }

    this._elapsedBeforePause = this._activeElapsedMs();
    this.generator.pause();
    this.scheduler.pause();

    this.emit("simulation:paused");
    return this.status();
  }

  resume() {
    if (this.state !== "paused") {
      throw new Error(`Cannot resume: engine is ${this.state}`);
    }

    const pausedDuration = Date.now() - this._pausedAt;
    this._totalPausedMs += pausedDuration;

    this.state = "running";
    this._pausedAt = null;

    const remainingMs = (this.config.durationMinutes * 60 * 1000) - this._elapsedBeforePause;

    if (remainingMs > 0) {
      this._durationTimer = setTimeout(() => this._finish(), remainingMs);
    } else {
      this._finish();
      return this.status();
    }

    this.generator.resume({
      baseRate: this.config.ordersPerMinute,
      peakMultiplier: this.config.peakMultiplier,
    });
    this.scheduler.resume();

    this.emit("simulation:resumed");
    return this.status();
  }

  stop() {
    if (this.state === "idle" || this.state === "stopped") {
      throw new Error(`Cannot stop: engine is ${this.state}`);
    }

    this._cleanup();
    this.state = "stopped";
    this.emit("simulation:complete", this.metrics.snapshot());
    return this.status();
  }

  status() {
    const elapsedMs = this._activeElapsedMs();
    const totalMs = this.config ? this.config.durationMinutes * 60 * 1000 : 0;
    const remainingMs = Math.max(0, totalMs - elapsedMs);

    return {
      state: this.state,
      config: this.config,
      elapsed: {
        ms: elapsedMs,
        seconds: Math.round(elapsedMs / 1000),
        formatted: this._formatDuration(elapsedMs),
      },
      remaining: {
        ms: remainingMs,
        seconds: Math.round(remainingMs / 1000),
        formatted: this._formatDuration(remainingMs),
      },
      orders: {
        totalCreated: this.metrics.totalCreated,
        inFlight: this.scheduler ? this.scheduler.activeCount : 0,
        completed: this.metrics.totalCompleted,
        cancelled: this.metrics.totalCancelled,
      },
    };
  }

  getMetrics() {
    return this.metrics.snapshot();
  }

  _handleOrderCreated(order) {
    this.metrics.recordOrderCreated(order);
    this.emit("order:created", {
      orderId: order._id,
      restaurant: order.restaurantId,
      zone: order.deliveryAddress?.zone,
      total: order.total,
      paymentMethod: order.paymentMethod,
    });

    if (this.scheduler && !this.scheduler._stopped) {
      this.scheduler.scheduleOrder(order);
    }
  }

  _handleTransition(fromStatus, toStatus, order) {
    this.metrics.recordTransition(fromStatus, toStatus, order);
    this.emit("order:transitioned", {
      orderId: order._id,
      from: fromStatus,
      to: toStatus,
      restaurant: order.restaurantId,
    });
  }

  _finish() {
    this._cleanup();
    this.state = "stopped";
    this.emit("simulation:complete", this.metrics.snapshot());
  }

  _cleanup() {
    if (this._durationTimer) {
      clearTimeout(this._durationTimer);
      this._durationTimer = null;
    }
    if (this._metricsInterval) {
      clearInterval(this._metricsInterval);
      this._metricsInterval = null;
    }
    if (this.generator) this.generator.stop();
    if (this.scheduler) this.scheduler.stop();
  }

  _activeElapsedMs() {
    if (!this._startedAt) return 0;

    if (this.state === "paused") {
      return this._elapsedBeforePause;
    }

    return Date.now() - this._startedAt - this._totalPausedMs;
  }

  _formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}m ${sec}s`;
  }
}

module.exports = SimulationEngine;
