import Image from "next/image";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { usd } from "@/lib/format";
import PctChip from "@/components/PctChip";
import WatchButton from "@/components/WatchButton";
import TradeModal from "@/components/TradeModal";
import Sparkline from "@/components/Sparkline";

export const dynamic = "force-dynamic";

export default async function CardDetail({ params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: card } = await supabase
    .from("v_card_prices").select("*").eq("card_id", params.id).maybeSingle();
  if (!card) notFound();

  await supabase.rpc("log_event", { p_type: "card_detail_view", p_meta: { card_id: params.id } });

  const { data: season } = await supabase
    .from("seasons").select("id").eq("status", "active")
    .order("start_date", { ascending: false }).limit(1).maybeSingle();

  const [{ data: history }, { data: pos }, { data: pf }, { data: watch }, { data: count }] =
    await Promise.all([
      supabase.from("price_snapshots").select("price, price_date")
        .eq("card_id", params.id).order("price_date", { ascending: true }).limit(60),
      season
        ? supabase.from("positions").select("quantity, average_buy_price, cost_basis, reserved_quantity")
            .eq("user_id", user.id).eq("season_id", season.id).eq("card_id", params.id).maybeSingle()
        : Promise.resolve({ data: null }),
      season
        ? supabase.from("portfolios").select("virtual_cash, reserved_cash")
            .eq("user_id", user.id).eq("season_id", season.id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("watchlist").select("card_id")
        .eq("user_id", user.id).eq("card_id", params.id).maybeSingle(),
      supabase.from("daily_trade_counts").select("trade_count")
        .eq("user_id", user.id)
        .eq("day", new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date()))
        .maybeSingle(),
    ]);

  const points = (history ?? []).map((h) => Number(h.price));

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-6">
      <div className="space-y-3">
        {card.image_url ? (
          <Image src={card.image_url} alt={card.card_name} width={280} height={390}
                 className="rounded-xl w-full h-auto" unoptimized />
        ) : (
          <div className="aspect-[63/88] rounded-xl bg-edge/40" />
        )}
        <WatchButton cardId={card.card_id} watched={!!watch} />
      </div>

      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl">{card.card_name}</h1>
          <p className="text-faded text-sm">
            {card.set_name} · <span className="capitalize">{card.category}</span> · {card.finish}
            {!card.active && <span className="text-ember"> · removed from pool (sell only)</span>}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-3xl">{card.current_price ? usd(card.current_price) : "—"}</span>
          <PctChip value={card.pct_change} />
          {!card.price_fresh && <span className="chip-down">Stale price — trading paused</span>}
        </div>
        <p className="text-xs text-faded">
          Last priced {card.price_date ?? "never"} · previous {card.previous_price ? usd(card.previous_price) : "—"}
        </p>

        <div className="panel p-4">
          <Sparkline points={points} />
        </div>

        {pos && Number(pos.quantity) > 0 && (
          <div className="panel p-4 text-sm font-mono flex flex-wrap gap-x-6 gap-y-1">
            <span>Holding: {Number(pos.quantity)}</span>
            <span>Avg buy: {usd(pos.average_buy_price)}</span>
            <span>Cost basis: {usd(pos.cost_basis)}</span>
          </div>
        )}

        {card.current_price && pf && (
          <TradeModal
            cardId={card.card_id}
            cardName={card.card_name}
            price={Number(card.current_price)}
            priceFresh={!!card.price_fresh}
            active={!!card.active}
            ownedQty={Math.max(0, Number(pos?.quantity ?? 0) - Number(pos?.reserved_quantity ?? 0))}
            costBasis={Number(pos?.cost_basis ?? 0)}
            cash={Math.max(0, Number(pf.virtual_cash) - Number(pf.reserved_cash ?? 0))}
            tradesToday={Number(count?.trade_count ?? 0)}
          />
        )}
      </div>
    </div>
  );
}
