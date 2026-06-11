-- ============================================================================
-- IMPROVEMENTS MIGRATION: private tournaments + invite codes
-- Run the whole file in the Supabase SQL editor.
-- ============================================================================

alter table public.seasons
  add column if not exists is_private boolean not null default false,
  add column if not exists invite_code text;

create unique index if not exists seasons_invite_code_key
  on public.seasons (upper(invite_code)) where invite_code is not null;

-- join_season gains an optional invite code (drop the old single-arg version
-- so the new default-parameter version doesn't create an ambiguous overload)
drop function if exists public.join_season(uuid);

create or replace function public.join_season(p_season uuid, p_code text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  s record;
  v_count int;
begin
  if v_user is null then raise exception 'Not signed in.'; end if;

  select * into s from public.seasons where id = p_season;
  if not found or s.status <> 'active' then
    raise exception 'This tournament is not open.';
  end if;
  if current_date > s.end_date then
    raise exception 'This tournament has already ended.';
  end if;

  if s.is_private and (p_code is null or upper(trim(p_code)) is distinct from upper(s.invite_code)) then
    raise exception 'This tournament is private — a valid invite code is required.';
  end if;

  if exists (select 1 from public.portfolios where user_id = v_user and season_id = p_season) then
    return;
  end if;

  if s.max_players is not null then
    select count(*) into v_count from public.portfolios where season_id = p_season;
    if v_count >= s.max_players then
      raise exception 'This tournament is full (% players max).', s.max_players;
    end if;
  end if;

  insert into public.portfolios (user_id, season_id, virtual_cash, total_value, late_joiner)
  values (v_user, p_season, s.starting_balance, s.starting_balance,
          (current_date - s.start_date) > 7);
end $$;

-- Look up a tournament by invite code (so joining by code doesn't require
-- the season id client-side). Returns the season id when the code matches.
create or replace function public.find_tournament_by_code(p_code text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.seasons
  where status = 'active' and invite_code is not null
    and upper(invite_code) = upper(trim(p_code))
  limit 1;
$$;

-- Public landing stats must never leak private tournaments.
-- (Re-run of landing_stats with "and not is_private" filters; if you never
-- ran landing_stats_migration.sql, this creates it fresh — both fine.)
create or replace function public.landing_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_season record;
  v_gainers jsonb;
  v_losers jsonb;
  v_leaders jsonb;
  v_players int := 0;
  v_cards int := 0;
begin
  select id, name, end_date into v_season
  from seasons where status = 'active' and not is_private
  order by start_date desc limit 1;

  select count(*) into v_cards from cards where active = true;

  with bounds as (
    select card_id, min(price_date) as first_date, max(price_date) as last_date
    from price_snapshots where price_date >= current_date - 7
    group by card_id having min(price_date) < max(price_date)
  ),
  changes as (
    select b.card_id, p1.price as start_price, p2.price as end_price,
           round((p2.price - p1.price) / p1.price * 100, 2) as week_pct
    from bounds b
    join lateral (select price from price_snapshots
                  where card_id = b.card_id and price_date = b.first_date
                  order by created_at desc limit 1) p1 on true
    join lateral (select price from price_snapshots
                  where card_id = b.card_id and price_date = b.last_date
                  order by created_at desc limit 1) p2 on true
    where p1.price > 0
  )
  select
    (select jsonb_agg(g) from (
       select c.card_name, c.set_name, c.image_url, ch.end_price as price, ch.week_pct
       from changes ch join cards c on c.id = ch.card_id and c.active
       order by ch.week_pct desc limit 4) g),
    (select jsonb_agg(l) from (
       select c.card_name, c.set_name, c.image_url, ch.end_price as price, ch.week_pct
       from changes ch join cards c on c.id = ch.card_id and c.active
       order by ch.week_pct asc limit 2) l)
  into v_gainers, v_losers;

  if v_season.id is not null then
    select count(*) into v_players from portfolios where season_id = v_season.id;

    select jsonb_agg(jsonb_build_object(
             'rank', t.rank, 'username', t.username, 'percent_gain', t.percent_gain))
    into v_leaders
    from (select p.rank, pr.username, p.percent_gain
          from portfolios p join profiles pr on pr.id = p.user_id
          where p.season_id = v_season.id and p.rank is not null
          order by p.rank asc limit 5) t;

    if v_leaders is null then
      select jsonb_agg(jsonb_build_object(
               'rank', null, 'username', t.username, 'percent_gain', t.percent_gain))
      into v_leaders
      from (select pr.username, p.percent_gain
            from portfolios p join profiles pr on pr.id = p.user_id
            where p.season_id = v_season.id and p.total_trades > 0
            order by p.percent_gain desc limit 5) t;
    end if;
  end if;

  return jsonb_build_object(
    'season', case when v_season.id is null then null else
      jsonb_build_object('name', v_season.name, 'end_date', v_season.end_date) end,
    'gainers', coalesce(v_gainers, '[]'::jsonb),
    'losers',  coalesce(v_losers,  '[]'::jsonb),
    'leaders', coalesce(v_leaders, '[]'::jsonb),
    'players', v_players,
    'cards',   v_cards
  );
end $$;

grant execute on function public.join_season(uuid, text) to authenticated;
grant execute on function public.find_tournament_by_code(text) to authenticated;
grant execute on function public.landing_stats() to anon, authenticated;
