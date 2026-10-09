import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.{test,spec}.ts"],
    passWithNoTests: true,
  },
});
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.{test,spec}.ts"],
    passWithNoTests: true,
  },
});
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.{test,spec}.ts"],
    passWithNoTests: true,
  },
});
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.{test,spec}.ts"],
    passWithNoTests: true,
  },
});
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.{test,spec}.ts"],
    passWithNoTests: true,
  },
});
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.{test,spec}.ts"],
    passWithNoTests: true,
  },
});
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.{test,spec}.ts"],
    passWithNoTests: true,
  },
});
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.{test,spec}.ts"],
    passWithNoTests: true,
  },
});
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The SDK is authored as NodeNext ESM, so relative imports carry a `.js`
    // extension even though the files on disk are `.ts`. Let Vitest resolve
    // those specifiers back to the TypeScript sources under test.
    alias: [{ find: /^(\.\.?\/.*)\.js$/, replacement: "$1" }],
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
