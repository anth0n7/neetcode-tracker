import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is deliberately OFF. This app must always show live data
  // (what is due today changes by the day), so every route should run fresh on
  // each request. With the flag off, route handlers are never cached by default.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
