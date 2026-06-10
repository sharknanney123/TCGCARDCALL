-- ============================================================
-- TCGCardCall — Supabase schema (v2 spec)
-- Run this whole file in the Supabase SQL editor on a fresh project.
-- All game rules are enforced in execute_trade() so the client
-- can never bypass fees, limits, caps, or stale-price checks.
-- ============================================================

-- ---------- Profiles ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  role text not null default 'player' check (role in ('player','admin')),
  created_at timestamptz not null default now()
);

-- Create a profile automatically on signup (username passed in metadata).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'player_' || left(new.id::text, 8)));
  return new;
exception when unique_violation then
  -- Username taken: fall back to a suffixed name instead of breaking signup.
  insert into public.profiles (id, username)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'username', 'player'), 13) || '_' || left(new.id::text, 6));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Seasons ----------
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  starting_balance numeric(14,2) not null default 10000,
  status text not null default 'active' check (status in ('upcoming','active','archived')),
  created_at timestamptz not null default now()
);

create table public.season_results (
  season_id uuid not null references public.seasons,
  user_id uuid not null references public.profiles,
  final_rank int,
  final_portfolio_value numeric(14,2) not null,
  final_percent_gain numeric(10,4) not null,
  qualified boolean not null default false,
  late_joiner boolean not null default false,
  primary key (season_id, user_id)
);

-- ---------- Cards & prices ----------
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  scryfall_id text unique not null,
  card_name text not null,
  set_name text not null,
  image_url text,
  category text not null check (category in ('popular','meta','commander','recent','sleeper')),
  finish text not null default 'nonfoil' check (finish in ('nonfoil','foil','etched')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.price_snapshots (
  id bigint generated always as identity primary key,
  card_id uuid not null references public.cards,
  price numeric(12,2) not null check (price > 0),
  previous_price numeric(12,2),
  price_date date not null,
  source text not null default 'scryfall' check (source in ('scryfall','csv','manual')),
  created_at timestamptz not null default now(),
  unique (card_id, price_date)
);
create index on public.price_snapshots (card_id, price_date desc);

-- Latest + previous price per card, with freshness flag.
create or replace view public.v_card_prices as
select
  c.id as card_id, c.scryfall_id, c.card_name, c.set_name, c.image_url,
  c.category, c.finish, c.active,
  s.price as current_price,
  s.previous_price,
  s.price_date,
  case when s.previous_price is not null and s.previous_price > 0
       then round((s.price - s.previous_price) / s.previous_price * 100, 2)
       else 0 end as pct_change,
  (s.created_at > now() - interval '48 hours') as price_fresh
from public.cards c
left join lateral (
  select * from public.price_snapshots ps
  where ps.card_id = c.id
  order by ps.price_date desc limit 1
) s on true;

-- ---------- Portfolios, positions, trades ----------
create table public.portfolios (
  user_id uuid not null references public.profiles,
  season_id uuid not null references public.seasons,
  virtual_cash numeric(14,2) not null,
  total_value numeric(14,2) not null,
  percent_gain numeric(10,4) not null default 0,
  rank int,
  distinct_cards_traded int not null default 0,
  total_trades int not null default 0,
  late_joiner boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (user_id, season_id)
);

create table public.positions (
  user_id uuid not null references public.profiles,
  season_id uuid not null references public.seasons,
  card_id uuid not null references public.cards,
  quantity numeric(18,4) not null check (quantity >= 0),
  average_buy_price numeric(12,4) not null,
  cost_basis numeric(14,2) not null,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, season_id, card_id)
);

create table public.trades (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles,
  season_id uuid not null references public.seasons,
  card_id uuid not null references public.cards,
  side text not null check (side in ('buy','sell')),
  quantity numeric(18,4) not null,
  price numeric(12,2) not null,
  gross_value numeric(14,2) not null,
  fee numeric(14,2) not null,
  net_value numeric(14,2) not null,
  realized_gain numeric(14,2),          -- sells only
  avg_buy_at_sale numeric(12,4),        -- sells only
  held_hours numeric(10,1),             -- sells only
  created_at timestamptz not null default now()
);
create index on public.trades (season_id, side);
create index on public.trades (user_id, season_id);

create table public.watchlist (
  user_id uuid not null references public.profiles,
  card_id uuid not null references public.cards,
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table public.daily_trade_counts (
  user_id uuid not null references public.profiles,
  day date not null,
  trade_count int not null default 0,
  primary key (user_id, day)
);

create table public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles,
  event_type text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.analytics_events (event_type, created_at);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- Views: leaderboard, biggest calls, movers ----------
create or replace view public.v_leaderboard as
select
  p.season_id, p.user_id, pr.username,
  p.total_value, p.percent_gain, p.rank,
  p.distinct_cards_traded, p.total_trades,
  (p.distinct_cards_traded >= 3) as qualified,
  p.late_joiner
from public.portfolios p
join public.profiles pr on pr.id = p.user_id;

-- Held calls (open positions) UNION sold calls (sell trades).
-- Qualification: >= $10 cost basis and >= 24h held.
create or replace view public.v_biggest_calls as
select
  pos.season_id, pos.user_id, pr.username,
  pos.card_id, cp.card_name, cp.image_url,
  'held'::text as status,
  pos.average_buy_price as buy_price,
  cp.current_price as exit_or_current_price,
  round((cp.current_price - pos.average_buy_price) / pos.average_buy_price * 100, 2) as gain_pct,
  round((cp.current_price - pos.average_buy_price) * pos.quantity, 2) as gain_usd,
  pos.opened_at as bought_at
from public.positions pos
join public.profiles pr on pr.id = pos.user_id
join public.v_card_prices cp on cp.card_id = pos.card_id
where pos.quantity > 0
  and pos.cost_basis >= 10
  and pos.average_buy_price > 0
  and pos.opened_at < now() - interval '24 hours'
union all
select
  t.season_id, t.user_id, pr.username,
  t.card_id, c.card_name, c.image_url,
  'sold'::text as status,
  t.avg_buy_at_sale as buy_price,
  t.price as exit_or_current_price,
  round((t.price - t.avg_buy_at_sale) / t.avg_buy_at_sale * 100, 2) as gain_pct,
  round((t.price - t.avg_buy_at_sale) * t.quantity, 2) as gain_usd,
  t.created_at - make_interval(hours => coalesce(t.held_hours, 0)::int) as bought_at
from public.trades t
join public.profiles pr on pr.id = t.user_id
join public.cards c on c.id = t.card_id
where t.side = 'sell'
  and t.avg_buy_at_sale is not null and t.avg_buy_at_sale > 0
  and coalesce(t.held_hours, 0) >= 24
  and (t.avg_buy_at_sale * t.quantity) >= 10;

-- ---------- Helpers ----------
create or replace function public.active_season_id()
returns uuid language sql stable as $$
  select id from public.seasons where status = 'active'
  order by start_date desc limit 1
$$;

create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and role = 'admin')
$$;

-- Recompute one portfolio's totals.
create or replace function public.recalc_portfolio(p_user uuid, p_season uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_holdings numeric(14,2);
  v_start numeric(14,2);
begin
  select coalesce(sum(round(pos.quantity * cp.current_price, 2)), 0)
    into v_holdings
  from public.positions pos
  join public.v_card_prices cp on cp.card_id = pos.card_id
  where pos.user_id = p_user and pos.season_id = p_season and pos.quantity > 0;

  select starting_balance into v_start from public.seasons where id = p_season;

  update public.portfolios
  set total_value = virtual_cash + v_holdings,
      percent_gain = round((virtual_cash + v_holdings - v_start) / v_start * 100, 4)
  where user_id = p_user and season_id = p_season;
end $$;

-- ---------- Join the active season ----------
create or replace function public.join_active_season()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_season uuid := public.active_season_id();
  v_start numeric(14,2);
  v_started date;
begin
  if v_season is null then return; end if;
  if exists (select 1 from public.portfolios where user_id = auth.uid() and season_id = v_season) then
    return;
  end if;
  select starting_balance, start_date into v_start, v_started from public.seasons where id = v_season;
  insert into public.portfolios (user_id, season_id, virtual_cash, total_value, late_joiner)
  values (auth.uid(), v_season, v_start, v_start,
          (current_date - v_started) > 7);
end $$;

-- ---------- The trading engine ----------
-- Enforces: active season, fresh price (<48h), card active, min $10,
-- 10 trades/day (America/Chicago), $2,500 position cap, no shorting,
-- 1% fee, 4-decimal quantities, weighted-average cost accounting.
create or replace function public.execute_trade(
  p_card uuid,
  p_side text,
  p_amount numeric default null,    -- dollar amount (pre-fee), or
  p_quantity numeric default null   -- fractional quantity
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_season uuid := public.active_season_id();
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_count int;
  v_price numeric(12,2);
  v_fresh boolean;
  v_active boolean;
  v_qty numeric(18,4);
  v_value numeric(14,2);
  v_fee numeric(14,2);
  v_cash numeric(14,2);
  v_pos public.positions%rowtype;
  v_new_qty numeric(18,4);
  v_realized numeric(14,2);
  v_held numeric(10,1);
begin
  if v_user is null then raise exception 'Not signed in.'; end if;
  if v_season is null then raise exception 'No active season.'; end if;
  if p_side not in ('buy','sell') then raise exception 'Invalid side.'; end if;

  if not exists (select 1 from public.portfolios where user_id = v_user and season_id = v_season) then
    raise exception 'Join the season first.';
  end if;

  select current_price, price_fresh, active into v_price, v_fresh, v_active
  from public.v_card_prices where card_id = p_card;
  if v_price is null then raise exception 'No price for this card yet.'; end if;
  if not v_fresh then raise exception 'Price is stale (older than 48 hours). Trading is paused for this card.'; end if;
  if p_side = 'buy' and not v_active then raise exception 'This card is no longer buyable this season.'; end if;

  select coalesce(trade_count, 0) into v_count
  from public.daily_trade_counts where user_id = v_user and day = v_today;
  if coalesce(v_count, 0) >= 10 then
    raise exception 'Daily limit reached: 10 trades per day.';
  end if;

  -- Resolve quantity and value (quantities to 4 dp, currency to 2 dp).
  if p_quantity is not null and p_quantity > 0 then
    v_qty := round(p_quantity, 4);
  elsif p_amount is not null and p_amount > 0 then
    v_qty := round(p_amount / v_price, 4);
  else
    raise exception 'Enter an amount or a quantity.';
  end if;
  v_value := round(v_qty * v_price, 2);
  if v_value < 10 then raise exception 'Minimum trade is $10.'; end if;
  v_fee := round(v_value * 0.01, 2);

  select virtual_cash into v_cash from public.portfolios
  where user_id = v_user and season_id = v_season for update;

  select * into v_pos from public.positions
  where user_id = v_user and season_id = v_season and card_id = p_card for update;

  if p_side = 'buy' then
    if v_cash < v_value + v_fee then raise exception 'Not enough virtual cash.'; end if;
    if coalesce(v_pos.cost_basis, 0) + v_value > 2500 then
      raise exception 'Position cap: max $2,500 cost basis per card. Headroom: $%',
        to_char(2500 - coalesce(v_pos.cost_basis, 0), 'FM9999990.00');
    end if;

    update public.portfolios set virtual_cash = virtual_cash - (v_value + v_fee)
    where user_id = v_user and season_id = v_season;

    if v_pos.user_id is null then
      insert into public.positions (user_id, season_id, card_id, quantity, average_buy_price, cost_basis)
      values (v_user, v_season, p_card, v_qty, round(v_value / v_qty, 4), v_value);
    else
      v_new_qty := v_pos.quantity + v_qty;
      update public.positions
      set quantity = v_new_qty,
          cost_basis = v_pos.cost_basis + v_value,
          average_buy_price = round((v_pos.cost_basis + v_value) / v_new_qty, 4),
          updated_at = now()
      where user_id = v_user and season_id = v_season and card_id = p_card;
    end if;

    insert into public.trades (user_id, season_id, card_id, side, quantity, price, gross_value, fee, net_value)
    values (v_user, v_season, p_card, 'buy', v_qty, v_price, v_value, v_fee, v_value + v_fee);

  else -- sell
    if v_pos.user_id is null or v_pos.quantity < v_qty then
      raise exception 'You can only sell what you own (no shorting).';
    end if;
    v_realized := round((v_price - v_pos.average_buy_price) * v_qty, 2) - v_fee;
    v_held := round(extract(epoch from (now() - v_pos.opened_at)) / 3600.0, 1);
    v_new_qty := round(v_pos.quantity - v_qty, 4);

    update public.portfolios set virtual_cash = virtual_cash + (v_value - v_fee)
    where user_id = v_user and season_id = v_season;

    if v_new_qty <= 0.0000 then
      delete from public.positions
      where user_id = v_user and season_id = v_season and card_id = p_card;
    else
      update public.positions
      set quantity = v_new_qty,
          cost_basis = round(average_buy_price * v_new_qty, 2),
          updated_at = now()
      where user_id = v_user and season_id = v_season and card_id = p_card;
    end if;

    insert into public.trades (user_id, season_id, card_id, side, quantity, price, gross_value, fee, net_value,
                               realized_gain, avg_buy_at_sale, held_hours)
    values (v_user, v_season, p_card, 'sell', v_qty, v_price, v_value, v_fee, v_value - v_fee,
            v_realized, v_pos.average_buy_price, v_held);
  end if;

  insert into public.daily_trade_counts (user_id, day, trade_count)
  values (v_user, v_today, 1)
  on conflict (user_id, day) do update set trade_count = public.daily_trade_counts.trade_count + 1;

  update public.portfolios p set
    total_trades = total_trades + 1,
    distinct_cards_traded = (select count(distinct card_id) from public.trades t
                             where t.user_id = v_user and t.season_id = v_season)
  where p.user_id = v_user and p.season_id = v_season;

  perform public.recalc_portfolio(v_user, v_season);

  insert into public.analytics_events (user_id, event_type, metadata)
  values (v_user, 'trade_confirmed', jsonb_build_object('card_id', p_card, 'side', p_side, 'value', v_value));

  return jsonb_build_object('ok', true, 'quantity', v_qty, 'value', v_value, 'fee', v_fee);
end $$;

-- ---------- Daily recalculation (called after price ingest) ----------
create or replace function public.refresh_season_rankings()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_season uuid := public.active_season_id();
  r record;
begin
  if v_season is null then return; end if;
  for r in select user_id from public.portfolios where season_id = v_season loop
    perform public.recalc_portfolio(r.user_id, v_season);
  end loop;
  with ranked as (
    select user_id,
           row_number() over (
             order by percent_gain desc, joined_at asc, total_trades asc
           ) as rn
    from public.portfolios
    where season_id = v_season and distinct_cards_traded >= 3 and not late_joiner
  )
  update public.portfolios p
  set rank = ranked.rn
  from ranked where p.user_id = ranked.user_id and p.season_id = v_season;
  update public.portfolios
  set rank = null
  where season_id = v_season and (distinct_cards_traded < 3 or late_joiner);
end $$;

-- ---------- Season end: fee-free liquidation, archive, reset ----------
create or replace function public.end_active_season()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_season uuid := public.active_season_id();
  r record;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Admins only.'; end if;
  if v_season is null then raise exception 'No active season.'; end if;

  -- Liquidate every open position at the latest snapshot price, no fee.
  for r in
    select pos.user_id, pos.card_id, pos.quantity, pos.average_buy_price, cp.current_price
    from public.positions pos
    join public.v_card_prices cp on cp.card_id = pos.card_id
    where pos.season_id = v_season and pos.quantity > 0
  loop
    update public.portfolios
    set virtual_cash = virtual_cash + round(r.quantity * r.current_price, 2)
    where user_id = r.user_id and season_id = v_season;
  end loop;
  delete from public.positions where season_id = v_season;

  update public.portfolios set total_value = virtual_cash where season_id = v_season;
  perform public.refresh_season_rankings();

  insert into public.season_results (season_id, user_id, final_rank, final_portfolio_value, final_percent_gain, qualified, late_joiner)
  select season_id, user_id, rank, total_value, percent_gain, distinct_cards_traded >= 3, late_joiner
  from public.portfolios where season_id = v_season;

  update public.seasons set status = 'archived' where id = v_season;

  insert into public.admin_audit_log (admin_id, action, detail)
  values (auth.uid(), 'season_ended', jsonb_build_object('season_id', v_season));
end $$;

-- ---------- Analytics ----------
create or replace function public.log_event(p_type text, p_meta jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.analytics_events (user_id, event_type, metadata)
  values (auth.uid(), p_type, coalesce(p_meta, '{}'))
$$;

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.season_results enable row level security;
alter table public.cards enable row level security;
alter table public.price_snapshots enable row level security;
alter table public.portfolios enable row level security;
alter table public.positions enable row level security;
alter table public.trades enable row level security;
alter table public.watchlist enable row level security;
alter table public.daily_trade_counts enable row level security;
alter table public.analytics_events enable row level security;
alter table public.admin_audit_log enable row level security;

-- Public game data: any signed-in user can read.
create policy "read profiles" on public.profiles for select to authenticated using (true);
create policy "read seasons" on public.seasons for select to authenticated using (true);
create policy "read season results" on public.season_results for select to authenticated using (true);
create policy "read cards" on public.cards for select to authenticated using (true);
create policy "read prices" on public.price_snapshots for select to authenticated using (true);
-- Portfolios/positions/trades are public by design (public portfolio pages).
create policy "read portfolios" on public.portfolios for select to authenticated using (true);
create policy "read positions" on public.positions for select to authenticated using (true);
create policy "read trades" on public.trades for select to authenticated using (true);
-- Private data.
create policy "own watchlist" on public.watchlist for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own trade counts" on public.daily_trade_counts for select to authenticated
  using (user_id = auth.uid());
-- No direct insert/update policies on portfolios/positions/trades/events:
-- all writes go through the security-definer functions above or the
-- service-role key (admin server actions and the cron job).

-- ============================================================
-- After running this file:
-- 1. In Auth -> Providers -> Email, require email confirmation.
-- 2. Promote yourself to admin:
--      update public.profiles set role = 'admin' where username = 'YOUR_USERNAME';
-- 3. Create the first season:
--      insert into public.seasons (name, start_date, end_date)
--      values ('Season 1', current_date, current_date + interval '30 days');
-- 4. Import the card pool (admin page CSV upload, or insert into cards),
--    then trigger the price update from the admin page.
-- ============================================================
