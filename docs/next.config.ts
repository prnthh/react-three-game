import type { NextConfig } from "next";
import { fileURLToPath } from 'node:url';

const isProd = process.env.NODE_ENV === 'production';
const basePath = isProd ? '/react-three-game' : '';

const nextConfig: NextConfig = {
  output: 'export',
  webpack(config) {
    // Source uses standard ESM .js paths; the docs app compiles the TS implementations.
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, '.js': ['.js', '.ts', '.tsx'] };
    // All demo imports must share the same scene contexts and component registry.
    for (const entry of ['index', 'core', 'viewer', 'editor']) {
      const name = entry === 'index' ? 'react-three-game$' : `react-three-game/${entry}$`;
      config.resolve.alias[name] = fileURLToPath(new URL(`../src/${entry}.ts`, import.meta.url));
    }
    config.resolve.alias['react-three-game/plugins/crashcat$'] = fileURLToPath(new URL('../src/plugins/crashcat/index.ts', import.meta.url));
    config.resolve.alias['react-three-game/plugins/crashcat/editor$'] = fileURLToPath(new URL('../src/plugins/crashcat/editor/index.tsx', import.meta.url));
    return config;
  },
  // fix because this is on prnth.com/react-three-game
  basePath,
  assetPrefix: basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
