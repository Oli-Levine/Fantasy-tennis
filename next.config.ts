import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Results entry moved out of /admin so team captains can use it too.
  async redirects() {
    return [{ source: "/admin/results", destination: "/results", permanent: false }];
  },
};

export default nextConfig;
