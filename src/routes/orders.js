const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const OrderCommands = require("../commands/OrderCommands");
const OrderQueries = require("../queries/OrderQueries");

const router = Router();

router.post("/", asyncHandler(async (req, res) => {
  const { userId, cartId, deliveryAddress, paymentMethod } = req.body;
  const order = await OrderCommands.checkout(userId, cartId, deliveryAddress, paymentMethod);
  res.status(201).json(order);
}));

router.patch("/:id/status", asyncHandler(async (req, res) => {
  const { status: newStatus, actor = "system", reason } = req.body;
  const result = await OrderCommands.updateStatus(req.params.id, newStatus, actor, reason);
  res.json(result);
}));

router.delete("/cancelled", asyncHandler(async (req, res) => {
  const result = await OrderCommands.deleteCancelled(req.query);
  res.json(result);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await OrderCommands.delete(req.params.id);
  res.json(result);
}));

router.get("/", asyncHandler(async (req, res) => {
  const orders = await OrderQueries.list(req.query);
  res.json(orders);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const order = await OrderQueries.getById(req.params.id);
  res.json(order);
}));

module.exports = router;
