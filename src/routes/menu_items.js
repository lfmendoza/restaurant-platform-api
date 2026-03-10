const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const MenuItemCommands = require("../commands/MenuItemCommands");
const MenuItemQueries = require("../queries/MenuItemQueries");

const router = Router();

router.post("/", asyncHandler(async (req, res) => {
  const item = await MenuItemCommands.create(req.body);
  res.status(201).json(item);
}));

router.post("/many", asyncHandler(async (req, res) => {
  const result = await MenuItemCommands.createMany(req.body.restaurantId, req.body.items);
  res.status(201).json(result);
}));

router.post("/bulk", asyncHandler(async (req, res) => {
  const result = await MenuItemCommands.bulkWrite(req.body.operations);
  res.json(result);
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const result = await MenuItemCommands.update(req.params.id, req.body);
  res.json(result);
}));

router.patch("/:id/availability", asyncHandler(async (req, res) => {
  const result = await MenuItemCommands.toggleAvailability(req.params.id, req.body.available);
  res.json(result);
}));

router.patch("/restaurant/:restaurantId/category-price", asyncHandler(async (req, res) => {
  const result = await MenuItemCommands.updateCategoryPrice(req.params.restaurantId, req.body);
  res.json(result);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await MenuItemCommands.delete(req.params.id);
  res.json(result);
}));

router.delete("/", asyncHandler(async (req, res) => {
  const result = await MenuItemCommands.deleteMany(req.query);
  res.json(result);
}));

router.get("/", asyncHandler(async (req, res) => {
  const items = await MenuItemQueries.list(req.query);
  res.json(items);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const item = await MenuItemQueries.getById(req.params.id);
  res.json(item);
}));

module.exports = router;
