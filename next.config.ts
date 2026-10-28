import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Eval datasets and reports are read from disk at request time.
  outputFileTracingIncludes: {
    '/api/eval': ['./evals/datasets/**/*', './evals/gate.config.json', './evals/baselines/**/*'],
    '/': ['./evals/datasets/**/*', './reports/latest.json'],
  },
};

export default nextConfig;
