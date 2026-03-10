const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../errors/AppError");
const ReviewService = require("../services/ReviewService");

const router = Router();

// POST /reviews — Create review (delegated to ReviewService for business validation)
router.post("/", asyncHandler(async (req, res) => {
  const review = await ReviewService.create(req.body);
  res.status(201).json(review);
}));

// GET /reviews — List with filters + sort + skip + limit
router.get("/", asyncHandler(async (req, res) => {
  const db = getDb();
  const { restaurantId, userId, rating, tag, q, skip = 0, limit = 20 } = req.query;

  const filter = {};
  if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);
  if (userId) filter.userId = new ObjectId(userId);
  if (rating) filter.rating = parseInt(rating);
  if (tag) filter.tags = tag;
  if (q) filter.$text = { $search: q };

  const reviews = await db
    .collection("reviews")
    .find(filter, {
      projection: {
        userId: 1, restaurantId: 1, orderId: 1, rating: 1, title: 1,
        comment: 1, tags: 1, restaurantResponse: 1, createdAt: 1,
      },
    })
    .sort({ createdAt: -1 })
    .skip(parseInt(skip))
    .limit(parseInt(limit))
    .toArray();

  res.json(reviews);
}));

// GET /reviews/:id — Get single review
router.get("/:id", asyncHandler(async (req, res) => {
  const db = getDb();
  const review = await db.collection("reviews").findOne({ _id: new ObjectId(req.params.id) });
  if (!review) throw AppError.notFound("Review");
  res.json(review);
}));

// PATCH /reviews/:id/response — Restaurant responds (embedded 1:1)
router.patch("/:id/response", asyncHandler(async (req, res) => {
  const db = getDb();
  const { message } = req.body;

  const result = await db.collection("reviews").updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { restaurantResponse: { message, respondedAt: new Date() } } }
  );

  if (result.matchedCount === 0) throw AppError.notFound("Review");
  res.json({ updated: result.modifiedCount });
}));

// PATCH /reviews/:id/tag — $addToSet
router.patch("/:id/tag", asyncHandler(async (req, res) => {
  const db = getDb();
  const { tag } = req.body;

  const result = await db.collection("reviews").updateOne(
    { _id: new ObjectId(req.params.id) },
    { $addToSet: { tags: tag } }
  );

  if (result.matchedCount === 0) throw AppError.notFound("Review");
  res.json({ updated: result.modifiedCount });
}));

// PATCH /reviews/:id/helpful — $addToSet
router.patch("/:id/helpful", asyncHandler(async (req, res) => {
  const db = getDb();
  const { voterId } = req.body;

  const result = await db.collection("reviews").updateOne(
    { _id: new ObjectId(req.params.id) },
    { $addToSet: { helpfulVotes: new ObjectId(voterId) } }
  );

  if (result.matchedCount === 0) throw AppError.notFound("Review");
  res.json({ updated: result.modifiedCount });
}));

// DELETE /reviews/:id — deleteOne
router.delete("/:id", asyncHandler(async (req, res) => {
  const db = getDb();
  const result = await db.collection("reviews").deleteOne({ _id: new ObjectId(req.params.id) });
  if (result.deletedCount === 0) throw AppError.notFound("Review");
  res.json({ deleted: result.deletedCount });
}));

// DELETE /reviews — deleteMany
router.delete("/", asyncHandler(async (req, res) => {
  const db = getDb();
  const { restaurantId, userId, before } = req.query;

  const filter = {};
  if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);
  if (userId) filter.userId = new ObjectId(userId);
  if (before) filter.createdAt = { $lt: new Date(before) };

  if (Object.keys(filter).length === 0) {
    throw AppError.badRequest("At least one filter required");
  }

  const result = await db.collection("reviews").deleteMany(filter);
  res.json({ deleted: result.deletedCount });
}));

module.exports = router;
