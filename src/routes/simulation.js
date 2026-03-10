const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const SimulationEngine = require("../simulation/SimulationEngine");

const router = Router();

let engine = new SimulationEngine();
const sseClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
}

function wireEngineEvents(eng) {
  eng.on("order:created", (data) => broadcastSSE("order:created", data));
  eng.on("order:transitioned", (data) => broadcastSSE("order:transitioned", data));
  eng.on("metrics:update", (data) => broadcastSSE("metrics:update", data));
  eng.on("simulation:complete", (data) => broadcastSSE("simulation:complete", data));
  eng.on("simulation:started", (data) => broadcastSSE("simulation:started", data));
  eng.on("simulation:paused", () => broadcastSSE("simulation:paused", {}));
  eng.on("simulation:resumed", () => broadcastSSE("simulation:resumed", {}));
}

wireEngineEvents(engine);

router.post("/start", asyncHandler(async (req, res) => {
  const {
    durationMinutes = 1,
    ordersPerMinute = 10,
    peakMultiplier = 3,
    speedMultiplier = 1,
  } = req.body;

  if (engine.state === "running" || engine.state === "paused") {
    engine.stop();
  }

  engine = new SimulationEngine();
  wireEngineEvents(engine);

  res.status(202).json({
    state: "starting",
    message: "Simulación iniciando en segundo plano...",
    config: {
      durationMinutes: parseInt(durationMinutes),
      ordersPerMinute: parseFloat(ordersPerMinute),
      peakMultiplier: parseFloat(peakMultiplier),
      speedMultiplier: parseFloat(speedMultiplier),
    },
  });

  engine.start({
    durationMinutes: parseInt(durationMinutes),
    ordersPerMinute: parseFloat(ordersPerMinute),
    peakMultiplier: parseFloat(peakMultiplier),
    speedMultiplier: parseFloat(speedMultiplier),
  }).then((status) => {
    broadcastSSE("simulation:ready", status);
  }).catch((err) => {
    console.error("Simulation start error:", err);
    broadcastSSE("simulation:error", { error: err.message });
  });
}));

router.post("/pause", asyncHandler(async (req, res) => {
  const status = engine.pause();
  res.json(status);
}));

router.post("/resume", asyncHandler(async (req, res) => {
  const status = engine.resume();
  res.json(status);
}));

router.post("/stop", asyncHandler(async (req, res) => {
  const status = engine.stop();
  res.json(status);
}));

router.get("/status", asyncHandler(async (req, res) => {
  res.json(engine.status());
}));

router.get("/metrics", asyncHandler(async (req, res) => {
  res.json(engine.getMetrics());
}));

router.get("/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ state: engine.state })}\n\n`);

  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

module.exports = router;
