# Engine regression tests

Run these against a scratch Postgres before changing any trading-engine SQL
(place_order, settle_pending_orders, cancel_order, end_season).

```bash
createdb tcg_test
psql -d tcg_test -v ON_ERROR_STOP=1 \
  -f tests/00_stub_auth.sql \      # stubs Supabase's auth schema + roles
  -f ../schema.sql \               # base schema
  -f <each migration, in order>    # the migrations applied to production
psql -d tcg_test -f tests/01_single_tournament.sql
psql -d tcg_test -f tests/02_multi_tournament.sql   # needs fresh db (truncate first)
psql -d tcg_test -f tests/03_private_tournaments.sql
```

Every test prints expected values in its labels (e.g. "expect 500.00").
A test FAILS if any `DO` block raises "X NOT ENFORCED" or any printed
number disagrees with its label. Keep schema.sql + a migrations/ folder
in sync with production so these tests reflect reality.
