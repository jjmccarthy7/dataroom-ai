-- Fix: Infinite recursion in profiles RLS policies
--
-- Root cause:
--   The UPDATE policy (and possibly the SELECT policy) on the "profiles" table
--   used auth.uid() inside a subquery that itself queried "profiles" — e.g.:
--
--     USING (
--       id = auth.uid()
--       OR EXISTS (
--         SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
--       )
--     )
--
--   When Postgres evaluates the RLS policy for the UPDATE on "profiles", it
--   triggers the SELECT policy, which in turn re-evaluates the RLS policy,
--   which triggers it again — infinitely.
--
-- Fix:
--   Replace all subqueries that re-read the "profiles" table with direct calls
--   to auth.uid() or auth.jwt() only.  A user is allowed to read/update their
--   own row when profiles.id = auth.uid().  No self-referential subquery needed.

-- ── 1. DROP ALL EXISTING POLICIES ON profiles ────────────────────────────────
-- We drop and recreate to guarantee a clean state regardless of prior naming.

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM   pg_policies
    WHERE  schemaname = 'public'
    AND    tablename  = 'profiles'
  LOOP
    EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.profiles',
        pol.policyname
      );
  END LOOP;
END;
$$;

-- ── 2. ENSURE RLS IS ENABLED ─────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ── 3. RECREATE POLICIES (no self-referential subqueries) ────────────────────

-- SELECT: a user can read their own profile row.
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING ( id = auth.uid() );

-- INSERT: only the auth service / trigger inserts profile rows on signup.
-- We allow authenticated users to insert only their own row as a safety net.
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  WITH CHECK ( id = auth.uid() );

-- UPDATE: a user can update only their own profile row.
-- auth.uid() is resolved once by Postgres and never touches the profiles table,
-- so there is no recursion.
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING     ( id = auth.uid() )
  WITH CHECK( id = auth.uid() );

-- DELETE: users cannot delete their own profile rows via the client.
-- Deletion is handled server-side only (no policy = deny).
-- (No policy created — default DENY applies.)
