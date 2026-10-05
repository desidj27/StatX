import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
  },
  serverExternalPackages: ["mongodb"],
  outputFileTracingRoot: path.join(__dirname, ".."),
  webpack: (config) => {
    // Parent src/ files (bot DB, plan, etc.) must resolve deps from web/node_modules on Vercel
    config.resolve.modules = [
      path.join(__dirname, "node_modules"),
      ...(config.resolve.modules || ["node_modules"]),
    ];
    return config;
  },
};

export default nextConfig;
