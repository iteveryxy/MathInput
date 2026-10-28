import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    reporters: ['default', 'json'],
    outputFile: { json: 'reports/unit-results.json' },
  },
});
