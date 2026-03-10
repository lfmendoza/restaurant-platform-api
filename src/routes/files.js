const { Router } = require("express");
const { ObjectId } = require("mongodb");
const multer = require("multer");
const { getDb, getBucket } = require("../db");

const router = Router();

// Use memory storage — stream directly to GridFS
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"), false);
  },
});

// POST /files/upload — Upload image to GridFS
// Rubrica: GridFS upload + update imageFileId on menu_item or restaurant
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const bucket = getBucket();
    const db = getDb();

    const { menuItemId, restaurantId, contentType } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const metadata = {
      contentType: file.mimetype,
      uploadedAt: new Date(),
    };
    if (menuItemId) metadata.menuItemId = new ObjectId(menuItemId);
    if (restaurantId) metadata.restaurantId = new ObjectId(restaurantId);

    // Open upload stream to GridFS
    const uploadStream = bucket.openUploadStream(file.originalname, {
      metadata,
      contentType: file.mimetype,
    });

    // Write buffer to stream
    await new Promise((resolve, reject) => {
      uploadStream.end(file.buffer);
      uploadStream.on("finish", resolve);
      uploadStream.on("error", reject);
    });

    const fileId = uploadStream.id;

    // Link fileId back to the referenced document
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

    res.status(201).json({
      fileId,
      filename: file.originalname,
      size: file.size,
      url: `/files/${fileId}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /files/:id — Stream image from GridFS
// Rubrica: GridFS download
router.get("/:id", async (req, res) => {
  try {
    const bucket = getBucket();
    const db = getDb();
    const fileId = new ObjectId(req.params.id);

    const fileInfo = await db
      .collection("images.files")
      .findOne({ _id: fileId });

    if (!fileInfo) return res.status(404).json({ error: "File not found" });

    res.set("Content-Type", fileInfo.contentType || "image/jpeg");
    res.set("Content-Length", fileInfo.length);
    res.set(
      "Content-Disposition",
      `inline; filename="${fileInfo.filename}"`
    );

    bucket.openDownloadStream(fileId).pipe(res);
  } catch (err) {
    if (err.name === "BSONTypeError" || err.message.includes("must be a 24")) {
      return res.status(400).json({ error: "Invalid file ID" });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /files — List uploaded files
router.get("/", async (req, res) => {
  try {
    const db = getDb();
    const { skip = 0, limit = 20 } = req.query;

    const files = await db
      .collection("images.files")
      .find(
        {},
        {
          projection: {
            filename: 1,
            length: 1,
            contentType: 1,
            metadata: 1,
            uploadDate: 1,
          },
        }
      )
      .sort({ uploadDate: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /files/:id — Delete file from GridFS + unset imageFileId/logoFileId
// Rubrica: GridFS delete
router.delete("/:id", async (req, res) => {
  try {
    const bucket = getBucket();
    const db = getDb();
    const fileId = new ObjectId(req.params.id);

    await bucket.delete(fileId);

    // Unlink from menu_items
    await db.collection("menu_items").updateMany(
      { imageFileId: fileId },
      { $unset: { imageFileId: "" }, $set: { updatedAt: new Date() } }
    );

    // Unlink from restaurants
    await db.collection("restaurants").updateMany(
      { logoFileId: fileId },
      { $unset: { logoFileId: "" }, $set: { updatedAt: new Date() } }
    );

    res.json({ deleted: true, fileId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
