import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  envPrefix: "VITE_PUBLIC_",
  server: {
    host: "127.0.0.1",
    port: 4317,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4318" },
    fs: {
      strict: true,
      deny: [
        "**/.dev.vars",
        "**/.dev.vars.*",
        "**/.env",
        "**/.env.*",
        "**/*.pem",
        "**/*.key",
        "**/.git/**",
      ],
    },
  },
  build: { sourcemap: false },
});
