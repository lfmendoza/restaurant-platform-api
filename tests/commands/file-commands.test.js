jest.mock("../../src/db");

const { getDb, getBucket } = require("../../src/db");
const FileCommands = require("../../src/commands/FileCommands");
const { setupMockDb } = require("../helpers/mock-db");
const { ID } = require("../helpers/fixtures");
const { EventEmitter } = require("events");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb, null, getBucket));
});

describe("FileCommands.upload — validation", () => {
  it("throws 400 when no file provided", async () => {
    await expect(FileCommands.upload(null, {}))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when file lacks buffer or mimetype", async () => {
    await expect(FileCommands.upload({ originalname: "x.jpg" }, {}))
      .rejects.toMatchObject({ statusCode: 400, message: /buffer.*mimetype/i });
  });

  it("throws 400 on invalid menuItemId format", async () => {
    const file = { originalname: "x.jpg", mimetype: "image/jpeg", buffer: Buffer.from("f"), size: 1 };
    const mockStream = new EventEmitter();
    mockStream.id = ID.file1;
    mockStream.end = jest.fn(() => process.nextTick(() => mockStream.emit("finish")));
    getBucket().openUploadStream.mockReturnValue(mockStream);

    await expect(FileCommands.upload(file, { menuItemId: "bad-id" }))
      .rejects.toMatchObject({ statusCode: 400, message: /menuItemId/ });
  });
});

describe("FileCommands.delete — validation", () => {
  it("throws 400 on invalid fileId", async () => {
    await expect(FileCommands.delete("bad"))
      .rejects.toMatchObject({ statusCode: 400, message: /fileId/ });
  });
});

describe("FileCommands.upload", () => {

  it("uploads to GridFS and returns file info", async () => {
    const mockStream = new EventEmitter();
    mockStream.id = ID.file1;
    mockStream.end = jest.fn(() => {
      process.nextTick(() => mockStream.emit("finish"));
    });

    getBucket().openUploadStream.mockReturnValue(mockStream);

    const file = {
      originalname: "photo.jpg",
      mimetype: "image/jpeg",
      buffer: Buffer.from("fake"),
      size: 4,
    };

    const result = await FileCommands.upload(file, {});

    expect(result.fileId).toEqual(ID.file1);
    expect(result.filename).toBe("photo.jpg");
    expect(result.url).toBe(`/files/${ID.file1}`);
  });

  it("updates menu_items.imageFileId when menuItemId provided", async () => {
    const mockStream = new EventEmitter();
    mockStream.id = ID.file1;
    mockStream.end = jest.fn(() => {
      process.nextTick(() => mockStream.emit("finish"));
    });
    getBucket().openUploadStream.mockReturnValue(mockStream);
    col("menu_items").updateOne.mockResolvedValue({ matchedCount: 1 });

    const file = { originalname: "x.jpg", mimetype: "image/jpeg", buffer: Buffer.from("f"), size: 1 };
    await FileCommands.upload(file, { menuItemId: ID.item1.toString() });

    const update = col("menu_items").updateOne.mock.calls[0][1];
    expect(update.$set.imageFileId).toEqual(ID.file1);
  });
});

describe("FileCommands.delete", () => {
  it("deletes from GridFS and unlinks references", async () => {
    getBucket().delete.mockResolvedValue(undefined);
    col("menu_items").updateMany.mockResolvedValue({ modifiedCount: 1 });
    col("restaurants").updateMany.mockResolvedValue({ modifiedCount: 0 });

    const result = await FileCommands.delete(ID.file1.toString());

    expect(result.deleted).toBe(true);
    expect(getBucket().delete).toHaveBeenCalled();

    const menuUpdate = col("menu_items").updateMany.mock.calls[0][1];
    expect(menuUpdate.$unset.imageFileId).toBe("");
  });
});
