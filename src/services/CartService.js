const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const AppError = require("../errors/AppError");

class CartService {
  static async recalculateSubtotal(filter) {
    const db = getDb();
    const cart = await db.collection("carts").findOne(filter);
    if (!cart) return null;

    const subtotal = cart.items.reduce((sum, i) => sum + i.subtotal, 0);
    await db.collection("carts").updateOne(
      { _id: cart._id },
      { $set: { subtotal: Math.round(subtotal * 100) / 100 } }
    );

    return db.collection("carts").findOne({ _id: cart._id });
  }

  static async addItem(userId, menuItemId, quantity) {
    const db = getDb();
    const menuItem = await db.collection("menu_items").findOne(
      { _id: new ObjectId(menuItemId), available: true },
      { projection: { name: 1, price: 1, restaurantId: 1 } }
    );

    if (!menuItem) throw AppError.notFound("Menu item not found or unavailable");

    const qty = parseInt(quantity) || 1;
    const subtotal = Math.round(menuItem.price * qty * 100) / 100;

    await db.collection("carts").updateOne(
      { userId: new ObjectId(userId), restaurantId: menuItem.restaurantId },
      {
        $push: {
          items: {
            menuItemId: menuItem._id,
            name: menuItem.name,
            price: menuItem.price,
            quantity: qty,
            subtotal,
            available: true,
          },
        },
        $set: { updatedAt: new Date() },
        $setOnInsert: {
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          hasUnavailableItems: false,
          subtotal: 0,
        },
      },
      { upsert: true }
    );

    return this.recalculateSubtotal({
      userId: new ObjectId(userId),
      restaurantId: menuItem.restaurantId,
    });
  }

  static async updateItemQuantity(userId, menuItemId, quantity) {
    const db = getDb();
    const qty = parseInt(quantity);
    if (qty < 1) throw AppError.badRequest("quantity must be >= 1");

    const oid = new ObjectId(menuItemId);
    const cart = await db.collection("carts").findOne({ userId: new ObjectId(userId) });
    if (!cart) throw AppError.notFound("Cart");

    const item = cart.items.find((i) => i.menuItemId.toString() === oid.toString());
    if (!item) throw AppError.notFound("Item not in cart");

    const newSubtotal = Math.round(item.price * qty * 100) / 100;

    await db.collection("carts").updateOne(
      { userId: new ObjectId(userId), "items.menuItemId": oid },
      {
        $set: {
          "items.$.quantity": qty,
          "items.$.subtotal": newSubtotal,
          updatedAt: new Date(),
        },
      }
    );

    return this.recalculateSubtotal({ userId: new ObjectId(userId) });
  }

  static async removeItem(userId, menuItemId) {
    const db = getDb();
    const result = await db.collection("carts").updateOne(
      { userId: new ObjectId(userId) },
      {
        $pull: { items: { menuItemId: new ObjectId(menuItemId) } },
        $set: { updatedAt: new Date() },
      }
    );

    if (result.matchedCount === 0) throw AppError.notFound("Cart");

    await this.recalculateSubtotal({ userId: new ObjectId(userId) });
    return result.modifiedCount;
  }
}

module.exports = CartService;
