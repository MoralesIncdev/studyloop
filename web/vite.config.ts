import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4601,
    proxy: {
      "/api": {
        target: "http://localhost:4600",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
