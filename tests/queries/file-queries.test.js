jest.mock("../../src/db");

const { getDb, getReadDb, getBucket } = require("../../src/db");
const FileQueries = require("../../src/queries/FileQueries");
const { setupMockDb, createCursor } = require("../helpers/mock-db");
const { ID } = require("../helpers/fixtures");

let col;

beforeEach(() => {
  ({ col } = setupMockDb(getDb, null, getBucket, getReadDb));
});

describe("FileQueries.getById", () => {
  it("returns file info from images.files collection", async () => {
    const fileInfo = {
      _id: ID.file1,
      filename: "photo.jpg",
      contentType: "image/jpeg",
      length: 1024,
    };
    col("images.files").findOne.mockResolvedValue(fileInfo);

    const result = await FileQueries.getById(ID.file1.toString());

    expect(result.filename).toBe("photo.jpg");
    expect(result.contentType).toBe("image/jpeg");
  });

  it("throws 404 when file not found", async () => {
    col("images.files").findOne.mockResolvedValue(null);

    await expect(FileQueries.getById(ID.file1.toString()))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("FileQueries.getDownloadStream", () => {
  it("opens download stream from GridFS bucket", async () => {
    const mockStream = { pipe: jest.fn() };
    getBucket().openDownloadStream.mockReturnValue(mockStream);

    const stream = await FileQueries.getDownloadStream(ID.file1.toString());

    expect(stream).toBe(mockStream);
    expect(getBucket().openDownloadStream).toHaveBeenCalled();
  });
});

describe("FileQueries.list", () => {
  it("returns paginated file list with projection and enriched names", async () => {
    const files = [
      { _id: ID.file1, filename: "a.jpg", length: 100, restaurantName: "Bella Italia", menuItemName: "Pizza" },
    ];
    col("images.files").aggregate.mockReturnValue(createCursor(files));

    const result = await FileQueries.list({ skip: 0, limit: 10 });

    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("a.jpg");
    expect(col("images.files").aggregate).toHaveBeenCalled();
  });

  it("adds $match stages when restaurantName or menuItemName provided", async () => {
    col("images.files").aggregate.mockReturnValue(createCursor([]));

    await FileQueries.list({ restaurantName: "Bella", menuItemName: "Pizza" });

    const pipeline = col("images.files").aggregate.mock.calls[0][0];
    const matchStages = pipeline.filter((s) => s.$match);
    expect(matchStages.length).toBe(2);
    expect(matchStages.some((m) => m.$match.restaurantName?.$regex)).toBe(true);
    expect(matchStages.some((m) => m.$match.menuItemName?.$regex)).toBe(true);
  });
});
