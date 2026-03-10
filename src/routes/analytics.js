const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../errors/AppError");
const { runDailyRevenue, runWeeklyReconciliation } = require("../jobs/batch");

const router = Router();

// ─── Agregaciones Simples ────────────────────────────────────────────────────

router.get("/count", asyncHandler(async (req, res) => {
  const db = getDb();
  const { collection, restaurantId, status } = req.query;

  if (!collection) throw AppError.badRequest("collection required");

  const filter = {};
  if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);
  if (status) filter.status = status;

  const count = await db.collection(collection).countDocuments(filter);
  res.json({ collection, filter, count });
}));

router.get("/distinct", asyncHandler(async (req, res) => {
  const db = getDb();
  const { collection, field, restaurantId } = req.query;

  if (!collection || !field) throw AppError.badRequest("collection and field required");

  const filter = {};
  if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);

  const values = await db.collection(collection).distinct(field, filter);
  res.json({ collection, field, values });
}));

// ─── Agregaciones Complejas ───────────────────────────────────────────────────

router.get("/top-restaurants", asyncHandler(async (req, res) => {
  const db = getDb();
  const { minReviews = 1, limit = 10 } = req.query;

  const results = await db
    .collection("reviews")
    .aggregate([
      { $group: { _id: "$restaurantId", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
      { $match: { count: { $gte: parseInt(minReviews) } } },
      { $sort: { avgRating: -1 } },
      { $limit: parseInt(limit) },
      { $lookup: { from: "restaurants", localField: "_id", foreignField: "_id", as: "restaurant" } },
      { $unwind: "$restaurant" },
      {
        $project: {
          "restaurant.name": 1, "restaurant.cuisineTypes": 1, "restaurant.address": 1,
          avgRating: { $round: ["$avgRating", 1] }, reviewCount: "$count",
        },
      },
    ])
    .toArray();

  res.json(results);
}));

router.get("/best-selling-items", asyncHandler(async (req, res) => {
  const db = getDb();
  const { restaurantId, limit = 20 } = req.query;

  const matchStage = { status: "delivered" };
  if (restaurantId) matchStage.restaurantId = new ObjectId(restaurantId);

  const results = await db
    .collection("orders")
    .aggregate([
      { $match: matchStage },
      { $unwind: "$items" },
      { $group: { _id: "$items.menuItemId", name: { $first: "$items.name" }, totalQty: { $sum: "$items.quantity" }, totalRevenue: { $sum: "$items.subtotal" } } },
      { $sort: { totalQty: -1 } },
      { $limit: parseInt(limit) },
      { $lookup: { from: "menu_items", localField: "_id", foreignField: "_id", as: "menuItem" } },
      { $unwind: { path: "$menuItem", preserveNullAndEmptyArrays: true } },
      { $project: { name: 1, totalQty: 1, totalRevenue: { $round: ["$totalRevenue", 2] }, category: "$menuItem.category", price: "$menuItem.price" } },
    ])
    .toArray();

  res.json(results);
}));

router.get("/revenue-by-month", asyncHandler(async (req, res) => {
  const db = getDb();
  const { restaurantId } = req.query;

  const matchStage = { status: "delivered" };
  if (restaurantId) matchStage.restaurantId = new ObjectId(restaurantId);

  const results = await db
    .collection("orders")
    .aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { restaurantId: "$restaurantId", year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          totalRevenue: { $sum: "$total" }, orderCount: { $sum: 1 }, avgOrderValue: { $avg: "$total" },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $lookup: { from: "restaurants", localField: "_id.restaurantId", foreignField: "_id", as: "restaurant" } },
      { $unwind: { path: "$restaurant", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          restaurantName: { $ifNull: ["$restaurant.name", "Unknown"] },
          year: "$_id.year", month: "$_id.month",
          totalRevenue: { $round: ["$totalRevenue", 2] }, orderCount: 1,
          avgOrderValue: { $round: ["$avgOrderValue", 2] },
        },
      },
    ])
    .toArray();

  res.json(results);
}));

router.get("/rating-distribution/:restaurantId", asyncHandler(async (req, res) => {
  const db = getDb();

  const results = await db
    .collection("reviews")
    .aggregate([
      { $match: { restaurantId: new ObjectId(req.params.restaurantId) } },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $group: { _id: null, distribution: { $push: { rating: "$_id", count: "$count" } }, total: { $sum: "$count" }, avgRating: { $avg: { $multiply: ["$_id", "$count"] } } } },
      { $project: { _id: 0, distribution: 1, total: 1 } },
    ])
    .toArray();

  res.json(results[0] || { distribution: [], total: 0 });
}));

router.get("/order-velocity/:restaurantId", asyncHandler(async (req, res) => {
  const db = getDb();
  const { hoursBack = 1 } = req.query;
  const since = new Date(Date.now() - parseInt(hoursBack) * 3600000);

  const results = await db
    .collection("order_events")
    .aggregate([
      { $match: { "metadata.restaurantId": new ObjectId(req.params.restaurantId), toStatus: "pending", timestamp: { $gte: since } } },
      { $group: { _id: { $dateTrunc: { date: "$timestamp", unit: "minute", binSize: 5 } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { window: "$_id", count: 1, _id: 0 } },
    ])
    .toArray();

  res.json(results);
}));

router.get("/avg-transition-time/:restaurantId", asyncHandler(async (req, res) => {
  const db = getDb();

  const results = await db
    .collection("order_events")
    .aggregate([
      { $match: { "metadata.restaurantId": new ObjectId(req.params.restaurantId), eventType: "status_change" } },
      { $group: { _id: { from: "$fromStatus", to: "$toStatus" }, avgDurationSec: { $avg: "$durationFromPrevSec" }, count: { $sum: 1 } } },
      { $sort: { avgDurationSec: -1 } },
      { $project: { _id: 0, from: "$_id.from", to: "$_id.to", avgDurationSec: { $round: ["$avgDurationSec", 0] }, count: 1 } },
    ])
    .toArray();

  res.json(results);
}));

// ─── Array Aggregations ─────────────────────────────────────────────────────

router.get("/tags", asyncHandler(async (req, res) => {
  const db = getDb();
  const { limit = 15 } = req.query;

  const results = await db
    .collection("reviews")
    .aggregate([
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: parseInt(limit) },
      { $project: { tag: "$_id", count: 1, _id: 0 } },
    ])
    .toArray();

  res.json(results);
}));

router.get("/allergens", asyncHandler(async (req, res) => {
  const db = getDb();

  const results = await db
    .collection("menu_items")
    .aggregate([
      { $unwind: "$allergens" },
      { $group: { _id: "$allergens", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { allergen: "$_id", count: 1, _id: 0 } },
    ])
    .toArray();

  res.json(results);
}));

router.get("/revenue-by-category", asyncHandler(async (req, res) => {
  const db = getDb();
  const { restaurantId } = req.query;

  const matchStage = { status: "delivered" };
  if (restaurantId) matchStage.restaurantId = new ObjectId(restaurantId);

  const results = await db
    .collection("orders")
    .aggregate([
      { $match: matchStage },
      { $unwind: "$items" },
      { $lookup: { from: "menu_items", localField: "items.menuItemId", foreignField: "_id", as: "menuItem" } },
      { $unwind: { path: "$menuItem", preserveNullAndEmptyArrays: true } },
      { $group: { _id: { $ifNull: ["$menuItem.category", "Unknown"] }, totalRevenue: { $sum: "$items.subtotal" }, totalQty: { $sum: "$items.quantity" } } },
      { $sort: { totalRevenue: -1 } },
      { $project: { category: "$_id", totalRevenue: { $round: ["$totalRevenue", 2] }, totalQty: 1, _id: 0 } },
    ])
    .toArray();

  res.json(results);
}));

// ─── OLAP Collections ───────────────────────────────────────────────────────

router.get("/daily-revenue", asyncHandler(async (req, res) => {
  const db = getDb();
  const { restaurantId, days = 30 } = req.query;

  const since = new Date();
  since.setDate(since.getDate() - parseInt(days));
  since.setUTCHours(0, 0, 0, 0);

  const filter = { date: { $gte: since } };
  if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);

  const results = await db
    .collection("daily_revenue")
    .find(filter)
    .sort({ restaurantId: 1, date: -1 })
    .toArray();

  res.json(results);
}));

router.get("/restaurant-stats", asyncHandler(async (req, res) => {
  const db = getDb();
  const { skip = 0, limit = 20 } = req.query;

  const stats = await db
    .collection("restaurant_stats")
    .find({})
    .sort({ avgRating: -1 })
    .skip(parseInt(skip))
    .limit(parseInt(limit))
    .toArray();

  res.json(stats);
}));

// ─── Batch Jobs ─────────────────────────────────────────────────────────────

router.post("/run-batch", asyncHandler(async (req, res) => {
  const { job = "daily", targetDate } = req.body;

  if (job === "daily") {
    const result = await runDailyRevenue(targetDate);
    return res.json({ job: "daily_revenue", ...result });
  }

  if (job === "weekly") {
    const result = await runWeeklyReconciliation();
    return res.json({ job: "weekly_reconciliation", ...result });
  }

  throw AppError.badRequest("job must be 'daily' or 'weekly'");
}));

module.exports = router;
