const { Router } = require("express");
const { ObjectId } = require("mongodb");
const multer = require("multer");
const { getDb, getBucket } = require("../db");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../errors/AppError");

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"), false);
  },
});

// POST /files/upload — Upload image to GridFS
router.post("/upload", upload.single("image"), asyncHandler(async (req, res) => {
  const bucket = getBucket();
  const db = getDb();
  const { menuItemId, restaurantId } = req.body;
  const file = req.file;

  if (!file) throw AppError.badRequest("No file uploaded");

  const metadata = { contentType: file.mimetype, uploadedAt: new Date() };
  if (menuItemId) metadata.menuItemId = new ObjectId(menuItemId);
  if (restaurantId) metadata.restaurantId = new ObjectId(restaurantId);

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
      { _id: new ObjectId(menuItemId) },
      { $set: { imageFileId: fileId, updatedAt: new Date() } }
    );
  }
  if (restaurantId) {
    await db.collection("restaurants").updateOne(
      { _id: new ObjectId(restaurantId) },
      { $set: { logoFileId: fileId, updatedAt: new Date() } }
    );
  }

  res.status(201).json({ fileId, filename: file.originalname, size: file.size, url: `/files/${fileId}` });
}));

// GET /files/:id — Stream image from GridFS
router.get("/:id", asyncHandler(async (req, res) => {
  const bucket = getBucket();
  const db = getDb();
  const fileId = new ObjectId(req.params.id);

  const fileInfo = await db.collection("images.files").findOne({ _id: fileId });
  if (!fileInfo) throw AppError.notFound("File");

  res.set("Content-Type", fileInfo.contentType || "image/jpeg");
  res.set("Content-Length", fileInfo.length);
  res.set("Content-Disposition", `inline; filename="${fileInfo.filename}"`);

  bucket.openDownloadStream(fileId).pipe(res);
}));

// GET /files — List uploaded files
router.get("/", asyncHandler(async (req, res) => {
  const db = getDb();
  const { skip = 0, limit = 20 } = req.query;

  const files = await db
    .collection("images.files")
    .find({}, {
      projection: { filename: 1, length: 1, contentType: 1, metadata: 1, uploadDate: 1 },
    })
    .sort({ uploadDate: -1 })
    .skip(parseInt(skip))
    .limit(parseInt(limit))
    .toArray();

  res.json(files);
}));

// DELETE /files/:id — Delete file from GridFS + unlink references
router.delete("/:id", asyncHandler(async (req, res) => {
  const bucket = getBucket();
  const db = getDb();
  const fileId = new ObjectId(req.params.id);

  await bucket.delete(fileId);

  await db.collection("menu_items").updateMany(
    { imageFileId: fileId },
    { $unset: { imageFileId: "" }, $set: { updatedAt: new Date() } }
  );
  await db.collection("restaurants").updateMany(
    { logoFileId: fileId },
    { $unset: { logoFileId: "" }, $set: { updatedAt: new Date() } }
  );

  res.json({ deleted: true, fileId });
}));

module.exports = router;
