"use client";

import { useTransition } from "react";
import { toggleWatch } from "@/app/actions";

export default function WatchButton({ cardId, watched }: { cardId: string; watched: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      className={`chip ${watched ? "text-gold border-gold/50 bg-gold/10" : "text-faded border-edge hover:text-parchment"}`}
      disabled={pending}
      onClick={() => startTransition(() => toggleWatch(cardId, watched))}
      aria-pressed={watched}
    >
      {watched ? "★ Watching" : "☆ Watch"}
    </button>
  );
}
