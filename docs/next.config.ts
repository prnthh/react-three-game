import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  // fix because this is on prnth.com/react-three-game
  basePath: '/react-three-game',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
