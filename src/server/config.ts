const dev = process.argv.includes("--dev");

export const config = {
  dev,
  // dev: Vite on 3000 proxies /api to 3001
  port: Number(process.env.PORT) || (dev ? 3001 : 3000),
  wclBaseUrl: process.env.WCL_BASE_URL || "https://www.warcraftlogs.com",
  // optional: without them only the demo works
  wclClientId: process.env.WCL_CLIENT_ID ?? "",
  wclClientSecret: process.env.WCL_CLIENT_SECRET ?? "",
  // optional: shows the API budget to whoever has it (see /?admin=…)
  adminToken: process.env.ADMIN_TOKEN ?? "",
};

export const hasWclCredentials = () => Boolean(config.wclClientId && config.wclClientSecret);
