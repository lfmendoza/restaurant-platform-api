const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");

const router = Router();

// POST /restaurants — Create restaurant (referenciado, documento independiente)
router.post("/", async (req, res) => {
  try {
    const db = getDb();
    const {
      name,
      description,
      location,
      address,
      operatingHours,
      cuisineTypes,
      tags,
    } = req.body;

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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /restaurants/search — Geospatial search: $geoIntersects delivery zones + stats
// Rubrica: CRUD Lectura filtros, geoespacial, lookup, proyeccion, sort, skip, limit
router.get("/search", async (req, res) => {
  try {
    const db = getDb();
    const {
      lat,
      lng,
      cuisine,
      skip = 0,
      limit = 20,
    } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: "lat and lng are required" });
    }

    const userPoint = {
      type: "Point",
      coordinates: [parseFloat(lng), parseFloat(lat)],
    };

    // 1. Find delivery zones that cover the user's point
    const zoneFilter = {
      area: { $geoIntersects: { $geometry: userPoint } },
      isActive: true,
    };
    const zones = await db
      .collection("delivery_zones")
      .find(zoneFilter)
      .toArray();

    if (zones.length === 0) {
      return res.json({ restaurants: [], total: 0 });
    }

    const restaurantIds = zones.map((z) => z.restaurantId);
    const zoneByRestaurant = {};
    zones.forEach((z) => {
      zoneByRestaurant[z.restaurantId.toString()] = {
        deliveryFee: z.deliveryFee,
        estimatedMinutes: z.estimatedMinutes,
      };
    });

    // 2. Filter active restaurants by ID and optional cuisine
    const restFilter = {
      _id: { $in: restaurantIds },
      isActive: true,
      isAcceptingOrders: true,
    };
    if (cuisine) restFilter.cuisineTypes = cuisine;

    const restaurants = await db
      .collection("restaurants")
      .find(restFilter, {
        projection: {
          name: 1,
          description: 1,
          location: 1,
          address: 1,
          cuisineTypes: 1,
          tags: 1,
          isAcceptingOrders: 1,
          logoFileId: 1,
          menuItemCount: 1,
        },
      })
      .sort({ name: 1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    // 3. Enrich with pre-computed stats (no $lookup at query time — CQRS)
    const ids = restaurants.map((r) => r._id);
    const stats = await db
      .collection("restaurant_stats")
      .find(
        { _id: { $in: ids } },
        { projection: { avgRating: 1, totalReviews: 1, totalOrders: 1 } }
      )
      .toArray();

    const statsById = {};
    stats.forEach((s) => {
      statsById[s._id.toString()] = s;
    });

    const result = restaurants.map((r) => ({
      ...r,
      avgRating: statsById[r._id.toString()]?.avgRating || 0,
      totalReviews: statsById[r._id.toString()]?.totalReviews || 0,
      deliveryFee: zoneByRestaurant[r._id.toString()]?.deliveryFee,
      estimatedMinutes: zoneByRestaurant[r._id.toString()]?.estimatedMinutes,
    }));

    res.json({ restaurants: result, total: result.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /restaurants — List all with filters + sort + skip + limit
router.get("/", async (req, res) => {
  try {
    const db = getDb();
    const {
      cuisine,
      isActive,
      isAcceptingOrders,
      skip = 0,
      limit = 20,
    } = req.query;

    const filter = {};
    if (cuisine) filter.cuisineTypes = cuisine;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (isAcceptingOrders !== undefined)
      filter.isAcceptingOrders = isAcceptingOrders === "true";

    const restaurants = await db
      .collection("restaurants")
      .find(filter, {
        projection: {
          name: 1,
          description: 1,
          address: 1,
          cuisineTypes: 1,
          tags: 1,
          isActive: 1,
          isAcceptingOrders: 1,
          menuItemCount: 1,
          logoFileId: 1,
        },
      })
      .sort({ name: 1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    res.json(restaurants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /restaurants/:id — Get restaurant with stats
router.get("/:id", async (req, res) => {
  try {
    const db = getDb();
    const _id = new ObjectId(req.params.id);

    const restaurant = await db.collection("restaurants").findOne({ _id });
    if (!restaurant)
      return res.status(404).json({ error: "Restaurant not found" });

    const stats = await db
      .collection("restaurant_stats")
      .findOne({ _id }, { projection: { avgRating: 1, totalReviews: 1, totalOrders: 1 } });

    res.json({ ...restaurant, stats: stats || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /restaurants/:id — Update restaurant (updateOne)
router.patch("/:id", async (req, res) => {
  try {
    const db = getDb();
    const {
      name,
      description,
      operatingHours,
      cuisineTypes,
      tags,
    } = req.body;

    const update = { $set: { updatedAt: new Date() } };
    if (name) update.$set.name = name;
    if (description) update.$set.description = description;
    if (operatingHours) update.$set.operatingHours = operatingHours;
    if (cuisineTypes) update.$set.cuisineTypes = cuisineTypes;
    if (tags) update.$set.tags = tags;

    const result = await db
      .collection("restaurants")
      .updateOne({ _id: new ObjectId(req.params.id) }, update);

    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Restaurant not found" });
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /restaurants/:id/status — Toggle isAcceptingOrders (updateOne)
router.patch("/:id/status", async (req, res) => {
  try {
    const db = getDb();
    const { isAcceptingOrders, isActive } = req.body;

    const update = { $set: { updatedAt: new Date() } };
    if (isAcceptingOrders !== undefined)
      update.$set.isAcceptingOrders = isAcceptingOrders;
    if (isActive !== undefined) update.$set.isActive = isActive;

    const result = await db
      .collection("restaurants")
      .updateOne({ _id: new ObjectId(req.params.id) }, update);

    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Restaurant not found" });
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /restaurants/:id — deleteOne
router.delete("/:id", async (req, res) => {
  try {
    const db = getDb();
    const result = await db
      .collection("restaurants")
      .deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0)
      return res.status(404).json({ error: "Restaurant not found" });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /restaurants/:id/menu-categories — distinct categories (agregación simple)
router.get("/:id/menu-categories", async (req, res) => {
  try {
    const db = getDb();
    const categories = await db
      .collection("menu_items")
      .distinct("category", {
        restaurantId: new ObjectId(req.params.id),
        available: true,
      });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /restaurants/many — insertMany several restaurants at once
router.post("/many", async (req, res) => {
  try {
    const db = getDb();
    const { restaurants } = req.body;
    if (!Array.isArray(restaurants) || restaurants.length === 0) {
      return res.status(400).json({ error: "restaurants array required" });
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
