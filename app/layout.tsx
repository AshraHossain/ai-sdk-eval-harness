import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI SDK Eval Harness",
  description: "Golden datasets, scorers, flaky detection and a CI gate for AI SDK features.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
