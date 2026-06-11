"use client";

import { useState, useTransition } from "react";
import { joinTournament, switchTournament } from "@/app/actions";

export default function TournamentJoin({
  seasonId, joined, viewing, isPrivate = false,
}: {
  seasonId: string; joined: boolean; viewing: boolean; isPrivate?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [code, setCode] = useState("");

  function join() {
    setMsg(null);
    startTransition(async () => {
      const res = await joinTournament(seasonId, isPrivate ? code : undefined);
      if (!res.ok) setMsg(res.message);
    });
  }
  function switchTo() {
    setMsg(null);
    startTransition(async () => {
      const res = await switchTournament(seasonId);
      if (!res.ok) setMsg(res.message);
    });
  }

  return (
    <div className="space-y-1">
      {viewing ? (
        <span className="chip text-jade border-jade/40">Currently viewing</span>
      ) : joined ? (
        <button className="btn-ghost" disabled={pending} onClick={switchTo}>
          {pending ? "Switching…" : "Switch to view"}
        </button>
      ) : (
        <div className="flex gap-2 items-center">
          {isPrivate && (
            <input className="input w-28 font-mono uppercase" placeholder="Code"
                   value={code} onChange={(e) => setCode(e.target.value)} />
          )}
          <button className="btn-gold" disabled={pending || (isPrivate && !code.trim())} onClick={join}>
            {pending ? "Joining…" : "Join"}
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-ember">{msg}</p>}
    </div>
  );
}
