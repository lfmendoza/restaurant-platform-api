const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../errors/AppError");

const router = Router();

// POST /menu-items — Create single menu item
router.post("/", asyncHandler(async (req, res) => {
  const db = getDb();
  const { restaurantId, name, description, price, category, allergens, tags, preparationTimeMin } = req.body;

  const doc = {
    restaurantId: new ObjectId(restaurantId),
    name,
    description: description || "",
    price: parseFloat(price),
    category,
    allergens: allergens || [],
    tags: tags || [],
    available: true,
    preparationTimeMin: parseInt(preparationTimeMin) || 20,
    imageFileId: null,
    salesCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection("menu_items").insertOne(doc);
  res.status(201).json({ _id: result.insertedId, ...doc });
}));

// POST /menu-items/many — insertMany
router.post("/many", asyncHandler(async (req, res) => {
  const db = getDb();
  const { restaurantId, items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    throw AppError.badRequest("items array required");
  }

  const docs = items.map((item) => ({
    restaurantId: new ObjectId(restaurantId),
    name: item.name,
    description: item.description || "",
    price: parseFloat(item.price),
    category: item.category,
    allergens: item.allergens || [],
    tags: item.tags || [],
    available: true,
    preparationTimeMin: parseInt(item.preparationTimeMin) || 20,
    imageFileId: null,
    salesCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const result = await db.collection("menu_items").insertMany(docs);
  res.status(201).json({ insertedCount: result.insertedCount });
}));

// POST /menu-items/bulk — bulkWrite (ordered:false)
router.post("/bulk", asyncHandler(async (req, res) => {
  const db = getDb();
  const { operations } = req.body;

  if (!Array.isArray(operations) || operations.length === 0) {
    throw AppError.badRequest("operations array required");
  }

  const bulkOps = operations.map((op) => {
    if (op.insertOne) {
      const doc = op.insertOne.document;
      return {
        insertOne: {
          document: {
            ...doc,
            restaurantId: new ObjectId(doc.restaurantId),
            available: true,
            salesCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      };
    }
    if (op.updateOne) {
      return {
        updateOne: {
          filter: { _id: new ObjectId(op.updateOne.filter._id) },
          update: {
            ...op.updateOne.update,
            $set: { ...(op.updateOne.update.$set || {}), updatedAt: new Date() },
          },
        },
      };
    }
    if (op.updateMany) {
      return {
        updateMany: {
          filter: {
            restaurantId: new ObjectId(op.updateMany.filter.restaurantId),
            ...(op.updateMany.filter.category ? { category: op.updateMany.filter.category } : {}),
          },
          update: {
            ...op.updateMany.update,
            $set: { ...(op.updateMany.update.$set || {}), updatedAt: new Date() },
          },
        },
      };
    }
    if (op.deleteOne) {
      return { deleteOne: { filter: { _id: new ObjectId(op.deleteOne.filter._id) } } };
    }
    return op;
  });

  const result = await db.collection("menu_items").bulkWrite(bulkOps, { ordered: false });

  res.json({
    insertedCount: result.insertedCount,
    modifiedCount: result.modifiedCount,
    deletedCount: result.deletedCount,
    upsertedCount: result.upsertedCount,
  });
}));

// GET /menu-items — List with filters + text search + sort + skip + limit
router.get("/", asyncHandler(async (req, res) => {
  const db = getDb();
  const { restaurantId, category, available, allergen, price_lte, q, skip = 0, limit = 20, sort = "salesCount" } = req.query;

  const filter = {};
  if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);
  if (category) filter.category = category;
  if (available !== undefined) filter.available = available === "true";
  if (allergen) filter.allergens = allergen;
  if (price_lte) filter.price = { $lte: parseFloat(price_lte) };
  if (q) filter.$text = { $search: q };

  const sortObj = sort === "price" ? { price: 1 } : { salesCount: -1 };

  const items = await db
    .collection("menu_items")
    .find(filter, {
      projection: {
        name: 1, description: 1, price: 1, category: 1, allergens: 1,
        tags: 1, available: 1, preparationTimeMin: 1, imageFileId: 1,
        salesCount: 1, restaurantId: 1,
      },
    })
    .sort(sortObj)
    .skip(parseInt(skip))
    .limit(parseInt(limit))
    .toArray();

  res.json(items);
}));

// GET /menu-items/:id — Get single item
router.get("/:id", asyncHandler(async (req, res) => {
  const db = getDb();
  const item = await db.collection("menu_items").findOne({ _id: new ObjectId(req.params.id) });
  if (!item) throw AppError.notFound("Item");
  res.json(item);
}));

// PATCH /menu-items/:id — Update item
router.patch("/:id", asyncHandler(async (req, res) => {
  const db = getDb();
  const { name, description, price, category, allergens, preparationTimeMin } = req.body;

  const update = { $set: { updatedAt: new Date() } };
  if (name) update.$set.name = name;
  if (description) update.$set.description = description;
  if (price !== undefined) update.$set.price = parseFloat(price);
  if (category) update.$set.category = category;
  if (allergens) update.$set.allergens = allergens;
  if (preparationTimeMin) update.$set.preparationTimeMin = parseInt(preparationTimeMin);

  const result = await db.collection("menu_items").updateOne({ _id: new ObjectId(req.params.id) }, update);
  if (result.matchedCount === 0) throw AppError.notFound("Item");
  res.json({ updated: result.modifiedCount });
}));

// PATCH /menu-items/:id/availability — Toggle + cascade to carts (arrayFilters)
router.patch("/:id/availability", asyncHandler(async (req, res) => {
  const db = getDb();
  const { available } = req.body;
  const menuItemId = new ObjectId(req.params.id);

  const itemResult = await db.collection("menu_items").updateOne(
    { _id: menuItemId },
    { $set: { available: Boolean(available), updatedAt: new Date() } }
  );
  if (itemResult.matchedCount === 0) throw AppError.notFound("Item");

  const cartResult = await db.collection("carts").updateMany(
    { "items.menuItemId": menuItemId },
    {
      $set: {
        "items.$[elem].available": Boolean(available),
        hasUnavailableItems: !available,
        updatedAt: new Date(),
      },
    },
    { arrayFilters: [{ "elem.menuItemId": menuItemId }] }
  );

  res.json({ itemUpdated: itemResult.modifiedCount, affectedCarts: cartResult.modifiedCount });
}));

// PATCH /menu-items/restaurant/:restaurantId/category-price — $mul price adjustment
router.patch("/restaurant/:restaurantId/category-price", asyncHandler(async (req, res) => {
  const db = getDb();
  const { category, multiplier } = req.body;

  const result = await db.collection("menu_items").updateMany(
    {
      restaurantId: new ObjectId(req.params.restaurantId),
      ...(category ? { category } : {}),
    },
    { $mul: { price: parseFloat(multiplier) || 1.1 }, $set: { updatedAt: new Date() } }
  );

  res.json({ updated: result.modifiedCount });
}));

// DELETE /menu-items/:id — deleteOne
router.delete("/:id", asyncHandler(async (req, res) => {
  const db = getDb();
  const result = await db.collection("menu_items").deleteOne({ _id: new ObjectId(req.params.id) });
  if (result.deletedCount === 0) throw AppError.notFound("Item");
  res.json({ deleted: result.deletedCount });
}));

// DELETE /menu-items — deleteMany by restaurantId + category
router.delete("/", asyncHandler(async (req, res) => {
  const db = getDb();
  const { restaurantId, category } = req.query;

  if (!restaurantId) throw AppError.badRequest("restaurantId required");

  const filter = { restaurantId: new ObjectId(restaurantId) };
  if (category) filter.category = category;

  const result = await db.collection("menu_items").deleteMany(filter);
  res.json({ deleted: result.deletedCount });
}));

module.exports = router;
