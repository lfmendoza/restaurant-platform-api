const { Router } = require("express");
const multer = require("multer");
const asyncHandler = require("../middleware/asyncHandler");
const FileCommands = require("../commands/FileCommands");
const FileQueries = require("../queries/FileQueries");

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"), false);
  },
});

router.post("/upload", upload.single("image"), asyncHandler(async (req, res) => {
  const result = await FileCommands.upload(req.file, req.body);
  res.status(201).json(result);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await FileCommands.delete(req.params.id);
  res.json(result);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const fileInfo = await FileQueries.getById(req.params.id);

  res.set("Content-Type", fileInfo.contentType || "image/jpeg");
  res.set("Content-Length", fileInfo.length);
  res.set("Content-Disposition", `inline; filename="${fileInfo.filename}"`);

  const stream = await FileQueries.getDownloadStream(req.params.id);
  stream.pipe(res);
}));

router.get("/", asyncHandler(async (req, res) => {
  const files = await FileQueries.list(req.query);
  res.json(files);
}));

module.exports = router;
