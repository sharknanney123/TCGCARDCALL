#!/usr/bin/env node
/**
 * Build the card-pool CSV from a plain list of card names.
 *
 * 1. Put one card per line in pool.txt, optionally with a category:
 *      Lightning Bolt, popular
 *      Rhystic Study, commander
 *      Sheoldred the Apocalypse, meta
 *    (categories: popular | meta | commander | recent | sleeper; default popular)
 * 2. Run:  node scripts/build-pool.mjs pool.txt > pool.csv
 * 3. Upload pool.csv on the admin page, then run the price update.
 *
 * Uses Scryfall's fuzzy-named endpoint (one request per card, politely throttled).
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/build-pool.mjs pool.txt > pool.csv");
  process.exit(1);
}

const lines = readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const CATS = new Set(["popular", "meta", "commander", "recent", "sleeper"]);
const esc = (s) => (s.includes(",") || s.includes('"') ? `"${s.replaceAll('"', '""')}"` : s);

console.log("scryfall_id,card_name,set_name,image_url,category,finish");

for (const line of lines) {
  const parts = line.split(",").map((p) => p.trim());
  const maybeCat = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
  const category = CATS.has(maybeCat) ? maybeCat : "popular";
  const name = CATS.has(maybeCat) ? parts.slice(0, -1).join(", ") : line;

  const res = await fetch(
    `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`,
    { headers: { "User-Agent": "TCGCardCall/0.1 pool builder", Accept: "application/json" } }
  );
  if (!res.ok) {
    console.error(`! not found: ${name}`);
  } else {
    const c = await res.json();
    const price = parseFloat(c.prices?.usd ?? "0");
    if (!price || price < 1) {
      console.error(`! skipped (price $${c.prices?.usd ?? "?"} below $1 floor): ${c.name}`);
    } else {
      const img = c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal ?? "";
      console.log([c.id, esc(c.name), esc(c.set_name), img, category, "nonfoil"].join(","));
    }
  }
  await new Promise((r) => setTimeout(r, 120)); // be polite to Scryfall
}
