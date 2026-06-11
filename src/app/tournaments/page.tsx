import { supabaseServer } from "@/lib/supabase/server";
import { getTournamentContext } from "@/lib/tournament";
import { usd } from "@/lib/format";
import TournamentJoin from "@/components/TournamentJoin";
import JoinByCode from "@/components/JoinByCode";
import { pct, gainClass } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Tournaments() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const ctx = await getTournamentContext(user.id);
  const joinedIds = new Set(ctx.joined.map((t) => t.id));

  const { data: active } = await supabase
    .from("seasons").select("*").eq("status", "active")
    .order("start_date", { ascending: false });

  const seasonIds = (active ?? []).map((s) => s.id);

  // Player counts and pool sizes per tournament
  const [{ data: members }, { data: pools }, { data: archived }] = await Promise.all([
    seasonIds.length
      ? supabase.from("portfolios").select("season_id").in("season_id", seasonIds)
      : Promise.resolve({ data: [] as { season_id: string }[] }),
    seasonIds.length
      ? supabase.from("season_cards").select("season_id").in("season_id", seasonIds)
      : Promise.resolve({ data: [] as { season_id: string }[] }),
    supabase.from("seasons").select("id, name, start_date, end_date").eq("status", "archived")
      .order("end_date", { ascending: false }).limit(5),
  ]);

  // Past podiums: top-3 finishers of recent archived tournaments
  const archivedIds = (archived ?? []).map((a) => a.id);
  const { data: results } = archivedIds.length
    ? await supabase.from("season_results")
        .select("season_id, final_rank, final_percent_gain, profiles(username)")
        .in("season_id", archivedIds).not("final_rank", "is", null).lte("final_rank", 3)
        .order("final_rank", { ascending: true })
    : { data: [] as never[] };
  const podium = new Map<string, { rank: number; username: string; gain: number }[]>();
  for (const r of results ?? []) {
    const u = Array.isArray(r.profiles) ? r.profiles[0]?.username : (r.profiles as { username?: string } | null)?.username;
    const list = podium.get(r.season_id) ?? [];
    list.push({ rank: Number(r.final_rank), username: u ?? "—", gain: Number(r.final_percent_gain) });
    podium.set(r.season_id, list);
  }

  const playerCount = new Map<string, number>();
  for (const m of members ?? []) playerCount.set(m.season_id, (playerCount.get(m.season_id) ?? 0) + 1);
  const poolSize = new Map<string, number>();
  for (const p of pools ?? []) poolSize.set(p.season_id, (poolSize.get(p.season_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Tournaments</h1>
        <p className="text-sm text-faded mt-1">
          Each tournament has its own bankroll, rules, card pool, and leaderboard. Join as many as you like —
          your portfolios are independent.
        </p>
      </div>

      <JoinByCode />

      <div className="grid md:grid-cols-2 gap-4">
        {(active ?? []).filter((s) => !s.is_private || joinedIds.has(s.id)).map((s) => {
          const pool = poolSize.get(s.id) ?? 0;
          const players = playerCount.get(s.id) ?? 0;
          return (
            <section key={s.id} className={`panel p-5 space-y-3 ${ctx.current?.id === s.id ? "border-gold/40" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg">{s.name}{s.is_private && <span className="chip-flat ml-2">private</span>}</h2>
                  <p className="text-xs text-faded">{s.start_date} → {s.end_date}</p>
                </div>
                <TournamentJoin seasonId={s.id} joined={joinedIds.has(s.id)} viewing={ctx.current?.id === s.id} isPrivate={!!s.is_private} />
              </div>

              {s.description && <p className="text-sm text-faded">{s.description}</p>}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm font-mono">
                <div className="flex justify-between"><dt className="text-faded">Bankroll</dt><dd>{usd(s.starting_balance)}</dd></div>
                <div className="flex justify-between"><dt className="text-faded">Fee</dt><dd>{(Number(s.fee_bps) / 100).toFixed(2)}%</dd></div>
                <div className="flex justify-between"><dt className="text-faded">Orders/day</dt><dd>{s.daily_order_limit}</dd></div>
                <div className="flex justify-between"><dt className="text-faded">Card cap</dt><dd>{s.position_cap ? usd(s.position_cap) : "None"}</dd></div>
                <div className="flex justify-between"><dt className="text-faded">Min order</dt><dd>{usd(s.min_order)}</dd></div>
                <div className="flex justify-between"><dt className="text-faded">Card pool</dt><dd>{pool > 0 ? `${pool} cards` : "All cards"}</dd></div>
              </dl>

              <p className="text-xs text-faded">
                {players} player{players === 1 ? "" : "s"}
                {s.max_players ? ` / ${s.max_players} max` : ""}
                {" · "}orders fill at the next daily price update
              </p>
            </section>
          );
        })}
        {(active ?? []).length === 0 && (
          <p className="text-faded">No tournaments are open right now.</p>
        )}
      </div>

      {(archived ?? []).length > 0 && (
        <section className="panel p-4">
          <h2 className="font-display text-lg mb-2">Past tournaments</h2>
          <ul className="text-sm space-y-3">
            {(archived ?? []).map((s) => (
              <li key={s.id}>
                <p className="text-faded">{s.name} — {s.start_date} → {s.end_date}</p>
                {(podium.get(s.id) ?? []).length > 0 && (
                  <p className="text-xs mt-0.5 space-x-3">
                    {(podium.get(s.id) ?? []).map((w) => (
                      <span key={w.rank}>
                        {w.rank === 1 ? "🥇" : w.rank === 2 ? "🥈" : "🥉"} @{w.username}{" "}
                        <span className={`font-mono ${gainClass(w.gain)}`}>{pct(w.gain)}</span>
                      </span>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
