import { redirect } from "next/navigation";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { usd } from "@/lib/format";
import {
  RunPriceUpdateButton, EndSeasonButton, StartSeasonForm, CsvUploadForm, CardToggle,
} from "@/components/AdminForms";

export const dynamic = "force-dynamic";

export default async function Admin({ searchParams }: { searchParams: { q?: string } }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") redirect("/dashboard");

  const admin = supabaseAdmin();
  const q = searchParams.q?.trim() ?? "";

  const [{ data: season }, { data: audit }, { count: cardCount }, { data: cards },
         { data: users }, { data: events }] = await Promise.all([
    admin.from("seasons").select("*").eq("status", "active")
      .order("start_date", { ascending: false }).limit(1).maybeSingle(),
    admin.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(10),
    admin.from("cards").select("*", { count: "exact", head: true }),
    admin.from("v_card_prices").select("*").ilike("card_name", q ? `%${q}%` : "%")
      .order("card_name").limit(30),
    admin.from("v_leaderboard").select("*").order("total_trades", { ascending: false }).limit(50),
    admin.from("analytics_events")
      .select("event_type")
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
  ]);

  const eventCounts = new Map<string, number>();
  for (const e of events ?? []) eventCounts.set(e.event_type, (eventCounts.get(e.event_type) ?? 0) + 1);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl">Admin</h1>

      <section className="panel p-4 space-y-4">
        <h2 className="font-display text-lg">Season</h2>
        {season ? (
          <>
            <p className="text-sm">
              <span className="text-gold">{season.name}</span> is live —
              {" "}{season.start_date} to {season.end_date}, starting balance {usd(season.starting_balance)}.
            </p>
            <EndSeasonButton />
          </>
        ) : (
          <>
            <p className="text-sm text-faded">No active season.</p>
            <StartSeasonForm />
          </>
        )}
      </section>

      <section className="panel p-4 space-y-4">
        <h2 className="font-display text-lg">Prices &amp; data</h2>
        <p className="text-sm text-faded">
          The daily cron hits /api/cron/update-prices. Run it manually here, or import a CSV if
          Scryfall data is unavailable or wrong.
        </p>
        <RunPriceUpdateButton />
        <CsvUploadForm />
      </section>

      <section className="panel p-4 space-y-3">
        <h2 className="font-display text-lg">Card pool ({cardCount ?? 0} cards)</h2>
        <form action="/admin" className="flex gap-2 max-w-sm">
          <input className="input" name="q" defaultValue={q} placeholder="Search pool…" />
          <button className="btn-ghost">Search</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead><tr>
              <th className="th">Card</th><th className="th">Category</th>
              <th className="th">Price</th><th className="th">Last priced</th><th className="th"></th>
            </tr></thead>
            <tbody>
              {(cards ?? []).map((c) => (
                <tr key={c.card_id}>
                  <td className="td">{c.card_name} <span className="text-faded text-xs">{c.set_name}</span></td>
                  <td className="td capitalize text-faded">{c.category}</td>
                  <td className="td font-mono">{c.current_price ? usd(c.current_price) : "—"}</td>
                  <td className="td font-mono text-faded">{c.price_date ?? "never"}
                    {c.price_date && !c.price_fresh && <span className="chip-down ml-2">stale</span>}</td>
                  <td className="td"><CardToggle cardId={c.card_id} active={!!c.active} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4 space-y-3">
        <h2 className="font-display text-lg">Analytics — last 7 days</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {["login", "trade_confirmed", "leaderboard_view", "biggest_calls_view",
            "watchlist_add", "card_detail_view", "public_profile_view"].map((t) => (
            <div key={t} className="border border-edge rounded-lg p-3">
              <p className="text-xs text-faded">{t}</p>
              <p className="font-mono text-lg">{eventCounts.get(t) ?? 0}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-4 space-y-3">
        <h2 className="font-display text-lg">Players ({(users ?? []).length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead><tr>
              <th className="th">Player</th><th className="th">Portfolio</th>
              <th className="th">Trades</th><th className="th">Cards</th><th className="th">Flags</th>
            </tr></thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.user_id}>
                  <td className="td">@{u.username}</td>
                  <td className="td font-mono">{usd(u.total_value)}</td>
                  <td className="td font-mono">{u.total_trades}</td>
                  <td className="td font-mono">{u.distinct_cards_traded}</td>
                  <td className="td">{u.late_joiner && <span className="chip-flat">late</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4 space-y-2">
        <h2 className="font-display text-lg">Recent admin activity</h2>
        <ul className="text-sm space-y-1">
          {(audit ?? []).map((a) => (
            <li key={a.id} className="text-faded">
              <span className="font-mono text-xs">{new Date(a.created_at).toLocaleString()}</span>
              {" — "}{a.action} <span className="text-xs">{JSON.stringify(a.detail)}</span>
            </li>
          ))}
          {(audit ?? []).length === 0 && <li className="text-faded">No actions logged yet.</li>}
        </ul>
      </section>
    </div>
  );
}
