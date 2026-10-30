// vite.config.ts
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    fs: {
      // Allow importing repo-level docs (e.g. ../docs/Q&A.md) into the app.
      allow: [path.resolve(__dirname, "..")],
    },
  },
});
