const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const AppError = require("../errors/AppError");

class ReviewService {
  static async create({ userId, orderId, restaurantId, rating, title, comment, tags }) {
    const db = getDb();

    const order = await db.collection("orders").findOne({
      _id: new ObjectId(orderId),
      userId: new ObjectId(userId),
      status: "delivered",
    });

    if (!order) {
      throw AppError.badRequest(
        "Order not found, does not belong to user, or is not delivered"
      );
    }

    const existing = await db.collection("reviews").findOne({
      orderId: new ObjectId(orderId),
      userId: new ObjectId(userId),
    });

    if (existing) {
      throw AppError.conflict("Review already submitted for this order");
    }

    const doc = {
      userId: new ObjectId(userId),
      restaurantId: new ObjectId(restaurantId),
      orderId: new ObjectId(orderId),
      rating: parseInt(rating),
      title: title || "",
      comment: comment || "",
      tags: tags || [],
      restaurantResponse: null,
      helpfulVotes: [],
      createdAt: new Date(),
    };

    const result = await db.collection("reviews").insertOne(doc);
    return { _id: result.insertedId, ...doc };
  }
}

module.exports = ReviewService;
