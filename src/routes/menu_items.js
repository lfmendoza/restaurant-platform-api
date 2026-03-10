const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");

const router = Router();

// POST /menu-items — Create single menu item (referenciado por restaurantId)
router.post("/", async (req, res) => {
  try {
    const db = getDb();
    const {
      restaurantId,
      name,
      description,
      price,
      category,
      allergens,
      tags,
      preparationTimeMin,
    } = req.body;

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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /menu-items/many — insertMany varios items a la vez
router.post("/many", async (req, res) => {
  try {
    const db = getDb();
    const { restaurantId, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array required" });
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /menu-items/bulk — bulkWrite (Extra: operaciones mixtas, ordered:false)
// Rubrica: bulkWrite extra 5pts
router.post("/bulk", async (req, res) => {
  try {
    const db = getDb();
    const { operations } = req.body;

    if (!Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({ error: "operations array required" });
    }

    // Map operations — support insertOne, updateOne, updateMany, deleteOne
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
              $set: {
                ...(op.updateOne.update.$set || {}),
                updatedAt: new Date(),
              },
            },
          },
        };
      }
      if (op.updateMany) {
        return {
          updateMany: {
            filter: {
              restaurantId: new ObjectId(op.updateMany.filter.restaurantId),
              ...(op.updateMany.filter.category
                ? { category: op.updateMany.filter.category }
                : {}),
            },
            update: {
              ...op.updateMany.update,
              $set: {
                ...(op.updateMany.update.$set || {}),
                updatedAt: new Date(),
              },
            },
          },
        };
      }
      if (op.deleteOne) {
        return {
          deleteOne: { filter: { _id: new ObjectId(op.deleteOne.filter._id) } },
        };
      }
      return op;
    });

    const result = await db
      .collection("menu_items")
      .bulkWrite(bulkOps, { ordered: false });

    res.status(200).json({
      insertedCount: result.insertedCount,
      modifiedCount: result.modifiedCount,
      deletedCount: result.deletedCount,
      upsertedCount: result.upsertedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /menu-items — List with filters + projection + sort + skip + limit
// Rubrica: CRUD Lectura completo (filtros, proyeccion, sort, skip, limit)
router.get("/", async (req, res) => {
  try {
    const db = getDb();
    const {
      restaurantId,
      category,
      available,
      allergen,
      price_lte,
      q,
      skip = 0,
      limit = 20,
      sort = "salesCount",
    } = req.query;

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
          name: 1,
          description: 1,
          price: 1,
          category: 1,
          allergens: 1,
          tags: 1,
          available: 1,
          preparationTimeMin: 1,
          imageFileId: 1,
          salesCount: 1,
          restaurantId: 1,
        },
      })
      .sort(sortObj)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /menu-items/:id — Get single item
router.get("/:id", async (req, res) => {
  try {
    const db = getDb();
    const item = await db
      .collection("menu_items")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /menu-items/:id — Update item (updateOne)
router.patch("/:id", async (req, res) => {
  try {
    const db = getDb();
    const { name, description, price, category, allergens, preparationTimeMin } =
      req.body;

    const update = { $set: { updatedAt: new Date() } };
    if (name) update.$set.name = name;
    if (description) update.$set.description = description;
    if (price !== undefined) update.$set.price = parseFloat(price);
    if (category) update.$set.category = category;
    if (allergens) update.$set.allergens = allergens;
    if (preparationTimeMin)
      update.$set.preparationTimeMin = parseInt(preparationTimeMin);

    const result = await db
      .collection("menu_items")
      .updateOne({ _id: new ObjectId(req.params.id) }, update);

    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Item not found" });
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /menu-items/:id/availability — Toggle availability
// + cascade to carts with arrayFilters (updateMany)
// Rubrica: updateOne + updateMany + Arrays arrayFilters
router.patch("/:id/availability", async (req, res) => {
  try {
    const db = getDb();
    const { available } = req.body;
    const menuItemId = new ObjectId(req.params.id);

    // 1. Update the menu item itself (updateOne)
    const itemResult = await db.collection("menu_items").updateOne(
      { _id: menuItemId },
      { $set: { available: Boolean(available), updatedAt: new Date() } }
    );

    if (itemResult.matchedCount === 0)
      return res.status(404).json({ error: "Item not found" });

    // 2. Cascade to all carts containing this item (updateMany + arrayFilters)
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

    res.json({
      itemUpdated: itemResult.modifiedCount,
      affectedCarts: cartResult.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /menu-items/restaurant/:restaurantId/category-price — updateMany: price adjustment
router.patch("/restaurant/:restaurantId/category-price", async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /menu-items/:id — deleteOne
router.delete("/:id", async (req, res) => {
  try {
    const db = getDb();
    const result = await db
      .collection("menu_items")
      .deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0)
      return res.status(404).json({ error: "Item not found" });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /menu-items — deleteMany by restaurantId + category
router.delete("/", async (req, res) => {
  try {
    const db = getDb();
    const { restaurantId, category } = req.query;

    if (!restaurantId)
      return res.status(400).json({ error: "restaurantId required" });

    const filter = { restaurantId: new ObjectId(restaurantId) };
    if (category) filter.category = category;

    const result = await db.collection("menu_items").deleteMany(filter);
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
