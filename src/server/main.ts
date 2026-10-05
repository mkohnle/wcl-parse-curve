import { fileURLToPath } from "node:url";
import express from "express";
import { api } from "./api.ts";
import { config } from "./config.ts";

const app = express();
app.use("/api", api);

// In dev the client is served by Vite, which proxies /api to this server.
if (!config.dev) {
  app.use(express.static(fileURLToPath(new URL("../../dist/client", import.meta.url))));
}

app.listen(config.port, () => {
  console.log(config.dev ? `API on http://localhost:${config.port}` : `http://localhost:${config.port}`);
});
