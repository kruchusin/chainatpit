import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.js'],
        },
      },
      {
        test: {
          name: 'rules',
          environment: 'node',
          include: ['tests/rules/**/*.test.js'],
          fileParallelism: false,
          testTimeout: 20000,
          hookTimeout: 20000,
        },
      },
    ],
  },
});
