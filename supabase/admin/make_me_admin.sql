-- =============================================================================
-- Fantasy Tennis — make yourself the first admin
-- 1. Sign in to the app with Google at least once.
-- 2. Replace the email below with YOUR Google email (keep the quotes).
-- 3. Run this in Supabase → SQL Editor.
-- After this, every other admin can be promoted from the Admin page.
-- =============================================================================
update public.profiles
set role = 'admin',
    joined_at = coalesce(joined_at, now())
where id = (select id from auth.users where lower(email) = lower('YOUR-EMAIL@gmail.com'));

-- Should show one row with role = admin. No rows? Check the email, and that
-- you've signed in to the app at least once.
select u.email, p.display_name, p.role, p.joined_at
from public.profiles p join auth.users u on u.id = p.id
where p.role = 'admin';
