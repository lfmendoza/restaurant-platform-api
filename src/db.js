const { MongoClient, GridFSBucket } = require("mongodb");
require("dotenv").config();

const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || "restaurant_orders";
const useReadReplicas = process.env.USE_READ_REPLICAS === "true";

let client;
let db;
let imagesBucket;

let readClient;
let readDb;

async function connect() {
  if (client) return { client, db, imagesBucket };

  client = new MongoClient(uri, {
    retryWrites: true,
    w: "majority",
  });

  await client.connect();
  db = client.db(dbName);
  imagesBucket = new GridFSBucket(db, { bucketName: "images" });

  const { ensureSearchIndexes } = require("./ensureIndexes");
  await ensureSearchIndexes(db);

  console.log(`Connected to MongoDB Atlas — database: ${dbName}`);

  if (useReadReplicas) {
    readClient = new MongoClient(uri, {
      readPreference: "secondaryPreferred",
    });
    await readClient.connect();
    readDb = readClient.db(dbName);
    console.log("Read replica connection established (secondaryPreferred)");
  }

  return { client, db, imagesBucket };
}

function getDb() {
  if (!db) throw new Error("Database not connected. Call connect() first.");
  return db;
}

function getReadDb() {
  if (useReadReplicas && readDb) return readDb;
  return getDb();
}

function getBucket() {
  if (!imagesBucket) throw new Error("GridFS bucket not initialized.");
  return imagesBucket;
}

function getClient() {
  if (!client) throw new Error("MongoDB client not initialized.");
  return client;
}

module.exports = { connect, getDb, getReadDb, getBucket, getClient };
