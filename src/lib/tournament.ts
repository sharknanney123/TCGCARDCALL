import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

export const TOURNAMENT_COOKIE = "tcc_tid";

export type Tournament = {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: string;
  starting_balance: number;
  fee_bps: number;
  daily_order_limit: number;
  position_cap: number | null;
  min_order: number;
  max_players: number | null;
};

export type TournamentContext = {
  current: Tournament | null;      // the tournament every page should scope to
  joined: Tournament[];            // active tournaments the user has joined
  activeCount: number;             // all active tournaments (for "browse" nudges)
};

/**
 * Resolve which tournament the signed-in user is currently viewing.
 * Priority: cookie (if it points at an active tournament the user joined)
 * -> most recently joined active tournament -> most recent active tournament.
 */
export async function getTournamentContext(userId: string): Promise<TournamentContext> {
  const supabase = supabaseServer();

  const { data: active } = await supabase
    .from("seasons").select("*").eq("status", "active")
    .order("start_date", { ascending: false });

  const activeSeasons = (active ?? []) as Tournament[];
  if (activeSeasons.length === 0) return { current: null, joined: [], activeCount: 0 };

  const { data: memberships } = await supabase
    .from("portfolios").select("season_id, joined_at")
    .eq("user_id", userId)
    .in("season_id", activeSeasons.map((s) => s.id))
    .order("joined_at", { ascending: false });

  const joinedIds = new Set((memberships ?? []).map((m) => m.season_id));
  const joined = activeSeasons.filter((s) => joinedIds.has(s.id));

  const cookieId = cookies().get(TOURNAMENT_COOKIE)?.value;

  const current =
    joined.find((s) => s.id === cookieId) ??
    activeSeasons.find((s) => s.id === cookieId && joinedIds.has(s.id)) ??
    joined[0] ??
    activeSeasons[0];

  return { current, joined, activeCount: activeSeasons.length };
}
