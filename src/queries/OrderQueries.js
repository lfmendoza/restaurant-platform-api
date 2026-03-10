const { ObjectId } = require("mongodb");
const { getReadDb } = require("../db");
const AppError = require("../errors/AppError");

class OrderQueries {
  static async list({ restaurantId, userId, status, skip = 0, limit = 20 }) {
    const db = getReadDb();

    const match = {};
    if (restaurantId) match.restaurantId = new ObjectId(restaurantId);
    if (userId) match.userId = new ObjectId(userId);
    if (status) match.status = status;

    return db
      .collection("orders")
      .aggregate([
        { $match: match },
        { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
        { $lookup: { from: "restaurants", localField: "restaurantId", foreignField: "_id", as: "restaurant" } },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$restaurant", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1, orderNumber: 1, status: 1, total: 1, paymentMethod: 1, items: 1,
            deliveryAddress: 1, estimatedDelivery: 1, statusHistory: 1,
            createdAt: 1, updatedAt: 1,
            restaurantId: 1,
            "user.name": 1, "user.phone": 1, "user.email": 1,
            "restaurant.name": 1, "restaurant.address": 1, "restaurant._id": 1,
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: parseInt(skip) },
        { $limit: parseInt(limit) },
      ])
      .toArray();
  }

  static async getById(id) {
    const db = getReadDb();
    const order = await db.collection("orders").findOne({ _id: new ObjectId(id) });
    if (!order) throw AppError.notFound("Order");
    return order;
  }
}

module.exports = OrderQueries;
