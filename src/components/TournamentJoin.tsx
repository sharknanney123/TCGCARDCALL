"use client";

import { useState, useTransition } from "react";
import { joinTournament, switchTournament } from "@/app/actions";

export default function TournamentJoin({
  seasonId,
  joined,
  viewing,
}: {
  seasonId: string;
  joined: boolean;
  viewing: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function act(fn: (id: string) => Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn(seasonId);
      if (!res.ok) setMsg(res.message);
    });
  }

  return (
    <div className="space-y-1">
      {viewing ? (
        <span className="chip text-jade border-jade/40">Currently viewing</span>
      ) : joined ? (
        <button className="btn-ghost" disabled={pending} onClick={() => act(switchTournament)}>
          {pending ? "Switching…" : "Switch to view"}
        </button>
      ) : (
        <button className="btn-gold" disabled={pending} onClick={() => act(joinTournament)}>
          {pending ? "Joining…" : "Join tournament"}
        </button>
      )}
      {msg && <p className="text-xs text-ember">{msg}</p>}
    </div>
  );
}
