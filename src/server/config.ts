function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

const dev = process.argv.includes("--dev");

export const config = {
  dev,
  // In dev, Vite owns 3000 and proxies /api to 3001 (see vite.config.ts).
  port: Number(process.env.PORT) || (dev ? 3001 : 3000),
  wclBaseUrl: process.env.WCL_BASE_URL || "https://www.warcraftlogs.com",
  wclClientId: required("WCL_CLIENT_ID"),
  wclClientSecret: required("WCL_CLIENT_SECRET"),
};

export const hasWclCredentials = () => Boolean(config.wclClientId && config.wclClientSecret);
