const { getDb } = require("../db");
const AppError = require("../errors/AppError");
const { requireFields, toObjectId, requireIntInRange } = require("../validation");

class CartCommands {
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
    requireFields({ userId, menuItemId }, ["userId", "menuItemId"]);
    const userOid = toObjectId(userId, "userId");
    const menuOid = toObjectId(menuItemId, "menuItemId");

    const db = getDb();
    const menuItem = await db.collection("menu_items").findOne(
      { _id: menuOid, available: true },
      { projection: { name: 1, price: 1, restaurantId: 1 } }
    );

    if (!menuItem) throw AppError.notFound("Menu item not found or unavailable");

    const qty = parseInt(quantity) || 1;
    if (qty < 1) throw AppError.badRequest("quantity must be >= 1");
    const subtotal = Math.round(menuItem.price * qty * 100) / 100;

    await db.collection("carts").updateOne(
      { userId: userOid, restaurantId: menuItem.restaurantId },
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
      userId: userOid,
      restaurantId: menuItem.restaurantId,
    });
  }

  static async updateItemQuantity(userId, menuItemId, quantity) {
    requireFields({ userId, menuItemId }, ["userId", "menuItemId"]);
    const userOid = toObjectId(userId, "userId");
    const menuOid = toObjectId(menuItemId, "menuItemId");

    const qty = requireIntInRange(quantity, "quantity", 1, 9999);

    const db = getDb();
    const cart = await db.collection("carts").findOne({ userId: userOid });
    if (!cart) throw AppError.notFound("Cart");

    const item = cart.items.find((i) => i.menuItemId.toString() === menuOid.toString());
    if (!item) throw AppError.notFound("Item not in cart");

    const newSubtotal = Math.round(item.price * qty * 100) / 100;

    await db.collection("carts").updateOne(
      { userId: userOid, "items.menuItemId": menuOid },
      {
        $set: {
          "items.$.quantity": qty,
          "items.$.subtotal": newSubtotal,
          updatedAt: new Date(),
        },
      }
    );

    return this.recalculateSubtotal({ userId: userOid });
  }

  static async removeItem(userId, menuItemId) {
    requireFields({ userId, menuItemId }, ["userId", "menuItemId"]);
    const userOid = toObjectId(userId, "userId");
    const menuOid = toObjectId(menuItemId, "menuItemId");

    const db = getDb();
    const result = await db.collection("carts").updateOne(
      { userId: userOid },
      {
        $pull: { items: { menuItemId: menuOid } },
        $set: { updatedAt: new Date() },
      }
    );

    if (result.matchedCount === 0) throw AppError.notFound("Cart");

    await this.recalculateSubtotal({ userId: userOid });
    return result.modifiedCount;
  }

  static async deleteCart({ userId, restaurantId }) {
    if (!userId) throw AppError.badRequest("userId required");
    const userOid = toObjectId(userId, "userId");

    const db = getDb();
    const filter = { userId: userOid };
    if (restaurantId) filter.restaurantId = toObjectId(restaurantId, "restaurantId");

    const result = await db.collection("carts").deleteOne(filter);
    return { deleted: result.deletedCount };
  }
}

module.exports = CartCommands;
