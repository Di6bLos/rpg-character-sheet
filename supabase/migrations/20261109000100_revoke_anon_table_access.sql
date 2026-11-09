-- Signed-out visitors never read or write tables directly (row-level security
-- already returns nothing to them); removing the grants also hides the tables
-- from the anonymous API schema. Sign-up only needs public.handle_available().
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
