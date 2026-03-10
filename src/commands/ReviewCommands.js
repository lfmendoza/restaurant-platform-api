const { getDb } = require("../db");
const AppError = require("../errors/AppError");
const { requireFields, toObjectId, requireIntInRange } = require("../validation");

class ReviewCommands {
  static async create({ userId, orderId, restaurantId, rating, title, comment, tags }) {
    requireFields({ userId, orderId, rating }, ["userId", "orderId", "rating"]);

    const userOid = toObjectId(userId, "userId");
    const orderOid = toObjectId(orderId, "orderId");
    const parsedRating = requireIntInRange(rating, "rating", 1, 5);

    const db = getDb();

    const order = await db.collection("orders").findOne({
      _id: orderOid,
      userId: userOid,
      status: "delivered",
    });

    if (!order) {
      throw AppError.badRequest(
        "Order not found, does not belong to user, or is not delivered"
      );
    }

    const restOid = restaurantId
      ? toObjectId(restaurantId, "restaurantId")
      : order.restaurantId;
    if (!restOid) {
      throw AppError.badRequest("restaurantId is required and could not be derived from the order");
    }

    const existing = await db.collection("reviews").findOne({
      orderId: orderOid,
      userId: userOid,
    });

    if (existing) {
      throw AppError.conflict("Review already submitted for this order");
    }

    const doc = {
      userId: userOid,
      restaurantId: restOid,
      orderId: orderOid,
      rating: parsedRating,
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

  static async respond(id, message) {
    const _id = toObjectId(id, "reviewId");
    if (!message) throw AppError.badRequest("message is required");

    const db = getDb();
    const result = await db.collection("reviews").updateOne(
      { _id },
      { $set: { restaurantResponse: { message, respondedAt: new Date() } } }
    );
    if (result.matchedCount === 0) throw AppError.notFound("Review");
    return { updated: result.modifiedCount };
  }

  static async addTag(id, tag) {
    const _id = toObjectId(id, "reviewId");
    if (!tag) throw AppError.badRequest("tag is required");

    const db = getDb();
    const result = await db.collection("reviews").updateOne(
      { _id },
      { $addToSet: { tags: tag } }
    );
    if (result.matchedCount === 0) throw AppError.notFound("Review");
    return { updated: result.modifiedCount };
  }

  static async addHelpfulVote(id, voterId) {
    const _id = toObjectId(id, "reviewId");
    const voterOid = toObjectId(voterId, "voterId");

    const db = getDb();
    const result = await db.collection("reviews").updateOne(
      { _id },
      { $addToSet: { helpfulVotes: voterOid } }
    );
    if (result.matchedCount === 0) throw AppError.notFound("Review");
    return { updated: result.modifiedCount };
  }

  static async delete(id) {
    const _id = toObjectId(id, "reviewId");
    const db = getDb();
    const result = await db.collection("reviews").deleteOne({ _id });
    if (result.deletedCount === 0) throw AppError.notFound("Review");
    return { deleted: result.deletedCount };
  }

  static async deleteMany({ restaurantId, userId, before }) {
    const db = getDb();
    const filter = {};
    if (restaurantId) filter.restaurantId = toObjectId(restaurantId, "restaurantId");
    if (userId) filter.userId = toObjectId(userId, "userId");
    if (before) filter.createdAt = { $lt: new Date(before) };

    if (Object.keys(filter).length === 0) {
      throw AppError.badRequest("At least one filter required");
    }

    const result = await db.collection("reviews").deleteMany(filter);
    return { deleted: result.deletedCount };
  }
}

module.exports = ReviewCommands;
