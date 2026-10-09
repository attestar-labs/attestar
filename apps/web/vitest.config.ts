import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    alias: {
      // Resolve the workspace SDK to its source so specs that import
      // prover-browser run without a prior `@attestar/sdk` build (its package
      // entry points at dist/, which does not exist on a clean checkout).
      "@attestar/sdk": path.resolve(__dirname, "../../packages/sdk/src/index.ts"),
      "@": path.resolve(__dirname, "./"),
    },
  },
});
