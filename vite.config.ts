import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const SERVER_PORT = Number(process.env.LAUNCHPAGE_PORT ?? 4710);

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 4711,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${SERVER_PORT}` },
  },
});
