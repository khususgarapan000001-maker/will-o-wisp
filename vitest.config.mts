import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.dirname(fileURLToPath(import.meta.url)),
    },
  },
  test: {
    // Node environment by default: lib/ tests (incl. WebCrypto, which Node
    // provides natively) run here. Component tests opt into jsdom per file
    // with a `// @vitest-environment jsdom` pragma.
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/property/**/*.test.{ts,tsx}"],
    // Property-based tests: >=100 iterations locally (design-doc §9.1).
    testTimeout: 30_000,
  },
});
