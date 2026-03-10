module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  testPathIgnorePatterns: ["/node_modules/", "/tests/helpers/"],
  verbose: true,
  forceExit: true,
  testTimeout: 10000,
};
