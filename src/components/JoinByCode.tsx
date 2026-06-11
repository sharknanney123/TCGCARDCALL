"use client";

import { useState, useTransition } from "react";
import { joinByCode } from "@/app/actions";

export default function JoinByCode() {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="panel p-3 flex items-center gap-2 flex-wrap">
      <p className="text-sm text-faded">Have an invite code for a private tournament?</p>
      <input className="input w-32 font-mono uppercase" placeholder="e.g. K7XQ2M"
             value={code} onChange={(e) => setCode(e.target.value)} />
      <button className="btn-ghost" disabled={pending || !code.trim()}
        onClick={() => startTransition(async () => {
          const res = await joinByCode(code);
          setMsg({ ok: res.ok, text: res.message });
          if (res.ok) setCode("");
        })}>
        {pending ? "Joining…" : "Join"}
      </button>
      {msg && <p className={`text-sm ${msg.ok ? "text-jade" : "text-ember"}`}>{msg.text}</p>}
    </div>
  );
}
