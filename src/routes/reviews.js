const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");

const router = Router();

// POST /reviews — Create review (referenciado: userId + restaurantId + orderId)
// Rubrica: CRUD Creación referenciado, validación de orden entregada
router.post("/", async (req, res) => {
  try {
    const db = getDb();
    const { userId, orderId, restaurantId, rating, title, comment, tags } =
      req.body;

    // Validate order exists, belongs to user, and is delivered
    const order = await db.collection("orders").findOne({
      _id: new ObjectId(orderId),
      userId: new ObjectId(userId),
      status: "delivered",
    });

    if (!order) {
      return res.status(400).json({
        error: "Order not found, does not belong to user, or is not delivered",
      });
    }

    // No duplicate review per order
    const existing = await db.collection("reviews").findOne({
      orderId: new ObjectId(orderId),
      userId: new ObjectId(userId),
    });

    if (existing) {
      return res.status(409).json({ error: "Review already submitted for this order" });
    }

    const doc = {
      userId: new ObjectId(userId),
      restaurantId: new ObjectId(restaurantId),
      orderId: new ObjectId(orderId),
      rating: parseInt(rating),
      title: title || "",
      comment: comment || "",
      tags: tags || [],
      restaurantResponse: null,
      helpfulVotes: [],
      createdAt: new Date(),
    };

    const result = await db.collection("reviews").insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /reviews — List reviews with filters + sort + skip + limit
// Rubrica: CRUD Lectura filtros, proyección, sort, skip, limit
router.get("/", async (req, res) => {
  try {
    const db = getDb();
    const {
      restaurantId,
      userId,
      rating,
      tag,
      q,
      skip = 0,
      limit = 20,
    } = req.query;

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
          userId: 1,
          restaurantId: 1,
          orderId: 1,
          rating: 1,
          title: 1,
          comment: 1,
          tags: 1,
          restaurantResponse: 1,
          createdAt: 1,
        },
      })
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /reviews/:id — Get single review
router.get("/:id", async (req, res) => {
  try {
    const db = getDb();
    const review = await db
      .collection("reviews")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!review) return res.status(404).json({ error: "Review not found" });
    res.json(review);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /reviews/:id/response — Restaurant responds (embedded 1:1 restaurantResponse)
// Rubrica: Manejo documentos embebidos 1:1
router.patch("/:id/response", async (req, res) => {
  try {
    const db = getDb();
    const { message } = req.body;

    const result = await db.collection("reviews").updateOne(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          restaurantResponse: {
            message,
            respondedAt: new Date(),
          },
        },
      }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Review not found" });
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /reviews/:id/tag — Add tag without duplicates ($addToSet)
// Rubrica: Arrays $addToSet
router.patch("/:id/tag", async (req, res) => {
  try {
    const db = getDb();
    const { tag } = req.body;

    const result = await db.collection("reviews").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $addToSet: { tags: tag } }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Review not found" });
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /reviews/:id/helpful — Add helpful vote ($addToSet)
router.patch("/:id/helpful", async (req, res) => {
  try {
    const db = getDb();
    const { voterId } = req.body;

    const result = await db.collection("reviews").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $addToSet: { helpfulVotes: new ObjectId(voterId) } }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Review not found" });
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /reviews/:id — deleteOne
// Rubrica: CRUD Eliminación 1 doc
router.delete("/:id", async (req, res) => {
  try {
    const db = getDb();
    const result = await db
      .collection("reviews")
      .deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0)
      return res.status(404).json({ error: "Review not found" });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /reviews — deleteMany by restaurantId or userId
// Rubrica: CRUD Eliminación varios docs
router.delete("/", async (req, res) => {
  try {
    const db = getDb();
    const { restaurantId, userId, before } = req.query;

    const filter = {};
    if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);
    if (userId) filter.userId = new ObjectId(userId);
    if (before) filter.createdAt = { $lt: new Date(before) };

    if (Object.keys(filter).length === 0) {
      return res.status(400).json({ error: "At least one filter required" });
    }

    const result = await db.collection("reviews").deleteMany(filter);
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
