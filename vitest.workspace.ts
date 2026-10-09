import { defineWorkspace } from "vitest/config";

// Every workspace package that can hold a spec. `pnpm -r test` runs each
// package's own `test` script (using its local config); this file lets a single
// `vitest` invoked from the repository root collect the same projects.
export default defineWorkspace([
  "packages/sdk/vitest.config.ts",
  "packages/attestar-client/vitest.config.ts",
  "packages/usdc-client/vitest.config.ts",
  "apps/web/vitest.config.ts",
]);
