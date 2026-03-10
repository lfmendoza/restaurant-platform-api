const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../errors/AppError");
const OrderService = require("../services/OrderService");
const OrderStateMachine = require("../services/OrderStateMachine");

const router = Router();

// POST /orders — Create order with multi-doc transaction
router.post("/", asyncHandler(async (req, res) => {
  const { userId, cartId, deliveryAddress, paymentMethod } = req.body;
  const order = await OrderService.checkout(userId, cartId, deliveryAddress, paymentMethod);
  res.status(201).json(order);
}));

// GET /orders — List orders with $lookup users + restaurants
router.get("/", asyncHandler(async (req, res) => {
  const db = getDb();
  const { restaurantId, userId, status, skip = 0, limit = 20 } = req.query;

  const match = {};
  if (restaurantId) match.restaurantId = new ObjectId(restaurantId);
  if (userId) match.userId = new ObjectId(userId);
  if (status) match.status = status;

  const orders = await db
    .collection("orders")
    .aggregate([
      { $match: match },
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
      { $lookup: { from: "restaurants", localField: "restaurantId", foreignField: "_id", as: "restaurant" } },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$restaurant", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          orderNumber: 1, status: 1, total: 1, paymentMethod: 1, items: 1,
          deliveryAddress: 1, estimatedDelivery: 1, statusHistory: 1,
          createdAt: 1, updatedAt: 1,
          "user.name": 1, "user.phone": 1, "user.email": 1,
          "restaurant.name": 1, "restaurant.address": 1,
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: parseInt(skip) },
      { $limit: parseInt(limit) },
    ])
    .toArray();

  res.json(orders);
}));

// GET /orders/:id — Get single order
router.get("/:id", asyncHandler(async (req, res) => {
  const db = getDb();
  const order = await db.collection("orders").findOne({ _id: new ObjectId(req.params.id) });
  if (!order) throw AppError.notFound("Order");
  res.json(order);
}));

// PATCH /orders/:id/status — FSM state transition (delegated to OrderStateMachine)
router.patch("/:id/status", asyncHandler(async (req, res) => {
  const db = getDb();
  const { status: newStatus, actor = "system", reason } = req.body;

  const order = await db.collection("orders").findOne({ _id: new ObjectId(req.params.id) });
  if (!order) throw AppError.notFound("Order");

  const update = OrderStateMachine.buildTransition(order, newStatus, actor, reason);

  await db.collection("orders").updateOne({ _id: new ObjectId(req.params.id) }, update);
  res.json({ status: newStatus, transition: `${order.status} → ${newStatus}` });
}));

// DELETE /orders/cancelled — deleteMany cancelled orders
router.delete("/cancelled", asyncHandler(async (req, res) => {
  const db = getDb();
  const { before } = req.query;

  const filter = { status: "cancelled" };
  if (before) filter.createdAt = { $lt: new Date(before) };

  const result = await db.collection("orders").deleteMany(filter);
  res.json({ deleted: result.deletedCount });
}));

// DELETE /orders/:id — deleteOne
router.delete("/:id", asyncHandler(async (req, res) => {
  const db = getDb();
  const result = await db.collection("orders").deleteOne({ _id: new ObjectId(req.params.id) });
  if (result.deletedCount === 0) throw AppError.notFound("Order");
  res.json({ deleted: result.deletedCount });
}));

module.exports = router;
