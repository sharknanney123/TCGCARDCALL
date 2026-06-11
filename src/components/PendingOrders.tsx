"use client";

import { useState, useTransition } from "react";
import { cancelOrder } from "@/app/actions";
import { usd, qty } from "@/lib/format";

type PendingOrder = {
  id: number;
  side: string;
  credit_amount: number | null;
  quantity: number | null;
  placed_at: string;
  card_name: string;
};

export default function PendingOrders({ orders }: { orders: PendingOrder[] }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (orders.length === 0) return null;

  function cancel(id: number) {
    setMsg(null);
    startTransition(async () => {
      const res = await cancelOrder(id);
      if (!res.ok) setMsg(res.message);
    });
  }

  return (
    <section className="panel overflow-x-auto">
      <div className="px-4 pt-4 flex items-baseline justify-between">
        <h2 className="font-display text-lg">Pending orders</h2>
        <p className="text-xs text-faded">Fill at the next daily price update</p>
      </div>
      {/* Mobile */}
      <div className="sm:hidden px-4 pb-3 pt-2 space-y-2">
        {orders.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">
              <span className={`font-mono uppercase text-xs mr-1 ${o.side === "buy" ? "text-jade" : "text-ember"}`}>{o.side}</span>
              {o.card_name} — <span className="font-mono">{o.side === "buy" ? usd(o.credit_amount) : `${qty(o.quantity)} qty`}</span>
            </span>
            <button className="btn-ghost text-xs" disabled={pending} onClick={() => cancel(o.id)}>Cancel</button>
          </div>
        ))}
      </div>

      <table className="w-full min-w-[520px] hidden sm:table">
        <thead><tr>
          <th className="th">Card</th><th className="th">Side</th>
          <th className="th">Order</th><th className="th">Placed</th><th className="th"></th>
        </tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="td">{o.card_name}</td>
              <td className={`td font-mono uppercase ${o.side === "buy" ? "text-jade" : "text-ember"}`}>{o.side}</td>
              <td className="td font-mono">
                {o.side === "buy" ? `${usd(o.credit_amount)} (+1% fee reserved)` : `${qty(o.quantity)} qty`}
              </td>
              <td className="td text-faded text-sm">{new Date(o.placed_at).toLocaleString()}</td>
              <td className="td text-right">
                <button className="btn-ghost text-sm" disabled={pending} onClick={() => cancel(o.id)}>
                  {pending ? "…" : "Cancel"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <p className="px-4 pb-3 text-sm text-ember">{msg}</p>}
    </section>
  );
}
