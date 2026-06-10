"use client";

import { useState, useTransition } from "react";
import {
  runPriceUpdate, endSeason, startSeason, importCsv, setCardActive, type ActionResult,
} from "@/app/actions";

function useFeedback() {
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) => start(async () => setMsg(await fn()));
  return { msg, pending, run };
}

function Feedback({ msg }: { msg: ActionResult | null }) {
  if (!msg) return null;
  return <p className={`text-sm ${msg.ok ? "text-jade" : "text-ember"}`}>{msg.message}</p>;
}

export function RunPriceUpdateButton() {
  const { msg, pending, run } = useFeedback();
  return (
    <div className="space-y-2">
      <button className="btn-gold" disabled={pending} onClick={() => run(runPriceUpdate)}>
        {pending ? "Fetching Scryfall prices…" : "Run price update now"}
      </button>
      <Feedback msg={msg} />
    </div>
  );
}

export function EndSeasonButton() {
  const { msg, pending, run } = useFeedback();
  const [armed, setArmed] = useState(false);
  return (
    <div className="space-y-2">
      {!armed ? (
        <button className="btn-ghost" onClick={() => setArmed(true)}>End current season…</button>
      ) : (
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-sm text-ember">Liquidates all positions and archives standings. Sure?</span>
          <button className="btn-sell" disabled={pending} onClick={() => run(endSeason)}>
            {pending ? "Ending…" : "Yes, end season"}
          </button>
          <button className="btn-ghost" onClick={() => setArmed(false)}>Cancel</button>
        </div>
      )}
      <Feedback msg={msg} />
    </div>
  );
}

export function StartSeasonForm() {
  const { msg, pending, run } = useFeedback();
  const [name, setName] = useState("");
  const [days, setDays] = useState("30");
  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <input className="input max-w-xs" placeholder="Season name (e.g. Season 2)"
               value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input w-24" type="number" min="7" max="60" value={days}
               onChange={(e) => setDays(e.target.value)} aria-label="Length in days" />
        <button className="btn-gold" disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("name", name); fd.set("days", days);
            run(() => startSeason(fd));
          }}>
          {pending ? "Starting…" : "Start season"}
        </button>
      </div>
      <Feedback msg={msg} />
    </div>
  );
}

export function CsvUploadForm() {
  const { msg, pending, run } = useFeedback();
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center flex-wrap">
        <input className="input max-w-xs" type="file" accept=".csv"
               onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button className="btn-ghost" disabled={pending || !file}
          onClick={() => {
            if (!file) return;
            const fd = new FormData();
            fd.set("file", file);
            run(() => importCsv(fd));
          }}>
          {pending ? "Importing…" : "Import CSV"}
        </button>
      </div>
      <p className="text-xs text-faded">
        Columns: scryfall_id, card_name, set_name, image_url, category, finish, current_price,
        previous_price, price_date. Price columns optional — use this to import the pool, fix bad
        prices, or unblock testing if the Scryfall job fails.
      </p>
      <Feedback msg={msg} />
    </div>
  );
}

export function CardToggle({ cardId, active }: { cardId: string; active: boolean }) {
  const { msg, pending, run } = useFeedback();
  return (
    <div>
      <button className={`chip ${active ? "text-ember border-ember/40" : "text-jade border-jade/40"}`}
        disabled={pending}
        onClick={() => run(() => setCardActive(cardId, !active))}>
        {pending ? "…" : active ? "Disable buys" : "Re-enable"}
      </button>
      <Feedback msg={msg} />
    </div>
  );
}
