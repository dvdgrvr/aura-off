import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 3000,
    open: true,
  },
  preview: {
    host: true,
    port: 4173,
  },
});