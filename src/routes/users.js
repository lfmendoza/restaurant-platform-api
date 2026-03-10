const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../errors/AppError");

const router = Router();

// POST /users — Create user (referenciado)
router.post("/", asyncHandler(async (req, res) => {
  const db = getDb();
  const { email, name, phone, role, defaultAddress } = req.body;

  const doc = {
    email,
    name,
    phone: phone || null,
    role: role || "customer",
    defaultAddress: defaultAddress || null,
    orderHistory: [],
    favoriteRestaurants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    const result = await db.collection("users").insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (err) {
    if (err.code === 11000) throw AppError.conflict("Email already registered");
    throw err;
  }
}));

// GET /users — List users with filters + projection + sort + skip + limit
router.get("/", asyncHandler(async (req, res) => {
  const db = getDb();
  const { role, skip = 0, limit = 20 } = req.query;

  const filter = {};
  if (role) filter.role = role;

  const users = await db
    .collection("users")
    .find(filter, {
      projection: { email: 1, name: 1, phone: 1, role: 1, createdAt: 1 },
    })
    .sort({ createdAt: -1 })
    .skip(parseInt(skip))
    .limit(parseInt(limit))
    .toArray();

  res.json(users);
}));

// GET /users/:id — Get single user with projection
router.get("/:id", asyncHandler(async (req, res) => {
  const db = getDb();
  const user = await db.collection("users").findOne(
    { _id: new ObjectId(req.params.id) },
    {
      projection: {
        email: 1, name: 1, phone: 1, role: 1, defaultAddress: 1,
        orderHistory: { $slice: -10 }, favoriteRestaurants: 1, createdAt: 1,
      },
    }
  );
  if (!user) throw AppError.notFound("User");
  res.json(user);
}));

// PATCH /users/:id — Update user profile (updateOne)
router.patch("/:id", asyncHandler(async (req, res) => {
  const db = getDb();
  const { name, phone, defaultAddress } = req.body;

  const update = { $set: { updatedAt: new Date() } };
  if (name) update.$set.name = name;
  if (phone) update.$set.phone = phone;
  if (defaultAddress) update.$set.defaultAddress = defaultAddress;

  const result = await db
    .collection("users")
    .updateOne({ _id: new ObjectId(req.params.id) }, update);

  if (result.matchedCount === 0) throw AppError.notFound("User");
  res.json({ updated: result.modifiedCount });
}));

// PATCH /users/:id/favorites — $push with $each/$slice (Subset Pattern)
router.patch("/:id/favorites", asyncHandler(async (req, res) => {
  const db = getDb();
  const { restaurantId } = req.body;

  const result = await db.collection("users").updateOne(
    { _id: new ObjectId(req.params.id) },
    {
      $push: {
        favoriteRestaurants: {
          $each: [new ObjectId(restaurantId)],
          $slice: -20,
        },
      },
      $set: { updatedAt: new Date() },
    }
  );

  if (result.matchedCount === 0) throw AppError.notFound("User");
  res.json({ updated: result.modifiedCount });
}));

// DELETE /users/:id — deleteOne
router.delete("/:id", asyncHandler(async (req, res) => {
  const db = getDb();
  const result = await db
    .collection("users")
    .deleteOne({ _id: new ObjectId(req.params.id) });
  if (result.deletedCount === 0) throw AppError.notFound("User");
  res.json({ deleted: result.deletedCount });
}));

module.exports = router;
