const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../errors/AppError");

const router = Router();

// POST /restaurants — Create restaurant
router.post("/", asyncHandler(async (req, res) => {
  const db = getDb();
  const { name, description, location, address, operatingHours, cuisineTypes, tags } = req.body;

  const doc = {
    name,
    description: description || "",
    location,
    address,
    operatingHours,
    cuisineTypes: cuisineTypes || [],
    tags: tags || [],
    isActive: true,
    isAcceptingOrders: true,
    logoFileId: null,
    menuItemCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection("restaurants").insertOne(doc);
  res.status(201).json({ _id: result.insertedId, ...doc });
}));

// GET /restaurants/search — Geospatial via $geoIntersects on delivery_zones
router.get("/search", asyncHandler(async (req, res) => {
  const db = getDb();
  const { lat, lng, cuisine, skip = 0, limit = 20 } = req.query;

  if (!lat || !lng) throw AppError.badRequest("lat and lng are required");

  const userPoint = { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] };

  const zones = await db
    .collection("delivery_zones")
    .find({ area: { $geoIntersects: { $geometry: userPoint } }, isActive: true })
    .toArray();

  if (zones.length === 0) return res.json({ restaurants: [], total: 0 });

  const restaurantIds = zones.map((z) => z.restaurantId);
  const zoneByRestaurant = {};
  zones.forEach((z) => {
    zoneByRestaurant[z.restaurantId.toString()] = {
      deliveryFee: z.deliveryFee,
      estimatedMinutes: z.estimatedMinutes,
    };
  });

  const restFilter = { _id: { $in: restaurantIds }, isActive: true, isAcceptingOrders: true };
  if (cuisine) restFilter.cuisineTypes = cuisine;

  const restaurants = await db
    .collection("restaurants")
    .find(restFilter, {
      projection: {
        name: 1, description: 1, location: 1, address: 1, cuisineTypes: 1,
        tags: 1, isAcceptingOrders: 1, logoFileId: 1, menuItemCount: 1,
      },
    })
    .sort({ name: 1 })
    .skip(parseInt(skip))
    .limit(parseInt(limit))
    .toArray();

  const ids = restaurants.map((r) => r._id);
  const stats = await db
    .collection("restaurant_stats")
    .find({ _id: { $in: ids } }, { projection: { avgRating: 1, totalReviews: 1, totalOrders: 1 } })
    .toArray();

  const statsById = {};
  stats.forEach((s) => { statsById[s._id.toString()] = s; });

  const result = restaurants.map((r) => ({
    ...r,
    avgRating: statsById[r._id.toString()]?.avgRating || 0,
    totalReviews: statsById[r._id.toString()]?.totalReviews || 0,
    deliveryFee: zoneByRestaurant[r._id.toString()]?.deliveryFee,
    estimatedMinutes: zoneByRestaurant[r._id.toString()]?.estimatedMinutes,
  }));

  res.json({ restaurants: result, total: result.length });
}));

// GET /restaurants — List with filters + sort + skip + limit
router.get("/", asyncHandler(async (req, res) => {
  const db = getDb();
  const { cuisine, isActive, isAcceptingOrders, skip = 0, limit = 20 } = req.query;

  const filter = {};
  if (cuisine) filter.cuisineTypes = cuisine;
  if (isActive !== undefined) filter.isActive = isActive === "true";
  if (isAcceptingOrders !== undefined) filter.isAcceptingOrders = isAcceptingOrders === "true";

  const restaurants = await db
    .collection("restaurants")
    .find(filter, {
      projection: {
        name: 1, description: 1, address: 1, cuisineTypes: 1, tags: 1,
        isActive: 1, isAcceptingOrders: 1, menuItemCount: 1, logoFileId: 1,
      },
    })
    .sort({ name: 1 })
    .skip(parseInt(skip))
    .limit(parseInt(limit))
    .toArray();

  res.json(restaurants);
}));

// GET /restaurants/:id — Get restaurant with stats
router.get("/:id", asyncHandler(async (req, res) => {
  const db = getDb();
  const _id = new ObjectId(req.params.id);

  const restaurant = await db.collection("restaurants").findOne({ _id });
  if (!restaurant) throw AppError.notFound("Restaurant");

  const stats = await db
    .collection("restaurant_stats")
    .findOne({ _id }, { projection: { avgRating: 1, totalReviews: 1, totalOrders: 1 } });

  res.json({ ...restaurant, stats: stats || {} });
}));

// PATCH /restaurants/:id — Update restaurant
router.patch("/:id", asyncHandler(async (req, res) => {
  const db = getDb();
  const { name, description, operatingHours, cuisineTypes, tags } = req.body;

  const update = { $set: { updatedAt: new Date() } };
  if (name) update.$set.name = name;
  if (description) update.$set.description = description;
  if (operatingHours) update.$set.operatingHours = operatingHours;
  if (cuisineTypes) update.$set.cuisineTypes = cuisineTypes;
  if (tags) update.$set.tags = tags;

  const result = await db
    .collection("restaurants")
    .updateOne({ _id: new ObjectId(req.params.id) }, update);

  if (result.matchedCount === 0) throw AppError.notFound("Restaurant");
  res.json({ updated: result.modifiedCount });
}));

// PATCH /restaurants/:id/status — Toggle isAcceptingOrders
router.patch("/:id/status", asyncHandler(async (req, res) => {
  const db = getDb();
  const { isAcceptingOrders, isActive } = req.body;

  const update = { $set: { updatedAt: new Date() } };
  if (isAcceptingOrders !== undefined) update.$set.isAcceptingOrders = isAcceptingOrders;
  if (isActive !== undefined) update.$set.isActive = isActive;

  const result = await db
    .collection("restaurants")
    .updateOne({ _id: new ObjectId(req.params.id) }, update);

  if (result.matchedCount === 0) throw AppError.notFound("Restaurant");
  res.json({ updated: result.modifiedCount });
}));

// DELETE /restaurants/:id — deleteOne
router.delete("/:id", asyncHandler(async (req, res) => {
  const db = getDb();
  const result = await db
    .collection("restaurants")
    .deleteOne({ _id: new ObjectId(req.params.id) });
  if (result.deletedCount === 0) throw AppError.notFound("Restaurant");
  res.json({ deleted: result.deletedCount });
}));

// GET /restaurants/:id/menu-categories — distinct categories
router.get("/:id/menu-categories", asyncHandler(async (req, res) => {
  const db = getDb();
  const categories = await db
    .collection("menu_items")
    .distinct("category", { restaurantId: new ObjectId(req.params.id), available: true });
  res.json(categories);
}));

// POST /restaurants/many — insertMany
router.post("/many", asyncHandler(async (req, res) => {
  const db = getDb();
  const { restaurants } = req.body;
  if (!Array.isArray(restaurants) || restaurants.length === 0) {
    throw AppError.badRequest("restaurants array required");
  }

  const docs = restaurants.map((r) => ({
    ...r,
    isActive: true,
    isAcceptingOrders: true,
    logoFileId: null,
    menuItemCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const result = await db.collection("restaurants").insertMany(docs);
  res.status(201).json({ insertedCount: result.insertedCount });
}));

module.exports = router;
