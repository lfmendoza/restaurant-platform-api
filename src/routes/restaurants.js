const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const RestaurantCommands = require("../commands/RestaurantCommands");
const RestaurantQueries = require("../queries/RestaurantQueries");

const router = Router();

router.post("/", asyncHandler(async (req, res) => {
  const restaurant = await RestaurantCommands.create(req.body);
  res.status(201).json(restaurant);
}));

router.post("/many", asyncHandler(async (req, res) => {
  const result = await RestaurantCommands.createMany(req.body.restaurants);
  res.status(201).json(result);
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const result = await RestaurantCommands.update(req.params.id, req.body);
  res.json(result);
}));

router.patch("/:id/status", asyncHandler(async (req, res) => {
  const result = await RestaurantCommands.toggleStatus(req.params.id, req.body);
  res.json(result);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await RestaurantCommands.delete(req.params.id);
  res.json(result);
}));

router.post("/fix-delivery-zones", asyncHandler(async (req, res) => {
  const result = await RestaurantCommands.fixMissingDeliveryZones();
  res.json(result);
}));

router.post("/redistribute", asyncHandler(async (req, res) => {
  const result = await RestaurantCommands.redistribute();
  res.json(result);
}));

router.get("/search", asyncHandler(async (req, res) => {
  const result = await RestaurantQueries.search(req.query);
  res.json(result);
}));

router.get("/", asyncHandler(async (req, res) => {
  const restaurants = await RestaurantQueries.list(req.query);
  res.json(restaurants);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const restaurant = await RestaurantQueries.getById(req.params.id);
  res.json(restaurant);
}));

router.get("/:id/menu-categories", asyncHandler(async (req, res) => {
  const categories = await RestaurantQueries.menuCategories(req.params.id);
  res.json(categories);
}));

router.get("/:id/delivery-zones", asyncHandler(async (req, res) => {
  const zones = await RestaurantQueries.deliveryZones(req.params.id);
  res.json(zones);
}));

router.post("/delivery-zones/batch", asyncHandler(async (req, res) => {
  const { restaurantIds } = req.body;
  if (!Array.isArray(restaurantIds)) return res.json([]);
  const zones = await RestaurantQueries.deliveryZonesBatch(restaurantIds);
  res.json(zones);
}));

module.exports = router;
