import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for the production
  // Docker image — frontend/Dockerfile copies it and runs `node server.js`.
  output: "standalone",
};

export default nextConfig;
