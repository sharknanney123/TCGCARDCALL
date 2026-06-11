import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily digest: emails each player whose orders settled in the last 24h.
// Dormant until RESEND_API_KEY is set (free tier at resend.com).
// Env: RESEND_API_KEY (required to send), DIGEST_FROM (default Resend test sender).
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: true, skipped: "RESEND_API_KEY not set" });

  const admin = supabaseAdmin();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: settled } = await admin
    .from("pending_orders")
    .select("user_id, side, status, fill_price, fill_quantity, reject_reason, cards(card_name), seasons(name)")
    .in("status", ["filled", "rejected"])
    .gte("settled_at", since);

  if (!settled || settled.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const byUser = new Map<string, typeof settled>();
  for (const o of settled) {
    const list = byUser.get(o.user_id) ?? [];
    list.push(o);
    byUser.set(o.user_id, list);
  }

  // Map user ids -> emails via the auth admin API
  const emails = new Map<string, string>();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) if (u.email) emails.set(u.id, u.email);
    if (data.users.length < 200) break;
    page += 1;
  }

  const name = (x: unknown) =>
    (Array.isArray(x) ? (x[0] as { card_name?: string; name?: string } | undefined)
                      : (x as { card_name?: string; name?: string } | null)) ?? {};

  let sent = 0;
  const failures: string[] = [];
  for (const [userId, orders] of Array.from(byUser.entries())) {
    const to = emails.get(userId);
    if (!to) continue;
    const lines = orders.map((o: (typeof settled)[number]) => {
      const card = name(o.cards).card_name ?? "a card";
      const season = name(o.seasons).name ?? "";
      return o.status === "filled"
        ? `• ${o.side === "buy" ? "Bought" : "Sold"} ${o.fill_quantity} × ${card} @ $${Number(o.fill_price).toFixed(2)}${season ? ` (${season})` : ""}`
        : `• ${o.side} on ${card} was rejected${o.reject_reason ? `: ${o.reject_reason}` : ""}`;
    });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.DIGEST_FROM ?? "TCGCardCall <onboarding@resend.dev>",
        to,
        subject: `Your orders filled — TCGCardCall morning report`,
        text: `Overnight at TCGCardCall:\n\n${lines.join("\n")}\n\nSee your portfolio: https://tcgcardcall.vercel.app/portfolio\n\n(Virtual credits only — no real money.)`,
      }),
    });
    if (res.ok) sent += 1;
    else failures.push(`${to}: ${res.status}`);
  }

  await admin.from("admin_audit_log").insert({
    action: "daily_digest", detail: { sent, failures: failures.slice(0, 5) },
  });
  return NextResponse.json({ ok: true, sent, failed: failures.length });
}
