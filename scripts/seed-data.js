// seed-data.js
// Seed de datos: 500 restaurantes, 50,000+ menu_items, usuarios, zonas, etc.
// Ejecutar: mongosh <connection_string> scripts/seed-data.js

const db = db.getSiblingDB("restaurant_orders");

const NUM_RESTAURANTS = 500;
const ITEMS_PER_RESTAURANT = 100;
const NUM_USERS = 200;

const categories = ["Entradas", "Platos Principales", "Postres", "Bebidas", "Ensaladas", "Sopas"];
const cuisines = ["italiana", "mexicana", "japonesa", "china", "americana", "francesa", "guatemalteca", "peruana", "tailandesa", "india"];
const allergens_pool = ["gluten", "lácteos", "huevo", "maní", "soya", "mariscos"];
const dishNames = [
  "Pizza Margherita", "Pasta Carbonara", "Hamburguesa Clásica", "Ensalada César",
  "Sopa de Tomate", "Tacos al Pastor", "Pollo a la Parrilla", "Sushi Roll",
  "Pad Thai", "Burrito Supreme", "Ceviche Mixto", "Risotto de Hongos",
  "Fish & Chips", "Chow Mein", "Curry Rojo", "Falafel Wrap",
  "Tiramisú", "Brownie", "Flan", "Helado Artesanal",
  "Café Americano", "Té Verde", "Limonada", "Agua Mineral",
  "Nachos", "Quesadilla", "Empanadas", "Guacamole", "Tostadas", "Churros"
];

// ========== SEED USERS ==========
print("Seeding users...");
const userOps = [];
for (let i = 0; i < NUM_USERS; i++) {
  userOps.push({ insertOne: { document: {
    email: `user${i}@example.com`,
    name: `Usuario ${i}`,
    phone: `+502 ${5000 + i}`,
    role: "customer",
    defaultAddress: {
      street: `${i}a Avenida ${i}-${i * 2}`,
      city: "Guatemala",
      zone: `Zona ${(i % 15) + 1}`,
      coordinates: { type: "Point", coordinates: [-90.5 + (Math.random() * 0.1 - 0.05), 14.6 + (Math.random() * 0.1 - 0.05)] }
    },
    orderHistory: [],
    favoriteRestaurants: [],
    createdAt: new Date(),
    updatedAt: new Date()
  }}});
}
db.users.bulkWrite(userOps, { ordered: false });
print(`Users inserted: ${db.users.countDocuments()}`);

// ========== SEED RESTAURANTS ==========
print("Seeding restaurants...");
const restOps = [];
for (let i = 0; i < NUM_RESTAURANTS; i++) {
  const lng = -90.6 + (Math.random() * 0.3);
  const lat = 14.5 + (Math.random() * 0.2);
  restOps.push({ insertOne: { document: {
    name: `Restaurante ${dishNames[i % dishNames.length].split(" ")[0]} #${i}`,
    description: `Restaurante especializado #${i}`,
    location: { type: "Point", coordinates: [lng, lat] },
    address: { street: `Calle ${i}`, city: "Guatemala", zone: `Zona ${(i % 15) + 1}` },
    operatingHours: {
      monday: { open: "10:00", close: "22:00" }, tuesday: { open: "10:00", close: "22:00" },
      wednesday: { open: "10:00", close: "22:00" }, thursday: { open: "10:00", close: "22:00" },
      friday: { open: "10:00", close: "23:00" }, saturday: { open: "11:00", close: "23:00" },
      sunday: { open: "11:00", close: "21:00" }
    },
    cuisineTypes: [cuisines[i % cuisines.length], cuisines[(i + 3) % cuisines.length]],
    tags: i % 3 === 0 ? ["pet-friendly", "wifi"] : ["terraza"],
    isActive: true,
    isAcceptingOrders: true,
    logoFileId: null,
    menuItemCount: NumberInt(ITEMS_PER_RESTAURANT),
    createdAt: new Date(),
    updatedAt: new Date()
  }}});
}
db.restaurants.bulkWrite(restOps, { ordered: false });
print(`Restaurants inserted: ${db.restaurants.countDocuments()}`);

// ========== SEED DELIVERY ZONES ==========
print("Seeding delivery zones...");
const restaurantIds = db.restaurants.find({}, { _id: 1 }).toArray().map(r => r._id);
const zoneOps = [];
for (const rid of restaurantIds) {
  const rest = db.restaurants.findOne({ _id: rid });
  const lng = rest.location.coordinates[0];
  const lat = rest.location.coordinates[1];
  const offset = 0.02;
  zoneOps.push({ insertOne: { document: {
    restaurantId: rid,
    zoneName: "Zona Centro (3 km)",
    area: { type: "Polygon", coordinates: [[[lng - offset, lat - offset], [lng + offset, lat - offset], [lng + offset, lat + offset], [lng - offset, lat + offset], [lng - offset, lat - offset]]] },
    deliveryFee: 15.00,
    estimatedMinutes: NumberInt(25),
    isActive: true
  }}});
}
db.delivery_zones.bulkWrite(zoneOps, { ordered: false });
print(`Delivery zones inserted: ${db.delivery_zones.countDocuments()}`);

// ========== SEED MENU ITEMS (50,000+) ==========
print("Seeding menu items (50,000+)...");
const BATCH_SIZE = 5000;
let totalInserted = 0;
for (let batch = 0; batch < Math.ceil(restaurantIds.length / (BATCH_SIZE / ITEMS_PER_RESTAURANT)); batch++) {
  const itemOps = [];
  const startIdx = batch * (BATCH_SIZE / ITEMS_PER_RESTAURANT);
  const endIdx = Math.min(startIdx + (BATCH_SIZE / ITEMS_PER_RESTAURANT), restaurantIds.length);

  for (let r = startIdx; r < endIdx; r++) {
    const rid = restaurantIds[r];
    for (let i = 0; i < ITEMS_PER_RESTAURANT; i++) {
      const nameIdx = (r * ITEMS_PER_RESTAURANT + i) % dishNames.length;
      itemOps.push({ insertOne: { document: {
        restaurantId: rid,
        name: `${dishNames[nameIdx]} v${i}`,
        description: `Delicioso ${dishNames[nameIdx].toLowerCase()} preparado con ingredientes frescos`,
        price: Math.round((Math.random() * 150 + 25) * 100) / 100,
        category: categories[Math.floor(Math.random() * categories.length)],
        allergens: allergens_pool.slice(0, Math.floor(Math.random() * 3)),
        tags: [],
        available: Math.random() > 0.05,
        preparationTimeMin: NumberInt(Math.floor(Math.random() * 30) + 10),
        imageFileId: null,
        salesCount: NumberInt(Math.floor(Math.random() * 100)),
        createdAt: new Date(),
        updatedAt: new Date()
      }}});
    }
  }

  if (itemOps.length > 0) {
    const result = db.menu_items.bulkWrite(itemOps, { ordered: false });
    totalInserted += result.insertedCount;
    print(`  Batch ${batch + 1}: inserted ${result.insertedCount} items`);
  }
}
print(`Total menu_items inserted: ${db.menu_items.countDocuments()}`);

// ========== SUMMARY ==========
print("\n=== SEED COMPLETE ===");
db.getCollectionNames().forEach(function(coll) {
  print(`${coll}: ${db.getCollection(coll).countDocuments()} documents`);
});
