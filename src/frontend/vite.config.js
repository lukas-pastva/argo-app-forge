import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  /* be 100 % sure there is only ONE copy of React */
  resolve: {
    dedupe: ["react", "react-dom"],
    preserveSymlinks: false,
  },

  build: {
    /* 👇  TDZ disappears as soon as we skip the minifier */
    minify: false,

    sourcemap: true,
    rollupOptions: {
      /* one-chunk build = predictable execution order */
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
