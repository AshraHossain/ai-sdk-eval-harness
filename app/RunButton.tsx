"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RunButton({ suite }: { suite: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suite, runs: 5 }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={run} disabled={busy} aria-label={`Run ${suite} suite`}>
        {busy ? "Running…" : "Run suite"}
      </button>
      {error && <div className="err" role="alert">{error}</div>}
    </div>
  );
}
