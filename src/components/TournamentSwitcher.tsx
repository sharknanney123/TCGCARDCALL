"use client";

import { useTransition } from "react";
import { switchTournament } from "@/app/actions";

export default function TournamentSwitcher({
  tournaments,
  currentId,
}: {
  tournaments: { id: string; name: string }[];
  currentId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  if (tournaments.length < 2) return null;

  return (
    <select
      className="bg-panel border border-edge rounded-lg px-2 py-1 text-sm text-parchment max-w-[160px]"
      value={currentId ?? undefined}
      disabled={pending}
      aria-label="Switch tournament"
      onChange={(e) => startTransition(async () => { await switchTournament(e.target.value); })}
    >
      {tournaments.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}
