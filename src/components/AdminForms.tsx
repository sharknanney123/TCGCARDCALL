"use client";

import { useState, useTransition } from "react";
import {
  runPriceUpdate, endSeason, startSeason, importCsv, setCardActive,
  createTournament, endTournament, type ActionResult,
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

export function CreateTournamentForm({ categories }: { categories: string[] }) {
  const { msg, pending, run } = useFeedback();
  const [f, setF] = useState({
    name: "", description: "", days: "30", starting_balance: "10000",
    fee_pct: "1", daily_order_limit: "10", position_cap: "2500",
    min_order: "10", max_players: "", pool_category: "", is_private: "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const Field = ({ k, label, type = "number", placeholder = "" }:
    { k: keyof typeof f; label: string; type?: string; placeholder?: string }) => (
    <label className="text-xs text-faded space-y-1">
      <span>{label}</span>
      <input className="input" type={type} value={f[k]} placeholder={placeholder}
             onChange={(e) => set(k, e.target.value)} />
    </label>
  );
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-2 max-w-2xl">
        <Field k="name" label="Tournament name" type="text" placeholder="e.g. Budget Brawl" />
        <Field k="days" label="Length (days)" />
        <Field k="starting_balance" label="Starting balance ($)" />
        <Field k="fee_pct" label="Trading fee (%)" />
        <Field k="daily_order_limit" label="Orders per day" />
        <Field k="min_order" label="Minimum order ($)" />
        <Field k="position_cap" label="Per-card cap ($, blank = none)" type="text" />
        <Field k="max_players" label="Max players (blank = unlimited)" type="text" />
        <label className="text-xs text-faded space-y-1 sm:col-span-2">
          <span>Card pool</span>
          <select className="input" value={f.pool_category}
                  onChange={(e) => set("pool_category", e.target.value)}>
            <option value="">All active cards</option>
            {categories.map((c) => (
              <option key={c} value={c}>Only category: {c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-faded flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" checked={f.is_private === "true"}
                 onChange={(e) => set("is_private", e.target.checked ? "true" : "")} />
          <span>Private — joinable only with an invite code (generated on creation)</span>
        </label>
        <label className="text-xs text-faded space-y-1 sm:col-span-2">
          <span>Description (shown on the tournaments page)</span>
          <input className="input" type="text" value={f.description}
                 onChange={(e) => set("description", e.target.value)} />
        </label>
      </div>
      <button className="btn-gold" disabled={pending}
        onClick={() => {
          const fd = new FormData();
          Object.entries(f).forEach(([k, v]) => fd.set(k, v));
          run(() => createTournament(fd));
        }}>
        {pending ? "Creating…" : "Create tournament"}
      </button>
      <Feedback msg={msg} />
    </div>
  );
}

export function EndTournamentButton({ seasonId, name }: { seasonId: string; name: string }) {
  const { msg, pending, run } = useFeedback();
  const [armed, setArmed] = useState(false);
  return (
    <div className="space-y-1">
      {!armed ? (
        <button className="btn-ghost text-sm" onClick={() => setArmed(true)}>End…</button>
      ) : (
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-xs text-ember">Liquidate and archive {name}?</span>
          <button className="btn-sell text-sm" disabled={pending} onClick={() => run(() => endTournament(seasonId))}>
            {pending ? "Ending…" : "Yes, end it"}
          </button>
          <button className="btn-ghost text-sm" onClick={() => setArmed(false)}>Cancel</button>
        </div>
      )}
      <Feedback msg={msg} />
    </div>
  );
}
