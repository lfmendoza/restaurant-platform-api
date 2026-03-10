const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../errors/AppError");
const AnalyticsQueries = require("../queries/AnalyticsQueries");
const { runDailyRevenue, runWeeklyReconciliation } = require("../jobs/batch");

const router = Router();

router.get("/dashboard", asyncHandler(async (req, res) => {
  const data = await AnalyticsQueries.dashboard();
  res.json(data);
}));

router.get("/count", asyncHandler(async (req, res) => {
  const result = await AnalyticsQueries.count(req.query);
  res.json(result);
}));

router.get("/distinct", asyncHandler(async (req, res) => {
  const result = await AnalyticsQueries.distinct(req.query);
  res.json(result);
}));

router.get("/top-restaurants", asyncHandler(async (req, res) => {
  const results = await AnalyticsQueries.topRestaurants(req.query);
  res.json(results);
}));

router.get("/best-selling-items", asyncHandler(async (req, res) => {
  const results = await AnalyticsQueries.bestSellingItems(req.query);
  res.json(results);
}));

router.get("/revenue-by-month", asyncHandler(async (req, res) => {
  const results = await AnalyticsQueries.revenueByMonth(req.query);
  res.json(results);
}));

router.get("/rating-distribution/:restaurantId", asyncHandler(async (req, res) => {
  const result = await AnalyticsQueries.ratingDistribution(req.params.restaurantId);
  res.json(result);
}));

router.get("/order-velocity/:restaurantId", asyncHandler(async (req, res) => {
  const results = await AnalyticsQueries.orderVelocity(req.params.restaurantId, req.query);
  res.json(results);
}));

router.get("/avg-transition-time/:restaurantId", asyncHandler(async (req, res) => {
  const results = await AnalyticsQueries.avgTransitionTime(req.params.restaurantId);
  res.json(results);
}));

router.get("/tags", asyncHandler(async (req, res) => {
  const results = await AnalyticsQueries.tags(req.query);
  res.json(results);
}));

router.get("/allergens", asyncHandler(async (req, res) => {
  const results = await AnalyticsQueries.allergens();
  res.json(results);
}));

router.get("/revenue-by-category", asyncHandler(async (req, res) => {
  const results = await AnalyticsQueries.revenueByCategory(req.query);
  res.json(results);
}));

router.get("/daily-revenue", asyncHandler(async (req, res) => {
  const results = await AnalyticsQueries.dailyRevenue(req.query);
  res.json(results);
}));

router.get("/restaurant-stats", asyncHandler(async (req, res) => {
  const stats = await AnalyticsQueries.restaurantStats(req.query);
  res.json(stats);
}));

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
