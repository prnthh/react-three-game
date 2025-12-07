import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  output: 'export',
  // fix because this is on prnth.com/react-three-game
  basePath: isProd ? '/react-three-game' : '',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
