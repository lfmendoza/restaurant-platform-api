const { ObjectId } = require("mongodb");
const { getReadDb, getBucket } = require("../db");
const AppError = require("../errors/AppError");

class FileQueries {
  static async getById(fileId) {
    const db = getReadDb();
    const _id = new ObjectId(fileId);

    const fileInfo = await db.collection("images.files").findOne({ _id });
    if (!fileInfo) throw AppError.notFound("File");

    return fileInfo;
  }

  static async getDownloadStream(fileId) {
    const bucket = getBucket();
    return bucket.openDownloadStream(new ObjectId(fileId));
  }

  static async list({ skip = 0, limit = 20, restaurantName, menuItemName }) {
    const db = getReadDb();

    const pipeline = [
      {
        $lookup: {
          from: "restaurants",
          localField: "metadata.restaurantId",
          foreignField: "_id",
          as: "_restaurant",
          pipeline: [{ $project: { name: 1 } }],
        },
      },
      {
        $lookup: {
          from: "menu_items",
          localField: "metadata.menuItemId",
          foreignField: "_id",
          as: "_menuItem",
          pipeline: [{ $project: { name: 1, restaurantId: 1 } }],
        },
      },
      {
        $addFields: {
          restaurantName: { $ifNull: [{ $arrayElemAt: ["$_restaurant.name", 0] }, ""] },
          menuItemName: { $ifNull: [{ $arrayElemAt: ["$_menuItem.name", 0] }, ""] },
        },
      },
    ];

    if (restaurantName && restaurantName.trim()) {
      pipeline.push({
        $match: { restaurantName: { $regex: restaurantName.trim(), $options: "i" } },
      });
    }
    if (menuItemName && menuItemName.trim()) {
      pipeline.push({
        $match: { menuItemName: { $regex: menuItemName.trim(), $options: "i" } },
      });
    }

    pipeline.push(
      { $sort: { uploadDate: -1 } },
      { $skip: parseInt(skip) },
      { $limit: parseInt(limit) },
      {
        $project: {
          filename: 1,
          length: 1,
          contentType: 1,
          metadata: 1,
          uploadDate: 1,
          restaurantName: 1,
          menuItemName: 1,
        },
      }
    );

    return db.collection("images.files").aggregate(pipeline).toArray();
  }
}

module.exports = FileQueries;
