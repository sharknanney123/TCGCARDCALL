\set ON_ERROR_STOP on
set app.uid = '11111111-1111-1111-1111-111111111111';

-- A second card that will be EXCLUDED from tournament 2's pool
insert into public.cards (scryfall_id, card_name, set_name, category, finish, active)
values ('scry-2', 'Pool Outsider', 'TST', 'popular', 'nonfoil', true);
insert into public.price_snapshots (card_id, price, price_date, source)
select id, 50.00, current_date, 'csv' from public.cards where scryfall_id = 'scry-2';

-- Tournament 2: $5,000 start, ZERO fee, 2 orders/day, $1,000 cap, pool = card A only
insert into public.seasons (name, start_date, end_date, status, starting_balance,
                            fee_bps, daily_order_limit, position_cap, min_order)
values ('Budget Brawl', current_date, current_date + 14, 'active', 5000, 0, 2, 1000, 5);

insert into public.season_cards (season_id, card_id)
select s.id, c.id from public.seasons s, public.cards c
where s.name = 'Budget Brawl' and c.scryfall_id = 'scry-1';

select public.join_season((select id from seasons where name='Budget Brawl'));
select 'T2 PORTFOLIO', virtual_cash from portfolios p join seasons s on s.id=p.season_id where s.name='Budget Brawl';

-- Guard: card outside T2's pool must be rejected
do $$ begin
  perform public.place_order((select id from seasons where name='Budget Brawl'),
    (select id from cards where scryfall_id='scry-2'), 'buy', 100, null);
  raise exception 'POOL NOT ENFORCED';
exception when others then raise notice 'pool guard OK: %', sqlerrm; end $$;

-- Zero-fee buy: $500 should reserve exactly $500.00
select public.place_order((select id from seasons where name='Budget Brawl'),
  (select id from cards where scryfall_id='scry-1'), 'buy', 500, null);
select 'T2 RESERVED (expect 500.00)', reserved_cash from portfolios p join seasons s on s.id=p.season_id where s.name='Budget Brawl';

-- Second order ok, third must hit the 2/day limit
select public.place_order((select id from seasons where name='Budget Brawl'),
  (select id from cards where scryfall_id='scry-1'), 'buy', 100, null);
do $$ begin
  perform public.place_order((select id from seasons where name='Budget Brawl'),
    (select id from cards where scryfall_id='scry-1'), 'buy', 50, null);
  raise exception 'DAILY LIMIT NOT ENFORCED';
exception when others then raise notice 'daily-limit guard OK: %', sqlerrm; end $$;

-- T1 must still allow orders today (separate per-tournament counter; T1 limit is 10)
select public.place_order((select id from seasons where name='Test Season'),
  (select id from cards where scryfall_id='scry-1'), 'buy', 20, null) ->> 'reserved' as t1_reserved_with_1pct_fee;

-- Settle everything at tomorrow's price
insert into public.price_snapshots (card_id, price, price_date, source)
select id, 125.00, current_date + 3, 'csv' from public.cards where scryfall_id='scry-1';
select public.settle_pending_orders(current_date + 3) as settlement;

select 'T2 AFTER FILL (0 fee)', virtual_cash, reserved_cash from portfolios p join seasons s on s.id=p.season_id where s.name='Budget Brawl';
select 'T2 FEES (expect 0)', coalesce(sum(t.fee),0) from trades t join seasons s on s.id=t.season_id where s.name='Budget Brawl';
select 'T1 FEES ON $20 (expect 0.20)', t.fee from trades t join seasons s on s.id=t.season_id where s.name='Test Season' order by t.id desc limit 1;

-- Cap guard at $1,000 in T2: already ~$600 cost basis, $500 more must fail
set app.uid = '11111111-1111-1111-1111-111111111111';
do $$ begin
  perform public.place_order((select id from seasons where name='Budget Brawl'),
    (select id from cards where scryfall_id='scry-1'), 'buy', 500, null);
  raise exception 'CAP NOT ENFORCED';
exception when others then raise notice 'cap guard OK: %', sqlerrm; end $$;

select public.refresh_season_rankings();
select 'RANKINGS RAN', s.name, p.total_value, p.percent_gain from portfolios p join seasons s on s.id=p.season_id order by s.name;
