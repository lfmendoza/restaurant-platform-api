const { ObjectId } = require("mongodb");
const { getReadDb } = require("../db");
const AppError = require("../errors/AppError");

class ReviewQueries {
  static async list({ restaurantId, userId, rating, tag, q, skip = 0, limit = 20 }) {
    const db = getReadDb();

    const filter = {};
    if (restaurantId) filter.restaurantId = new ObjectId(restaurantId);
    if (userId) filter.userId = new ObjectId(userId);
    if (rating) filter.rating = parseInt(rating);
    if (tag) filter.tags = tag;
    if (q) filter.$text = { $search: q };

    return db
      .collection("reviews")
      .find(filter, {
        projection: {
          userId: 1, restaurantId: 1, orderId: 1, rating: 1, title: 1,
          comment: 1, tags: 1, restaurantResponse: 1, createdAt: 1,
        },
      })
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();
  }

  static async getById(id) {
    const db = getReadDb();
    const review = await db.collection("reviews").findOne({ _id: new ObjectId(id) });
    if (!review) throw AppError.notFound("Review");
    return review;
  }
}

module.exports = ReviewQueries;
