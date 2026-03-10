const { Router } = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const UserCommands = require("../commands/UserCommands");
const UserQueries = require("../queries/UserQueries");

const router = Router();

router.post("/", asyncHandler(async (req, res) => {
  const user = await UserCommands.create(req.body);
  res.status(201).json(user);
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const result = await UserCommands.update(req.params.id, req.body);
  res.json(result);
}));

router.patch("/:id/favorites", asyncHandler(async (req, res) => {
  const result = await UserCommands.addFavorite(req.params.id, req.body.restaurantId);
  res.json(result);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await UserCommands.delete(req.params.id);
  res.json(result);
}));

router.get("/", asyncHandler(async (req, res) => {
  const users = await UserQueries.list(req.query);
  res.json(users);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const user = await UserQueries.getById(req.params.id);
  res.json(user);
}));

module.exports = router;
