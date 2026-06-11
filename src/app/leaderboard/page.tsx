import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getTournamentContext } from "@/lib/tournament";
import { usd, pct, gainClass } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Leaderboard() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  await supabase.rpc("log_event", { p_type: "leaderboard_view", p_meta: {} });

  const ctx = await getTournamentContext(user.id);
  const season = ctx.current;
  if (!season) return <p className="text-faded py-12 text-center">No active tournament.</p>;

  const { data: rows } = await supabase
    .from("v_leaderboard").select("*").eq("season_id", season.id)
    .order("percent_gain", { ascending: false }).limit(200);

  const ranked = (rows ?? []).filter((r) => r.qualified && !r.late_joiner);
  const others = (rows ?? []).filter((r) => !r.qualified || r.late_joiner);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl">Leaderboard — {season.name}</h1>
      <p className="text-sm text-faded">
        Ranked by percent gain. Qualifying requires trades in at least 3 distinct cards; players who
        joined after the first week are listed separately.
      </p>

      {/* Mobile: stacked rows */}
      <section className="sm:hidden space-y-1.5">
        {ranked.map((r) => (
          <div key={r.user_id} className={`panel p-3 flex items-center justify-between gap-2 ${r.user_id === user.id ? "border-gold/40" : ""}`}>
            <span className="truncate">
              <span className="font-mono text-gold mr-2">#{r.rank ?? "—"}</span>
              <Link href={`/u/${r.username}`} className="hover:text-gold">@{r.username}</Link>
            </span>
            <span className={`font-mono text-sm ${gainClass(r.percent_gain)}`}>{pct(r.percent_gain)}</span>
          </div>
        ))}
        {ranked.length === 0 && (
          <p className="text-sm text-faded">No qualified players yet — trade 3 distinct cards to claim rank #1.</p>
        )}
      </section>

      <section className="panel overflow-x-auto hidden sm:block">
        <table className="w-full min-w-[520px]">
          <thead><tr>
            <th className="th">#</th><th className="th">Player</th>
            <th className="th">Portfolio</th><th className="th">Gain</th>
          </tr></thead>
          <tbody>
            {ranked.map((r) => (
              <tr key={r.user_id} className={r.user_id === user.id ? "bg-gold/5" : ""}>
                <td className="td font-mono text-gold">{r.rank ?? "—"}</td>
                <td className="td"><Link href={`/u/${r.username}`} className="hover:text-gold">@{r.username}</Link></td>
                <td className="td font-mono">{usd(r.total_value)}</td>
                <td className={`td font-mono ${gainClass(r.percent_gain)}`}>{pct(r.percent_gain)}</td>
              </tr>
            ))}
            {ranked.length === 0 && (
              <tr><td className="td text-faded" colSpan={4}>No qualified players yet — trade 3 distinct cards to claim rank #1.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {others.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg text-faded">Not yet qualified / late joiners</h2>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <tbody>
                {others.map((r) => (
                  <tr key={r.user_id}>
                    <td className="td"><Link href={`/u/${r.username}`} className="hover:text-gold">@{r.username}</Link>
                      {r.late_joiner && <span className="chip-flat ml-2">late joiner</span>}
                      {!r.qualified && <span className="chip-flat ml-2">{r.distinct_cards_traded}/3 cards</span>}
                    </td>
                    <td className="td font-mono">{usd(r.total_value)}</td>
                    <td className={`td font-mono ${gainClass(r.percent_gain)}`}>{pct(r.percent_gain)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
