require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connect, getDb } = require("./db");

const usersRouter = require("./routes/users");
const restaurantsRouter = require("./routes/restaurants");
const menuItemsRouter = require("./routes/menu_items");
const cartsRouter = require("./routes/carts");
const ordersRouter = require("./routes/orders");
const reviewsRouter = require("./routes/reviews");
const filesRouter = require("./routes/files");
const analyticsRouter = require("./routes/analytics");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/users", usersRouter);
app.use("/restaurants", restaurantsRouter);
app.use("/menu-items", menuItemsRouter);
app.use("/carts", cartsRouter);
app.use("/orders", ordersRouter);
app.use("/reviews", reviewsRouter);
app.use("/files", filesRouter);
app.use("/analytics", analyticsRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", db: process.env.DB_NAME || "restaurant_orders" });
});

// ─── Change Stream Processors ────────────────────────────────────────────────

let resumeTokenOrders = null;
let resumeTokenReviews = null;
let resumeTokenMenu = null;

async function startChangeStreams(db) {
  // Processor #1 — orders → order_events + restaurant_stats
  const ordersOptions = {
    fullDocument: "updateLookup",
    ...(resumeTokenOrders && { resumeAfter: resumeTokenOrders }),
  };
  const ordersStream = db.collection("orders").watch(
    [{ $match: { operationType: { $in: ["insert", "update"] } } }],
    ordersOptions
  );

  ordersStream.on("change", async (change) => {
    resumeTokenOrders = change._id;
    const db = getDb();
    const order = change.fullDocument;
    if (!order) return;

    if (change.operationType === "insert") {
      await db.collection("order_events").insertOne({
        timestamp: new Date(),
        metadata: {
          orderId: order._id,
          restaurantId: order.restaurantId,
          userId: order.userId,
        },
        eventType: "created",
        fromStatus: null,
        toStatus: "pending",
        durationFromPrevSec: 0,
        context: { paymentMethod: order.paymentMethod, total: order.total },
      });
      await db.collection("restaurant_stats").updateOne(
        { _id: order.restaurantId },
        {
          $inc: { totalOrders: 1 },
          $set: { lastOrderAt: new Date(), lastUpdated: new Date() },
        },
        { upsert: true }
      );
    }

    if (
      change.operationType === "update" &&
      change.updateDescription?.updatedFields?.status
    ) {
      const newStatus = change.updateDescription.updatedFields.status;
      const history = order.statusHistory || [];
      const last = history[history.length - 1];
      const prev = history[history.length - 2];

      await db.collection("order_events").insertOne({
        timestamp: new Date(),
        metadata: {
          orderId: order._id,
          restaurantId: order.restaurantId,
          userId: order.userId,
        },
        eventType: "status_change",
        fromStatus: prev?.status || null,
        toStatus: newStatus,
        durationFromPrevSec: last?.durationFromPrevSec || 0,
        context: { actor: last?.actor },
      });

      if (newStatus === "delivered") {
        await db.collection("restaurant_stats").updateOne(
          { _id: order.restaurantId },
          {
            $inc: { totalDelivered: 1, totalRevenue: order.total },
            $set: { lastUpdated: new Date() },
          }
        );
      } else if (newStatus === "cancelled") {
        await db.collection("restaurant_stats").updateOne(
          { _id: order.restaurantId },
          { $inc: { totalCancelled: 1 }, $set: { lastUpdated: new Date() } }
        );
      }
    }
  });

  ordersStream.on("error", (err) => {
    console.error("Orders Change Stream error:", err.message);
  });

  // Processor #2 — reviews → restaurant_stats (incremental avg O(1))
  const reviewsOptions = {
    fullDocument: "updateLookup",
    ...(resumeTokenReviews && { resumeAfter: resumeTokenReviews }),
  };
  const reviewsStream = db.collection("reviews").watch(
    [{ $match: { operationType: "insert" } }],
    reviewsOptions
  );

  reviewsStream.on("change", async (change) => {
    resumeTokenReviews = change._id;
    const db = getDb();
    const review = change.fullDocument;
    if (!review) return;

    const stats = await db
      .collection("restaurant_stats")
      .findOne({ _id: review.restaurantId });
    const oldCount = stats?.totalReviews || 0;
    const oldAvg = stats?.avgRating || 0;
    const newAvg = (oldAvg * oldCount + review.rating) / (oldCount + 1);

    await db.collection("restaurant_stats").updateOne(
      { _id: review.restaurantId },
      {
        $inc: {
          totalReviews: 1,
          [`ratingDistribution.${review.rating}`]: 1,
        },
        $set: {
          avgRating: Math.round(newAvg * 10) / 10,
          lastReviewAt: new Date(),
          lastUpdated: new Date(),
        },
      },
      { upsert: true }
    );
  });

  reviewsStream.on("error", (err) => {
    console.error("Reviews Change Stream error:", err.message);
  });

  // Processor #3 — menu_items → restaurants.menuItemCount
  const menuOptions = {
    ...(resumeTokenMenu && { resumeAfter: resumeTokenMenu }),
  };
  const menuStream = db.collection("menu_items").watch(
    [{ $match: { operationType: { $in: ["insert", "delete"] } } }],
    menuOptions
  );

  menuStream.on("change", async (change) => {
    resumeTokenMenu = change._id;
    const db = getDb();

    if (change.operationType === "insert") {
      const restaurantId = change.fullDocument?.restaurantId;
      if (restaurantId) {
        await db
          .collection("restaurants")
          .updateOne({ _id: restaurantId }, { $inc: { menuItemCount: 1 } });
      }
    } else if (change.operationType === "delete") {
      console.log(
        "Menu item deleted — preImage needed for restaurantId tracking"
      );
    }
  });

  menuStream.on("error", (err) => {
    console.error("Menu Change Stream error:", err.message);
  });

  console.log("Change Streams started: orders, reviews, menu_items");
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main() {
  const { db } = await connect();
  await startChangeStreams(db);

  // Setup batch jobs (daily revenue at 02:00 UTC)
  const cron = require("node-cron");
  const { runDailyRevenue, runWeeklyReconciliation } = require("./jobs/batch");

  cron.schedule("0 2 * * *", () => {
    console.log("Running daily revenue batch job...");
    runDailyRevenue().catch(console.error);
  });

  cron.schedule("0 3 * * 0", () => {
    console.log("Running weekly reconciliation batch job...");
    runWeeklyReconciliation().catch(console.error);
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});

module.exports = app;
