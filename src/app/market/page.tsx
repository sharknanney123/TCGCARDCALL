import Link from "next/link";
import Image from "next/image";
import { supabaseServer } from "@/lib/supabase/server";
import { getTournamentContext } from "@/lib/tournament";
import { usd } from "@/lib/format";
import PctChip from "@/components/PctChip";
import WatchButton from "@/components/WatchButton";

export const dynamic = "force-dynamic";

const CATEGORIES = ["all", "popular", "meta", "commander", "recent", "sleeper"] as const;
const SORTS = [
  { key: "movers", label: "Top movers" },
  { key: "name", label: "Name" },
  { key: "price_desc", label: "Price ↓" },
  { key: "price_asc", label: "Price ↑" },
] as const;

export default async function Market({
  searchParams,
}: {
  searchParams: { q?: string; cat?: string; sort?: string; watched?: string };
}) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const q = searchParams.q?.trim() ?? "";
  const cat = CATEGORIES.includes(searchParams.cat as never) ? searchParams.cat! : "all";
  const sort = SORTS.some((s) => s.key === searchParams.sort) ? searchParams.sort! : "movers";
  const watchedOnly = searchParams.watched === "1";

  const ctx = await getTournamentContext(user.id);
  const season = ctx.current;

  // Restrict to this tournament's pool when one is defined.
  let poolIds: string[] | null = null;
  if (season) {
    const { data: pool } = await supabase
      .from("season_cards").select("card_id").eq("season_id", season.id);
    if (pool && pool.length > 0) poolIds = pool.map((p) => p.card_id);
  }

  let query = supabase.from("v_card_prices").select("*").eq("active", true).limit(120);
  if (poolIds) query = query.in("card_id", poolIds);
  if (q) query = query.ilike("card_name", `%${q}%`);
  if (cat !== "all") query = query.eq("category", cat);
  if (sort === "name") query = query.order("card_name");
  else if (sort === "price_desc") query = query.order("current_price", { ascending: false, nullsFirst: false });
  else if (sort === "price_asc") query = query.order("current_price", { ascending: true, nullsFirst: false });
  else query = query.order("pct_change", { ascending: false, nullsFirst: false });

  const [{ data: cards }, { data: watch }] = await Promise.all([
    query,
    supabase.from("watchlist").select("card_id").eq("user_id", user.id),
  ]);
  const watchedSet = new Set((watch ?? []).map((w) => w.card_id));
  const list = (cards ?? []).filter((c) => !watchedOnly || watchedSet.has(c.card_id));

  const link = (params: Record<string, string>) => {
    const merged = { q, cat, sort, watched: watchedOnly ? "1" : "", ...params };
    const qs = Object.entries(merged).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    return `/market${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h1 className="font-display text-2xl">Market</h1>
        {season && (
          <p className="text-sm text-faded">
            {season.name}{poolIds ? ` · ${poolIds.length}-card pool` : ""}
          </p>
        )}
      </div>

      <form className="flex gap-2" action="/market">
        <input className="input" name="q" defaultValue={q} placeholder="Search 500 Magic cards…" />
        <input type="hidden" name="cat" value={cat} />
        <input type="hidden" name="sort" value={sort} />
        <button className="btn-gold">Search</button>
      </form>

      <div className="flex flex-wrap gap-2 text-xs">
        {CATEGORIES.map((c) => (
          <Link key={c} href={link({ cat: c })}
            className={`chip capitalize ${cat === c ? "text-gold border-gold/50" : "text-faded border-edge hover:text-parchment"}`}>
            {c}
          </Link>
        ))}
        <span className="mx-1 text-edge">|</span>
        {SORTS.map((s) => (
          <Link key={s.key} href={link({ sort: s.key })}
            className={`chip ${sort === s.key ? "text-gold border-gold/50" : "text-faded border-edge hover:text-parchment"}`}>
            {s.label}
          </Link>
        ))}
        <Link href={link({ watched: watchedOnly ? "" : "1" })}
          className={`chip ${watchedOnly ? "text-gold border-gold/50" : "text-faded border-edge hover:text-parchment"}`}>
          ★ Watched
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {list.map((c) => (
          <div key={c.card_id} className="panel p-3 flex flex-col gap-2">
            <Link href={`/card/${c.card_id}`} className="block">
              {c.image_url ? (
                <Image src={c.image_url} alt={c.card_name} width={244} height={340}
                       className="rounded-lg w-full h-auto" unoptimized />
              ) : (
                <div className="aspect-[63/88] rounded-lg bg-edge/40 flex items-center justify-center text-faded text-xs">
                  No image
                </div>
              )}
            </Link>
            <Link href={`/card/${c.card_id}`} className="text-sm font-medium leading-tight hover:text-gold line-clamp-2">
              {c.card_name}
            </Link>
            <p className="text-xs text-faded truncate">{c.set_name}</p>
            <div className="flex items-center justify-between mt-auto">
              <span className="font-mono text-sm">{c.current_price ? usd(c.current_price) : "—"}</span>
              <PctChip value={c.pct_change} />
            </div>
            <WatchButton cardId={c.card_id} watched={watchedSet.has(c.card_id)} />
          </div>
        ))}
      </div>
      {list.length === 0 && (
        <p className="text-faded text-sm py-8 text-center">
          No cards match. The pool fills in once the admin imports cards and prices.
        </p>
      )}
    </div>
  );
}
