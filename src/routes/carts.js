const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");

const router = Router();

// GET /carts — Get cart for a user (optionally filtered by restaurantId)
router.get("/", async (req, res) => {
  try {
    const db = getDb();
    const { userId, restaurantId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const filter = { userId: new ObjectId(userId) };
    if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);

    const cart = await db.collection("carts").findOne(filter);
    if (!cart) return res.status(404).json({ error: "Cart not found" });
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /carts/items — Add item to cart
// Rubrica: CRUD Creación doc embebido, Arrays $push, upsert, $setOnInsert
router.post("/items", async (req, res) => {
  try {
    const db = getDb();
    const { userId, menuItemId, quantity } = req.body;

    const menuItem = await db
      .collection("menu_items")
      .findOne(
        { _id: new ObjectId(menuItemId), available: true },
        { projection: { name: 1, price: 1, restaurantId: 1 } }
      );

    if (!menuItem)
      return res.status(404).json({ error: "Menu item not found or unavailable" });

    const qty = parseInt(quantity) || 1;
    const subtotal = Math.round(menuItem.price * qty * 100) / 100;

    const embeddedItem = {
      menuItemId: menuItem._id,
      name: menuItem.name,
      price: menuItem.price,
      quantity: qty,
      subtotal,
      available: true,
    };

    const expiresAt = new Date(Date.now() + 86400000);

    const result = await db.collection("carts").updateOne(
      { userId: new ObjectId(userId), restaurantId: menuItem.restaurantId },
      {
        $push: { items: embeddedItem },
        $set: { updatedAt: new Date() },
        $setOnInsert: {
          createdAt: new Date(),
          expiresAt,
          hasUnavailableItems: false,
          subtotal: 0,
        },
      },
      { upsert: true }
    );

    // Recalculate subtotal
    const cart = await db
      .collection("carts")
      .findOne({ userId: new ObjectId(userId), restaurantId: menuItem.restaurantId });

    const newSubtotal = cart.items.reduce((s, i) => s + i.subtotal, 0);
    await db.collection("carts").updateOne(
      { _id: cart._id },
      { $set: { subtotal: Math.round(newSubtotal * 100) / 100 } }
    );

    const updatedCart = await db.collection("carts").findOne({ _id: cart._id });
    res.status(200).json(updatedCart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /carts/items/:menuItemId — Update item quantity (positional operator)
// Rubrica: Manejo de documentos embebidos positional update
router.patch("/items/:menuItemId", async (req, res) => {
  try {
    const db = getDb();
    const { userId, quantity } = req.body;
    const menuItemId = new ObjectId(req.params.menuItemId);
    const qty = parseInt(quantity);

    if (qty < 1) return res.status(400).json({ error: "quantity must be >= 1" });

    const cart = await db
      .collection("carts")
      .findOne({ userId: new ObjectId(userId) });

    if (!cart) return res.status(404).json({ error: "Cart not found" });

    const itemInCart = cart.items.find(
      (i) => i.menuItemId.toString() === menuItemId.toString()
    );
    if (!itemInCart) return res.status(404).json({ error: "Item not in cart" });

    const newSubtotal = Math.round(itemInCart.price * qty * 100) / 100;

    // Positional $ operator — update matching array element
    await db.collection("carts").updateOne(
      {
        userId: new ObjectId(userId),
        "items.menuItemId": menuItemId,
      },
      {
        $set: {
          "items.$.quantity": qty,
          "items.$.subtotal": newSubtotal,
          updatedAt: new Date(),
        },
      }
    );

    // Recalculate total subtotal
    const updatedCart = await db
      .collection("carts")
      .findOne({ userId: new ObjectId(userId) });

    const totalSubtotal = updatedCart.items.reduce((s, i) => s + i.subtotal, 0);
    await db.collection("carts").updateOne(
      { _id: updatedCart._id },
      { $set: { subtotal: Math.round(totalSubtotal * 100) / 100 } }
    );

    const finalCart = await db
      .collection("carts")
      .findOne({ _id: updatedCart._id });
    res.json(finalCart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /carts/items/:menuItemId — Remove item from cart ($pull)
// Rubrica: Arrays $pull
router.delete("/items/:menuItemId", async (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.query;
    const menuItemId = new ObjectId(req.params.menuItemId);

    const result = await db.collection("carts").updateOne(
      { userId: new ObjectId(userId) },
      {
        $pull: { items: { menuItemId } },
        $set: { updatedAt: new Date() },
      }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Cart not found" });

    // Recalculate subtotal
    const cart = await db
      .collection("carts")
      .findOne({ userId: new ObjectId(userId) });

    const subtotal = cart.items.reduce((s, i) => s + i.subtotal, 0);
    await db.collection("carts").updateOne(
      { _id: cart._id },
      { $set: { subtotal: Math.round(subtotal * 100) / 100 } }
    );

    res.json({ removed: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /carts — Delete entire cart
router.delete("/", async (req, res) => {
  try {
    const db = getDb();
    const { userId, restaurantId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const filter = { userId: new ObjectId(userId) };
    if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);

    const result = await db.collection("carts").deleteOne(filter);
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
