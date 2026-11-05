import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// SITE_BASE lets the same site be served at "/" or under a sub-path (e.g. "/landing/").
export default defineConfig({
  base: process.env.SITE_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  build: { outDir: process.env.SITE_OUT_DIR ?? "dist", emptyOutDir: true },
});
