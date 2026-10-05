import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/client",
  plugins: [tailwindcss()],
  server: {
    port: 3000,
    strictPort: true,
    // `pnpm dev` runs the API server separately on 3001
    // trailing slash matters: "/api" would also catch the client module /api.ts
    proxy: { "/api/": "http://localhost:3001" },
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
});
