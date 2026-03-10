const { ObjectId } = require("mongodb");

const ID = {
  user1:  new ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa"),
  user2:  new ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb"),
  rest1:  new ObjectId("cccccccccccccccccccccccc"),
  rest2:  new ObjectId("dddddddddddddddddddddddd"),
  item1:  new ObjectId("eeeeeeeeeeeeeeeeeeeeeeee"),
  item2:  new ObjectId("ffffffffffffffffffffffff"),
  order1: new ObjectId("111111111111111111111111"),
  order2: new ObjectId("222222222222222222222222"),
  review1:new ObjectId("333333333333333333333333"),
  cart1:  new ObjectId("444444444444444444444444"),
  zone1:  new ObjectId("555555555555555555555555"),
  file1:  new ObjectId("666666666666666666666666"),
};

const USERS = {
  customer: {
    _id: ID.user1,
    email: "customer@test.com",
    name: "Test Customer",
    phone: "+502 5555",
    role: "customer",
    defaultAddress: {
      street: "7a Avenida 12-30",
      city: "Guatemala",
      zone: "Zona 10",
      coordinates: { type: "Point", coordinates: [-90.51, 14.59] },
    },
    orderHistory: [],
    favoriteRestaurants: [],
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
  admin: {
    _id: ID.user2,
    email: "admin@test.com",
    name: "Test Admin",
    phone: "+502 6666",
    role: "restaurant_admin",
    defaultAddress: null,
    orderHistory: [],
    favoriteRestaurants: [],
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
};

const RESTAURANTS = {
  active: {
    _id: ID.rest1,
    name: "Bella Italia #1",
    description: "Restaurante de cocina italiana",
    location: { type: "Point", coordinates: [-90.51, 14.59] },
    address: { street: "Calle 1", city: "Guatemala", zone: "Zona 10" },
    operatingHours: {
      monday: { open: "10:00", close: "22:00" },
      tuesday: { open: "10:00", close: "22:00" },
    },
    cuisineTypes: ["italiana", "mexicana"],
    tags: ["pet-friendly", "wifi"],
    isActive: true,
    isAcceptingOrders: true,
    logoFileId: null,
    menuItemCount: 100,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
};

const MENU_ITEMS = {
  pizza: {
    _id: ID.item1,
    restaurantId: ID.rest1,
    name: "Pizza Margherita",
    description: "Pizza clásica con tomate y mozzarella",
    price: 89.0,
    category: "Platos Principales",
    allergens: ["gluten", "lácteos"],
    tags: ["vegetariano"],
    available: true,
    preparationTimeMin: 22,
    imageFileId: null,
    salesCount: 50,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
  coffee: {
    _id: ID.item2,
    restaurantId: ID.rest1,
    name: "Café Americano",
    description: "Café negro recién preparado",
    price: 18.0,
    category: "Bebidas",
    allergens: [],
    tags: [],
    available: true,
    preparationTimeMin: 5,
    imageFileId: null,
    salesCount: 120,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
};

const DELIVERY_ZONES = {
  centro: {
    _id: ID.zone1,
    restaurantId: ID.rest1,
    zoneName: "Zona Centro (3 km)",
    area: {
      type: "Polygon",
      coordinates: [[[-90.53, 14.57], [-90.49, 14.57], [-90.49, 14.61], [-90.53, 14.61], [-90.53, 14.57]]],
    },
    deliveryFee: 15.0,
    estimatedMinutes: 25,
    isActive: true,
  },
};

const CARTS = {
  withItems: {
    _id: ID.cart1,
    userId: ID.user1,
    restaurantId: ID.rest1,
    items: [
      { menuItemId: ID.item1, name: "Pizza Margherita", price: 89.0, quantity: 2, subtotal: 178.0, available: true },
      { menuItemId: ID.item2, name: "Café Americano", price: 18.0, quantity: 1, subtotal: 18.0, available: true },
    ],
    subtotal: 196.0,
    hasUnavailableItems: false,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date("2025-06-01"),
    updatedAt: new Date("2025-06-01"),
  },
};

const now = new Date();
const ORDERS = {
  delivered: {
    _id: ID.order1,
    orderNumber: "ORD-1700000000000-123",
    userId: ID.user1,
    restaurantId: ID.rest1,
    items: [
      { menuItemId: ID.item1, name: "Pizza Margherita", quantity: 2, unitPrice: 89.0, subtotal: 178.0 },
    ],
    deliveryAddress: { street: "7a Avenida 12-30", city: "Guatemala", zone: "Zona 10" },
    status: "delivered",
    statusHistory: [
      { status: "pending",          timestamp: new Date("2025-06-01T10:00:00Z"), actor: "system",     durationFromPrevSec: 0 },
      { status: "confirmed",        timestamp: new Date("2025-06-01T10:05:00Z"), actor: "restaurant", durationFromPrevSec: 300 },
      { status: "preparing",        timestamp: new Date("2025-06-01T10:10:00Z"), actor: "restaurant", durationFromPrevSec: 300 },
      { status: "ready_for_pickup", timestamp: new Date("2025-06-01T10:25:00Z"), actor: "restaurant", durationFromPrevSec: 900 },
      { status: "picked_up",        timestamp: new Date("2025-06-01T10:30:00Z"), actor: "delivery",   durationFromPrevSec: 300 },
      { status: "delivered",         timestamp: new Date("2025-06-01T10:50:00Z"), actor: "delivery",   durationFromPrevSec: 1200 },
    ],
    subtotal: 178.0,
    tax: 21.36,
    deliveryFee: 15.0,
    total: 214.36,
    paymentMethod: "card",
    cancellationReason: null,
    estimatedDelivery: new Date("2025-06-01T11:00:00Z"),
    createdAt: new Date("2025-06-01T10:00:00Z"),
    updatedAt: new Date("2025-06-01T10:50:00Z"),
  },
  pending: {
    _id: ID.order2,
    orderNumber: "ORD-1700000000001-456",
    userId: ID.user1,
    restaurantId: ID.rest1,
    items: [
      { menuItemId: ID.item1, name: "Pizza Margherita", quantity: 1, unitPrice: 89.0, subtotal: 89.0 },
    ],
    deliveryAddress: { street: "7a Avenida 12-30", city: "Guatemala", zone: "Zona 10" },
    status: "pending",
    statusHistory: [
      { status: "pending", timestamp: now, actor: "system", durationFromPrevSec: 0 },
    ],
    subtotal: 89.0,
    tax: 10.68,
    deliveryFee: 15.0,
    total: 114.68,
    paymentMethod: "cash",
    cancellationReason: null,
    estimatedDelivery: new Date(now.getTime() + 2700000),
    createdAt: now,
    updatedAt: now,
  },
};

const REVIEWS = {
  positive: {
    _id: ID.review1,
    userId: ID.user1,
    restaurantId: ID.rest1,
    orderId: ID.order1,
    rating: 5,
    title: "Excelente servicio",
    comment: "La comida llegó caliente y en buen estado.",
    tags: ["recomendado", "buen-servicio"],
    restaurantResponse: null,
    helpfulVotes: [],
    createdAt: new Date("2025-06-01T12:00:00Z"),
  },
};

const VALID_TRANSITIONS = {
  pending:           ["confirmed", "cancelled"],
  confirmed:         ["preparing", "cancelled"],
  preparing:         ["ready_for_pickup", "cancelled"],
  ready_for_pickup:  ["picked_up"],
  picked_up:         ["delivered"],
  delivered:         [],
  cancelled:         [],
};

module.exports = {
  ID, USERS, RESTAURANTS, MENU_ITEMS, DELIVERY_ZONES,
  CARTS, ORDERS, REVIEWS, VALID_TRANSITIONS,
};
