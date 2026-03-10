const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../errors/AppError");
const CartService = require("../services/CartService");

const router = Router();

// GET /carts — Get cart for a user
router.get("/", asyncHandler(async (req, res) => {
  const db = getDb();
  const { userId, restaurantId } = req.query;
  if (!userId) throw AppError.badRequest("userId required");

  const filter = { userId: new ObjectId(userId) };
  if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);

  const cart = await db.collection("carts").findOne(filter);
  if (!cart) throw AppError.notFound("Cart");
  res.json(cart);
}));

// POST /carts/items — Add item to cart (upsert + $push + $setOnInsert)
router.post("/items", asyncHandler(async (req, res) => {
  const { userId, menuItemId, quantity } = req.body;
  const cart = await CartService.addItem(userId, menuItemId, quantity);
  res.json(cart);
}));

// PATCH /carts/items/:menuItemId — Update item quantity (positional $ operator)
router.patch("/items/:menuItemId", asyncHandler(async (req, res) => {
  const { userId, quantity } = req.body;
  const cart = await CartService.updateItemQuantity(userId, req.params.menuItemId, quantity);
  res.json(cart);
}));

// DELETE /carts/items/:menuItemId — Remove item from cart ($pull)
router.delete("/items/:menuItemId", asyncHandler(async (req, res) => {
  const { userId } = req.query;
  const removed = await CartService.removeItem(userId, req.params.menuItemId);
  res.json({ removed });
}));

// DELETE /carts — Delete entire cart
router.delete("/", asyncHandler(async (req, res) => {
  const db = getDb();
  const { userId, restaurantId } = req.query;
  if (!userId) throw AppError.badRequest("userId required");

  const filter = { userId: new ObjectId(userId) };
  if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);

  const result = await db.collection("carts").deleteOne(filter);
  res.json({ deleted: result.deletedCount });
}));

module.exports = router;
