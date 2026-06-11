"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

// ---------- Player actions ----------

// Forward pricing: orders are queued and fill at the NEXT daily price update.
// Buys are denominated in pre-fee dollars; sells in fractional quantity.
export async function placeTrade(formData: FormData): Promise<ActionResult> {
  const supabase = supabaseServer();
  const card = String(formData.get("card_id") ?? "");
  const side = String(formData.get("side") ?? "");
  const raw = Number(formData.get("value") ?? 0);
  if (!card || !["buy", "sell"].includes(side) || !raw || raw <= 0) {
    return { ok: false, message: "Enter a valid amount." };
  }
  const { data, error } = await supabase.rpc("place_order", {
    p_card: card,
    p_side: side,
    p_amount: side === "buy" ? raw : null,
    p_quantity: side === "sell" ? raw : null,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/", "layout");
  const r = data as { reserved?: number; est_quantity?: number; quantity?: number };
  return {
    ok: true,
    message:
      side === "buy"
        ? `Buy order placed — $${Number(r.reserved ?? raw).toFixed(2)} reserved (incl. 1% fee). Fills at the next daily price update.`
        : `Sell order placed for ${r.quantity ?? raw} — fills at the next daily price update.`,
  };
}

export async function cancelOrder(orderId: number): Promise<ActionResult> {
  const supabase = supabaseServer();
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "Order cancelled — reservation released." };
}

export async function toggleWatch(cardId: string, watched: boolean) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  if (watched) {
    await supabase.from("watchlist").delete().eq("user_id", user.id).eq("card_id", cardId);
    await supabase.rpc("log_event", { p_type: "watchlist_remove", p_meta: { card_id: cardId } });
  } else {
    await supabase.from("watchlist").insert({ user_id: user.id, card_id: cardId });
    await supabase.rpc("log_event", { p_type: "watchlist_add", p_meta: { card_id: cardId } });
  }
  revalidatePath("/", "layout");
}

export async function joinSeason() {
  const supabase = supabaseServer();
  await supabase.rpc("join_active_season");
}

export async function logEvent(type: string, meta: Record<string, unknown> = {}) {
  const supabase = supabaseServer();
  await supabase.rpc("log_event", { p_type: type, p_meta: meta });
}

// ---------- Admin actions (service role after admin check) ----------

async function requireAdmin() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Admins only.");
  return user.id;
}

/** Minimal RFC-4180 CSV line parser: handles quoted fields and escaped quotes. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/**
 * CSV import for the card pool and/or fallback prices.
 * Columns (header row required):
 * scryfall_id,card_name,set_name,image_url,category,finish,current_price,previous_price,price_date
 * Price columns are optional — leave blank to import cards only.
 */
export async function importCsv(formData: FormData): Promise<ActionResult> {
  try {
    const adminId = await requireAdmin();
    const file = formData.get("file") as File | null;
    if (!file) return { ok: false, message: "Choose a CSV file." };
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const idx = (name: string) => header.indexOf(name);
    if (idx("scryfall_id") === -1 || idx("card_name") === -1) {
      return { ok: false, message: "CSV needs at least scryfall_id and card_name columns." };
    }
    const admin = supabaseAdmin();
    let cardCount = 0, priceCount = 0;
    for (const line of lines.slice(1)) {
      const cols = parseCsvLine(line);
      const get = (name: string) => (idx(name) >= 0 ? cols[idx(name)] ?? "" : "");
      const scryfallId = get("scryfall_id");
      if (!scryfallId) continue;
      const { data: card, error } = await admin
        .from("cards")
        .upsert(
          {
            scryfall_id: scryfallId,
            card_name: get("card_name"),
            set_name: get("set_name") || "Unknown",
            image_url: get("image_url") || null,
            category: get("category") || "popular",
            finish: get("finish") || "nonfoil",
            active: true,
          },
          { onConflict: "scryfall_id" }
        )
        .select("id")
        .single();
      if (error || !card) continue;
      cardCount++;
      const price = parseFloat(get("current_price"));
      if (!isNaN(price) && price > 0) {
        await admin.from("price_snapshots").upsert(
          {
            card_id: card.id,
            price,
            previous_price: parseFloat(get("previous_price")) || null,
            price_date: get("price_date") || new Date().toISOString().slice(0, 10),
            source: "csv",
          },
          { onConflict: "card_id,price_date" }
        );
        priceCount++;
      }
    }
    await admin.from("admin_audit_log").insert({
      admin_id: adminId,
      action: "csv_import",
      detail: { cards: cardCount, prices: priceCount },
    });
    if (priceCount > 0) await admin.rpc("refresh_season_rankings");
    revalidatePath("/", "layout");
    return { ok: true, message: `Imported ${cardCount} cards and ${priceCount} prices.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Import failed." };
  }
}

export async function runPriceUpdate(): Promise<ActionResult> {
  try {
    const adminId = await requireAdmin();
    const result = await updatePricesFromScryfall();
    const admin = supabaseAdmin();
    await admin.from("admin_audit_log").insert({
      admin_id: adminId,
      action: "manual_price_update",
      detail: result,
    });
    revalidatePath("/", "layout");
    return { ok: true, message: `Updated ${result.updated} prices (${result.failed} failed).` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Price update failed." };
  }
}

export async function endSeason(): Promise<ActionResult> {
  const supabase = supabaseServer();
  const { error } = await supabase.rpc("end_active_season");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "Season ended: positions liquidated, standings archived." };
}

export async function startSeason(formData: FormData): Promise<ActionResult> {
  try {
    const adminId = await requireAdmin();
    const name = String(formData.get("name") ?? "").trim();
    const days = Number(formData.get("days") ?? 30);
    if (!name) return { ok: false, message: "Name the season." };
    const admin = supabaseAdmin();
    const { count } = await admin
      .from("seasons").select("*", { count: "exact", head: true }).eq("status", "active");
    if ((count ?? 0) > 0) return { ok: false, message: "End the current season first." };
    const start = new Date();
    const end = new Date(Date.now() + days * 86400000);
    await admin.from("seasons").insert({
      name,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      status: "active",
    });
    await admin.from("admin_audit_log").insert({
      admin_id: adminId, action: "season_started", detail: { name, days },
    });
    revalidatePath("/", "layout");
    return { ok: true, message: `${name} is live.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not start season." };
  }
}

export async function setCardActive(cardId: string, active: boolean): Promise<ActionResult> {
  try {
    const adminId = await requireAdmin();
    const admin = supabaseAdmin();
    await admin.from("cards").update({ active }).eq("id", cardId);
    await admin.from("admin_audit_log").insert({
      admin_id: adminId, action: active ? "card_enabled" : "card_disabled", detail: { card_id: cardId },
    });
    revalidatePath("/", "layout");
    return { ok: true, message: active ? "Card re-enabled." : "Card disabled for new buys (holders keep positions)." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Update failed." };
  }
}

// ---------- Shared Scryfall ingest (used by admin button and cron) ----------

export async function updatePricesFromScryfall() {
  const admin = supabaseAdmin();
  const { data: cards } = await admin
    .from("cards")
    .select("id, scryfall_id, finish")
    .eq("active", true);
  if (!cards || cards.length === 0) return { updated: 0, failed: 0 };

  const today = new Date().toISOString().slice(0, 10);
  let updated = 0, failed = 0;

  // Scryfall /cards/collection accepts up to 75 identifiers per request.
  for (let i = 0; i < cards.length; i += 75) {
    const batch = cards.slice(i, i + 75);
    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TCGCardCall/0.1 (MVP fantasy market game)",
        Accept: "application/json",
      },
      body: JSON.stringify({ identifiers: batch.map((c) => ({ id: c.scryfall_id })) }),
      cache: "no-store",
    });
    if (!res.ok) { failed += batch.length; continue; }
    const json = (await res.json()) as {
      data: { id: string; prices: Record<string, string | null> }[];
    };
    const byId = new Map(json.data.map((d) => [d.id, d]));
    for (const card of batch) {
      const found = byId.get(card.scryfall_id);
      const field = card.finish === "foil" ? "usd_foil" : card.finish === "etched" ? "usd_etched" : "usd";
      const priceStr = found?.prices?.[field];
      const price = priceStr ? parseFloat(priceStr) : NaN;
      if (isNaN(price) || price <= 0) { failed++; continue; }
      const { data: prev } = await admin
        .from("price_snapshots")
        .select("price")
        .eq("card_id", card.id)
        .order("price_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { error } = await admin.from("price_snapshots").upsert(
        {
          card_id: card.id,
          price,
          previous_price: prev?.price ?? null,
          price_date: today,
          source: "scryfall",
        },
        { onConflict: "card_id,price_date" }
      );
      if (error) failed++; else updated++;
    }
    // Be polite to Scryfall between batches.
    await new Promise((r) => setTimeout(r, 150));
  }

  // Fill pending orders at today's freshly written prices, then re-rank.
  const { data: settlement, error: settleError } = await admin.rpc("settle_pending_orders", {
    p_price_date: today,
  });
  if (settleError) console.error("settle_pending_orders failed:", settleError.message);

  await admin.rpc("refresh_season_rankings");
  return { updated, failed, settlement: settlement ?? settleError?.message ?? null };
}
