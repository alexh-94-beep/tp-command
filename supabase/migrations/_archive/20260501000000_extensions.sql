-- Postgres-Extensions, die wir brauchen.

-- gen_random_uuid()
create extension if not exists "pgcrypto";

-- daterange + EXCLUDE USING gist
create extension if not exists "btree_gist";
