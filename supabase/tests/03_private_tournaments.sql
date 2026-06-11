\set ON_ERROR_STOP on
set app.uid = '11111111-1111-1111-1111-111111111111';
insert into seasons (name, start_date, end_date, status, starting_balance, is_private, invite_code)
values ('Secret League', current_date, current_date + 14, 'active', 3000, true, 'ABC123');
do $$ begin perform join_season((select id from seasons where name='Secret League')); raise exception 'PRIVATE NOT ENFORCED'; exception when others then raise notice 'private guard OK: %', sqlerrm; end $$;
do $$ begin perform join_season((select id from seasons where name='Secret League'), 'wrong'); raise exception 'BAD CODE ACCEPTED'; exception when others then raise notice 'bad-code guard OK: %', sqlerrm; end $$;
select join_season(find_tournament_by_code(' abc123 '), 'abc123');
select 'JOINED PRIVATE', virtual_cash from portfolios p join seasons s on s.id=p.season_id where s.name='Secret League';
select 'LANDING EXCLUDES PRIVATE', (landing_stats())->'season'->>'name';
