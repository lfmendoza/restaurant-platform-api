const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const CartCommands = require("../commands/CartCommands");
const CartQueries = require("../queries/CartQueries");

const router = Router();

router.post("/items", asyncHandler(async (req, res) => {
  const { userId, menuItemId, quantity } = req.body;
  const cart = await CartCommands.addItem(userId, menuItemId, quantity);
  res.json(cart);
}));

router.patch("/items/:menuItemId", asyncHandler(async (req, res) => {
  const { userId, quantity } = req.body;
  const cart = await CartCommands.updateItemQuantity(userId, req.params.menuItemId, quantity);
  res.json(cart);
}));

router.delete("/items/:menuItemId", asyncHandler(async (req, res) => {
  const { userId } = req.query;
  const removed = await CartCommands.removeItem(userId, req.params.menuItemId);
  res.json({ removed });
}));

router.delete("/", asyncHandler(async (req, res) => {
  const result = await CartCommands.deleteCart(req.query);
  res.json(result);
}));

router.get("/", asyncHandler(async (req, res) => {
  const cart = await CartQueries.getByUser(req.query);
  res.json(cart);
}));

module.exports = router;
