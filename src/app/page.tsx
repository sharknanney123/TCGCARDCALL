import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export default async function Landing() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  return (
    <div className="py-16 max-w-2xl mx-auto text-center space-y-6">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold">Season play · Magic: The Gathering</p>
      <h1 className="font-display text-4xl sm:text-5xl leading-tight">
        Call the next card spike.
      </h1>
      <p className="text-faded text-lg">
        Start every season with $10,000 in virtual credits. Take fractional positions in 500 real Magic
        cards at real daily market prices. Climb the leaderboard on percent gain — and prove you saw
        the sleeper before it moved.
      </p>
      <div className="flex gap-3 justify-center">
        <Link href="/register" className="btn-gold">Join the season</Link>
        <Link href="/login" className="btn-ghost">Sign in</Link>
      </div>
      <p className="text-xs text-faded">
        Free-to-play. No real money, no prizes, no cash-out, no real card ownership.
      </p>
    </div>
  );
}
