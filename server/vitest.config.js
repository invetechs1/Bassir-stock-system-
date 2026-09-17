import { defineConfig } from 'vitest/config';

// Force an isolated in-memory DB and test env for the whole suite.
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-key-1234567890';

export default defineConfig({
  test: {
    environment: 'node',
    // The shared in-memory SQLite connection must not be reset between files.
    fileParallelism: false,
    globals: false
  }
});
