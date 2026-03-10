const { MongoClient, GridFSBucket } = require("mongodb");
require("dotenv").config();

const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || "restaurant_orders";

let client;
let db;
let imagesBucket;

async function connect() {
  if (client) return { client, db, imagesBucket };

  client = new MongoClient(uri, {
    retryWrites: true,
    w: "majority",
  });

  await client.connect();
  db = client.db(dbName);
  imagesBucket = new GridFSBucket(db, { bucketName: "images" });

  console.log(`Connected to MongoDB Atlas — database: ${dbName}`);
  return { client, db, imagesBucket };
}

function getDb() {
  if (!db) throw new Error("Database not connected. Call connect() first.");
  return db;
}

function getBucket() {
  if (!imagesBucket) throw new Error("GridFS bucket not initialized.");
  return imagesBucket;
}

function getClient() {
  if (!client) throw new Error("MongoDB client not initialized.");
  return client;
}

module.exports = { connect, getDb, getBucket, getClient };
