import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const frontendPort = parseInt(process.env.FRONTEND_PORT || "5173", 10);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: frontendPort,
    host: true, // listen on 0.0.0.0 so accessible from network (e.g. PM2 on server)
  },
});
