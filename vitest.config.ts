import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirror the tsconfig "@/*" path so route handlers can be unit-tested.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    // unit: pure functions. integration: route handlers, CLI, middleware, file I/O. All offline.
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "evals/**/*.ts", "app/api/**/*.ts", "middleware.ts", "scripts/**/*.ts"],
      reporter: ["text", "json-summary"],
      // Every file must clear the bar on its own; a high average cannot hide an untested file.
      thresholds: { perFile: true, lines: 95, statements: 95, functions: 95, branches: 95 },
    },
  },
});
