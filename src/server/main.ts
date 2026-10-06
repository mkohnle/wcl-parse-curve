import { fileURLToPath } from "node:url";
import compression from "compression";
import express from "express";
import { config } from "./config.ts";
import { api } from "./routes/index.ts";

const app = express();
app.use(compression());
app.use("/api", api);

// In dev the client is served by Vite, which proxies /api to this server.
if (!config.dev) {
  app.use(
    express.static(fileURLToPath(new URL("../../dist/client", import.meta.url)), {
      setHeaders(res, path) {
        // hashed file names never change; everything else (index.html) is checked on every visit
        res.setHeader(
          "Cache-Control",
          /[\\/]assets[\\/]/.test(path) ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    }),
  );
}

app.listen(config.port, () => {
  console.log(config.dev ? `API on http://localhost:${config.port}` : `http://localhost:${config.port}`);
});
