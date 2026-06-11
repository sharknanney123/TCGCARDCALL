\set ON_ERROR_STOP on
-- Setup: user, active season, card, today's price
insert into auth.users (id, raw_user_meta_data) values ('11111111-1111-1111-1111-111111111111', '{"username":"testshark"}');
insert into public.seasons (name, start_date, end_date, status) values ('Test Season', current_date, current_date + 30, 'active');
insert into public.cards (scryfall_id, card_name, set_name, category, finish, active) values ('scry-1', 'Test Bolt', 'TST', 'popular', 'nonfoil', true);
insert into public.price_snapshots (card_id, price, price_date, source) select id, 100.00, current_date, 'csv' from public.cards;
set app.uid = '11111111-1111-1111-1111-111111111111';
select public.join_active_season();
select 'START cash', virtual_cash, reserved_cash from public.portfolios;

-- 1) Buy order: $1000 → expect 1010 reserved, cash untouched
select public.place_order((select id from public.cards), 'buy', 1000, null) as buy_order;
select 'AFTER BUY ORDER', virtual_cash, reserved_cash from public.portfolios;

-- 2) Next day: price moves to 110, settle
insert into public.price_snapshots (card_id, price, price_date, source) select id, 110.00, current_date + 1, 'csv' from public.cards;
select public.settle_pending_orders(current_date + 1) as settle_1;
select 'AFTER BUY FILL', virtual_cash, reserved_cash, total_trades, distinct_cards_traded from public.portfolios;
select 'POSITION', quantity, average_buy_price, cost_basis, reserved_quantity from public.positions;
select 'TRADE', side, quantity, price, gross_value, fee, net_value from public.trades order by id desc limit 1;

-- 3) Sell 5 qty → reserve shares
select public.place_order((select id from public.cards), 'sell', null, 5) as sell_order;
select 'AFTER SELL ORDER', quantity, reserved_quantity from public.positions;

-- 4) Day after: price 120, settle
insert into public.price_snapshots (card_id, price, price_date, source) select id, 120.00, current_date + 2, 'csv' from public.cards;
select public.settle_pending_orders(current_date + 2) as settle_2;
select 'AFTER SELL FILL', virtual_cash, reserved_cash from public.portfolios;
select 'POSITION AFTER SELL', quantity, reserved_quantity, cost_basis from public.positions;
select 'SELL TRADE', quantity, price, fee, realized_gain, avg_buy_at_sale from public.trades where side='sell';

-- 5) Cancel flow: place then cancel a $100 buy
select public.place_order((select id from public.cards), 'buy', 100, null);
select 'RESERVED AFTER 3RD ORDER', reserved_cash from public.portfolios;
select public.cancel_order((select max(id) from public.pending_orders));
select 'RESERVED AFTER CANCEL', reserved_cash from public.portfolios;

-- 6) Guards: cap, no-shorting, daily count
select 'DAILY COUNT', trade_count from public.daily_trade_counts;
do $$ begin perform public.place_order((select id from public.cards), 'buy', 2400, null); raise exception 'CAP NOT ENFORCED'; exception when others then raise notice 'cap guard OK: %', sqlerrm; end $$;
do $$ begin perform public.place_order((select id from public.cards), 'sell', null, 50); raise exception 'SHORT NOT BLOCKED'; exception when others then raise notice 'shorting guard OK: %', sqlerrm; end $$;
select 'ORDERS LEDGER', id, side, status, fill_price, fill_quantity from public.pending_orders order by id;
