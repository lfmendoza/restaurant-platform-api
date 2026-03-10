const { getDb, getBucket } = require("../db");
const AppError = require("../errors/AppError");
const { toObjectId } = require("../validation");

class FileCommands {
  static async upload(file, { menuItemId, restaurantId } = {}) {
    if (!file) throw AppError.badRequest("No file uploaded");
    if (!file.buffer || !file.mimetype) {
      throw AppError.badRequest("Invalid file: must include buffer and mimetype");
    }

    const bucket = getBucket();
    const db = getDb();

    const metadata = { contentType: file.mimetype, uploadedAt: new Date() };
    if (menuItemId) metadata.menuItemId = toObjectId(menuItemId, "menuItemId");
    if (restaurantId) metadata.restaurantId = toObjectId(restaurantId, "restaurantId");

    const uploadStream = bucket.openUploadStream(file.originalname, {
      metadata,
      contentType: file.mimetype,
    });

    await new Promise((resolve, reject) => {
      uploadStream.end(file.buffer);
      uploadStream.on("finish", resolve);
      uploadStream.on("error", reject);
    });

    const fileId = uploadStream.id;

    if (menuItemId) {
      await db.collection("menu_items").updateOne(
        { _id: toObjectId(menuItemId, "menuItemId") },
        { $set: { imageFileId: fileId, updatedAt: new Date() } }
      );
    }
    if (restaurantId) {
      await db.collection("restaurants").updateOne(
        { _id: toObjectId(restaurantId, "restaurantId") },
        { $set: { logoFileId: fileId, updatedAt: new Date() } }
      );
    }

    return { fileId, filename: file.originalname, size: file.size, url: `/files/${fileId}` };
  }

  static async delete(fileId) {
    const _id = toObjectId(fileId, "fileId");

    const bucket = getBucket();
    const db = getDb();

    await bucket.delete(_id);

    await db.collection("menu_items").updateMany(
      { imageFileId: _id },
      { $unset: { imageFileId: "" }, $set: { updatedAt: new Date() } }
    );
    await db.collection("restaurants").updateMany(
      { logoFileId: _id },
      { $unset: { logoFileId: "" }, $set: { updatedAt: new Date() } }
    );

    return { deleted: true, fileId: _id };
  }
}

module.exports = FileCommands;
