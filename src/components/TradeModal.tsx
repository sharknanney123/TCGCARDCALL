"use client";

import { useState, useTransition } from "react";
import { placeTrade } from "@/app/actions";

type Props = {
  cardId: string;
  cardName: string;
  price: number;
  priceFresh: boolean;
  active: boolean;
  ownedQty: number;
  costBasis: number;
  cash: number;
  tradesToday: number;
};

export default function TradeModal(props: Props) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [mode, setMode] = useState<"amount" | "quantity">("amount");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const num = parseFloat(value) || 0;
  const tradeValue = mode === "amount" ? num : num * props.price;
  const fee = Math.round(tradeValue * 0.01 * 100) / 100;
  const headroom = Math.max(0, 2500 - props.costBasis);
  const tradesLeft = Math.max(0, 10 - props.tradesToday);
  const canTrade = props.priceFresh && tradesLeft > 0 && (side === "sell" || props.active);

  function submit() {
    setMsg(null);
    const fd = new FormData();
    fd.set("card_id", props.cardId);
    fd.set("side", side);
    fd.set("mode", mode);
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
                <p className="font-mono text-sm text-faded">${props.price.toFixed(2)} per card</p>
              </div>
              <button className="text-faded hover:text-parchment" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>

            {!props.priceFresh && (
              <p className="text-sm text-ember">Price is stale (over 48 hours old). Trading is paused for this card.</p>
            )}
            {!props.active && side === "buy" && (
              <p className="text-sm text-ember">This card was removed from the pool — selling only.</p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button className={side === "buy" ? "btn-buy" : "btn-ghost"} onClick={() => setSide("buy")}>Buy</button>
              <button className={side === "sell" ? "btn-sell" : "btn-ghost"} onClick={() => setSide("sell")}
                      disabled={props.ownedQty <= 0}>
                Sell{props.ownedQty > 0 ? ` (${props.ownedQty})` : ""}
              </button>
            </div>

            <div className="flex gap-2 text-xs">
              <button onClick={() => setMode("amount")}
                className={`chip ${mode === "amount" ? "text-gold border-gold/50" : "text-faded border-edge"}`}>
                Dollar amount
              </button>
              <button onClick={() => setMode("quantity")}
                className={`chip ${mode === "quantity" ? "text-gold border-gold/50" : "text-faded border-edge"}`}>
                Quantity
              </button>
            </div>

            <input
              className="input font-mono"
              type="number" min="0" step={mode === "amount" ? "1" : "0.0001"}
              placeholder={mode === "amount" ? "Dollars (min $10)" : "Fractional quantity"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />

            <dl className="text-sm space-y-1 font-mono">
              <div className="flex justify-between"><dt className="text-faded">Trade value</dt><dd>${tradeValue.toFixed(2)}</dd></div>
              <div className="flex justify-between"><dt className="text-faded">1% fee</dt><dd>${fee.toFixed(2)}</dd></div>
              <div className="flex justify-between">
                <dt className="text-faded">{side === "buy" ? "Total cost" : "You receive"}</dt>
                <dd className="text-gold">${(side === "buy" ? tradeValue + fee : tradeValue - fee).toFixed(2)}</dd>
              </div>
              <div className="flex justify-between"><dt className="text-faded">Cash after</dt>
                <dd>${(side === "buy" ? props.cash - tradeValue - fee : props.cash + tradeValue - fee).toFixed(2)}</dd></div>
              {side === "buy" && (
                <div className="flex justify-between"><dt className="text-faded">Cap headroom ($2,500/card)</dt>
                  <dd className={tradeValue > headroom ? "text-ember" : ""}>${headroom.toFixed(2)}</dd></div>
              )}
              <div className="flex justify-between"><dt className="text-faded">Trades left today</dt><dd>{tradesLeft} / 10</dd></div>
            </dl>

            {msg && <p className={`text-sm ${msg.ok ? "text-jade" : "text-ember"}`}>{msg.text}</p>}

            <button className={side === "buy" ? "btn-buy w-full" : "btn-sell w-full"}
                    onClick={submit}
                    disabled={pending || !canTrade || tradeValue < 10}>
              {pending ? "Placing…" : `Confirm ${side}`}
            </button>
            <p className="text-xs text-faded text-center">
              Virtual credits only. Executes at today&apos;s stored price — no real cards change hands.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
