const { ObjectId } = require("mongodb");

function createCursor(data = []) {
  const cursor = {};
  cursor.sort = jest.fn(() => cursor);
  cursor.skip = jest.fn(() => cursor);
  cursor.limit = jest.fn(() => cursor);
  cursor.project = jest.fn(() => cursor);
  cursor.toArray = jest.fn().mockResolvedValue(data);
  return cursor;
}

function createMockCollection() {
  return {
    find: jest.fn(() => createCursor([])),
    findOne: jest.fn().mockResolvedValue(null),
    insertOne: jest.fn().mockResolvedValue({ insertedId: new ObjectId() }),
    insertMany: jest.fn().mockResolvedValue({ insertedCount: 0 }),
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    updateMany: jest.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    aggregate: jest.fn(() => createCursor([])),
    distinct: jest.fn().mockResolvedValue([]),
    countDocuments: jest.fn().mockResolvedValue(0),
    bulkWrite: jest.fn().mockResolvedValue({
      insertedCount: 0, modifiedCount: 0, deletedCount: 0, upsertedCount: 0,
    }),
    watch: jest.fn().mockReturnValue({ on: jest.fn() }),
  };
}

function setupMockDb(getDb, getClient, getBucket, getReadDb) {
  const cols = {};

  function col(name) {
    if (!cols[name]) cols[name] = createMockCollection();
    return cols[name];
  }

  const mockDb = {
    collection: jest.fn((name) => col(name)),
  };

  getDb.mockReturnValue(mockDb);

  if (getReadDb) {
    getReadDb.mockReturnValue(mockDb);
  }

  if (getClient) {
    getClient.mockReturnValue({
      startSession: jest.fn(() => ({
        withTransaction: jest.fn(async (fn) => await fn()),
        endSession: jest.fn(),
      })),
    });
  }

  if (getBucket) {
    getBucket.mockReturnValue({
      openUploadStream: jest.fn(),
      openDownloadStream: jest.fn(),
      delete: jest.fn(),
    });
  }

  return { mockDb, col, cols };
}

module.exports = { createCursor, createMockCollection, setupMockDb };
