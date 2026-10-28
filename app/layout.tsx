import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI SDK Eval Harness',
  description: 'Golden-dataset evals with deterministic and LLM-as-judge scorers, N-run flaky detection and a CI gate.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
