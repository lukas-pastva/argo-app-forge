import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite / Rollup occasionally trips a temporal-dead-zone (TDZ) bug
 * when React ends up duplicated or when dynamic-import chunks are
 * executed in the “wrong” order.  The tweaks below force Vite to
 * bundle a **single** copy of React *and* keep every module in one
 * chunk, eliminating the out-of-order execution that produced
 * the  “Cannot access 'Et' before initialization” error.
 */
export default defineConfig({
  plugins: [react()],

  /* ── make absolutely sure there is only ONE React in the bundle ── */
  resolve: {
    dedupe: ["react", "react-dom"],
    preserveSymlinks: false
  },

  /* ── roll the whole SPA into one chunk so execution order is safe ── */
  build: {
    sourcemap: true,              // nicer stack-traces if something else breaks
    rollupOptions: {
      output: {
        inlineDynamicImports: true   // ⇒ no code-splitting, no TDZ traps
      }
    }
  }
});
