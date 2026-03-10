const { ObjectId } = require("mongodb");
const { getReadDb } = require("../db");
const AppError = require("../errors/AppError");

class CartQueries {
  static async getByUser({ userId, restaurantId }) {
    if (!userId) throw AppError.badRequest("userId required");

    const db = getReadDb();
    const filter = { userId: new ObjectId(userId) };
    if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);

    const cart = await db.collection("carts").findOne(filter);
    if (!cart) throw AppError.notFound("Cart");
    return cart;
  }
}

module.exports = CartQueries;
