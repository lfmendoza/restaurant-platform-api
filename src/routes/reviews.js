const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const ReviewCommands = require("../commands/ReviewCommands");
const ReviewQueries = require("../queries/ReviewQueries");

const router = Router();

router.post("/", asyncHandler(async (req, res) => {
  const review = await ReviewCommands.create(req.body);
  res.status(201).json(review);
}));

router.patch("/:id/response", asyncHandler(async (req, res) => {
  const result = await ReviewCommands.respond(req.params.id, req.body.message);
  res.json(result);
}));

router.patch("/:id/tag", asyncHandler(async (req, res) => {
  const result = await ReviewCommands.addTag(req.params.id, req.body.tag);
  res.json(result);
}));

router.patch("/:id/helpful", asyncHandler(async (req, res) => {
  const result = await ReviewCommands.addHelpfulVote(req.params.id, req.body.voterId);
  res.json(result);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await ReviewCommands.delete(req.params.id);
  res.json(result);
}));

router.delete("/", asyncHandler(async (req, res) => {
  const result = await ReviewCommands.deleteMany(req.query);
  res.json(result);
}));

router.get("/", asyncHandler(async (req, res) => {
  const reviews = await ReviewQueries.list(req.query);
  res.json(reviews);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const review = await ReviewQueries.getById(req.params.id);
  res.json(review);
}));

module.exports = router;
