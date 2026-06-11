"use client";

import { useState } from "react";

export default function HowItWorks() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <section className="panel p-4 border-gold/40 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-gold uppercase tracking-[0.25em]">How TCGCardCall works</p>
        <button className="text-faded hover:text-parchment text-sm" aria-label="Dismiss"
          onClick={() => { document.cookie = "tcc_onboarded=1; path=/; max-age=31536000"; setHidden(true); }}>
          Got it ✕
        </button>
      </div>
      <ol className="text-sm space-y-1.5 list-decimal list-inside">
        <li><span className="text-parchment">Orders fill at the <strong>next daily price update</strong></span>
          <span className="text-faded"> — not at the price you see now. You can&apos;t react to spikes; you can only predict them. That&apos;s the game.</span></li>
        <li><span className="text-parchment">One price update per day</span>
          <span className="text-faded"> — real market prices land every morning, fills and rankings update with them. Check in daily.</span></li>
        <li><span className="text-parchment">Trade at least 3 different cards to get ranked</span>
          <span className="text-faded"> — and watch the per-tournament fee, daily order limit, and per-card cap in the trade window.</span></li>
      </ol>
    </section>
  );
}
