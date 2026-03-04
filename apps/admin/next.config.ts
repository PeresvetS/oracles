import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@oracle/shared'],
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
};

export default nextConfig;
