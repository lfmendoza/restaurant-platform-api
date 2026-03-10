require("dotenv").config();
const express = require("express");
const cors = require("cors");

const usersRouter = require("./routes/users");
const restaurantsRouter = require("./routes/restaurants");
const menuItemsRouter = require("./routes/menu_items");
const cartsRouter = require("./routes/carts");
const ordersRouter = require("./routes/orders");
const reviewsRouter = require("./routes/reviews");
const filesRouter = require("./routes/files");
const analyticsRouter = require("./routes/analytics");
const docsRouter = require("./docs");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/users", usersRouter);
app.use("/restaurants", restaurantsRouter);
app.use("/menu-items", menuItemsRouter);
app.use("/carts", cartsRouter);
app.use("/orders", ordersRouter);
app.use("/reviews", reviewsRouter);
app.use("/files", filesRouter);
app.use("/analytics", analyticsRouter);
app.use("/docs", docsRouter);

app.get("/", (req, res) => {
  res.redirect("/docs");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", db: process.env.DB_NAME || "restaurant_orders" });
});

module.exports = app;
