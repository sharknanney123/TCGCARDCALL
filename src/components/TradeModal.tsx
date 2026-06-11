"use client";

import { useState, useTransition } from "react";
import { placeTrade } from "@/app/actions";

type Props = {
  seasonId: string;
  seasonName: string;
  feePct: number;         // e.g. 1 = 1%
  dailyLimit: number;
  positionCap: number | null;  // null = uncapped
  minOrder: number;
  cardId: string;
  cardName: string;
  price: number;          // latest snapshot price (estimate for the fill)
  priceFresh: boolean;
  active: boolean;
  ownedQty: number;       // available (unreserved) quantity
  costBasis: number;
  cash: number;           // available (unreserved) cash
  tradesToday: number;
};

export default function TradeModal(props: Props) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const num = parseFloat(value) || 0;
  const feeRate = props.feePct / 100;
  // Buys are entered in dollars; sells in quantity. Fill price is unknown
  // until the next daily update, so everything below is an estimate.
  const estValue = side === "buy" ? num : num * props.price;
  const estFee = Math.round(estValue * feeRate * 100) / 100;
  const reserved = side === "buy" ? Math.round((num + num * feeRate) * 100) / 100 : 0;
  const estQty = side === "buy" && props.price > 0 ? num / props.price : num;
  const headroom = props.positionCap === null ? null : Math.max(0, props.positionCap - props.costBasis);
  const tradesLeft = Math.max(0, props.dailyLimit - props.tradesToday);
  const canTrade = props.priceFresh && tradesLeft > 0 && (side === "sell" || props.active);

  function pick(next: "buy" | "sell") {
    setSide(next);
    setValue("");
    setMsg(null);
  }

  function submit() {
    setMsg(null);
    const fd = new FormData();
    fd.set("season_id", props.seasonId);
    fd.set("card_id", props.cardId);
    fd.set("side", side);
    fd.set("value", value);
    startTransition(async () => {
      const res = await placeTrade(fd);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) setValue("");
    });
  }

  return (
    <>
      <button className="btn-gold" onClick={() => setOpen(true)}>Trade</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/80 p-4"
             onClick={() => setOpen(false)}>
          <div className="panel w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg">{props.cardName}</h2>
                <p className="font-mono text-sm text-faded">${props.price.toFixed(2)} latest price · {props.seasonName}</p>
              </div>
              <button className="text-faded hover:text-parchment" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>

            <p className="text-xs text-gold/90 border border-gold/30 rounded-lg px-3 py-2">
              Orders fill at the <strong>next daily price update</strong> — today&apos;s price is an
              estimate, not your fill price. Pending orders can be cancelled from your portfolio.
            </p>

            {!props.priceFresh && (
              <p className="text-sm text-ember">Price is stale (over 48 hours old). Trading is paused for this card.</p>
            )}
            {!props.active && side === "buy" && (
              <p className="text-sm text-ember">This card was removed from the pool — selling only.</p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button className={side === "buy" ? "btn-buy" : "btn-ghost"} onClick={() => pick("buy")}>Buy</button>
              <button className={side === "sell" ? "btn-sell" : "btn-ghost"} onClick={() => pick("sell")}
                      disabled={props.ownedQty <= 0}>
                Sell{props.ownedQty > 0 ? ` (${props.ownedQty})` : ""}
              </button>
            </div>

            <input
              className="input font-mono"
              type="number" min="0" step={side === "buy" ? "1" : "0.0001"}
              placeholder={side === "buy" ? `Dollars to invest (min $${props.minOrder})` : "Quantity to sell"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />

            <dl className="text-sm space-y-1 font-mono">
              {side === "buy" ? (
                <>
                  <div className="flex justify-between"><dt className="text-faded">Est. quantity</dt><dd>{estQty.toFixed(4)}</dd></div>
                  <div className="flex justify-between"><dt className="text-faded">{props.feePct}% fee (est.)</dt><dd>${estFee.toFixed(2)}</dd></div>
                  <div className="flex justify-between">
                    <dt className="text-faded">Reserved now (incl. fee)</dt>
                    <dd className="text-gold">${reserved.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between"><dt className="text-faded">Available cash after</dt>
                    <dd>${(props.cash - reserved).toFixed(2)}</dd></div>
                  {headroom !== null && (
                    <div className="flex justify-between"><dt className="text-faded">Cap headroom (per card)</dt>
                      <dd className={num > headroom ? "text-ember" : ""}>${headroom.toFixed(2)}</dd></div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between"><dt className="text-faded">Est. value</dt><dd>${estValue.toFixed(2)}</dd></div>
                  <div className="flex justify-between"><dt className="text-faded">{props.feePct}% fee (est.)</dt><dd>${estFee.toFixed(2)}</dd></div>
                  <div className="flex justify-between">
                    <dt className="text-faded">Est. you receive</dt>
                    <dd className="text-gold">${(estValue - estFee).toFixed(2)}</dd>
                  </div>
                </>
              )}
              <div className="flex justify-between"><dt className="text-faded">Orders left today</dt><dd>{tradesLeft} / {props.dailyLimit}</dd></div>
            </dl>

            {msg && <p className={`text-sm ${msg.ok ? "text-jade" : "text-ember"}`}>{msg.text}</p>}

            <button className={side === "buy" ? "btn-buy w-full" : "btn-sell w-full"}
                    onClick={submit}
                    disabled={pending || !canTrade || estValue < props.minOrder || (side === "sell" && num > props.ownedQty)}>
              {pending ? "Placing…" : `Place ${side} order`}
            </button>
            <p className="text-xs text-faded text-center">
              Virtual credits only. Fills at the next daily price update (~3 AM Central) — no real cards change hands.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
