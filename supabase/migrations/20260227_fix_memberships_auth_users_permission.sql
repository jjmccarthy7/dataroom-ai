-- Migration: fix "permission denied for table users" on investor invite
-- Root cause: RLS policies on room_memberships (and is_room_member function)
-- directly queried auth.users via:
--   (SELECT email FROM auth.users WHERE id = auth.uid())
-- The `authenticated` role has no SELECT grant on auth.users, so this raised
-- "permission denied for table users" whenever the INSERT policy evaluated
-- its WITH CHECK clause and whenever memberships_select_member fired.
--
-- Fix: replace all auth.users subqueries with auth.email(), which reads the
-- email claim directly from the current user's JWT — no table access needed.

-- ── 1. Drop affected RLS policies ────────────────────────────────────────────
DROP POLICY IF EXISTS "memberships_select_member"           ON public.room_memberships;
DROP POLICY IF EXISTS "memberships_update_member_or_owner"  ON public.room_memberships;

-- ── 2. Recreate with auth.email() ────────────────────────────────────────────
-- SELECT: a user can see their own membership row (by user_id or email).
CREATE POLICY "memberships_select_member" ON public.room_memberships
  FOR SELECT USING (
      user_id = auth.uid()
      OR email = auth.email()
    );

-- UPDATE: a member can update their own row (e.g. accepting the invite),
--         and the room owner can update any membership row.
CREATE POLICY "memberships_update_member_or_owner" ON public.room_memberships
  FOR UPDATE USING (
      user_id = auth.uid()
      OR email = auth.email()
      OR EXISTS (
        SELECT 1 FROM public.data_rooms dr
        WHERE dr.id = room_memberships.room_id
          AND dr.owner_id = auth.uid()
      )
    );

-- ── 3. Rebuild is_room_member() with auth.email() ────────────────────────────
-- Although this function already runs as SECURITY DEFINER (postgres role),
-- using auth.email() is cleaner and avoids any future permission drift.
CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
      SELECT 1
      FROM public.room_memberships rm
      WHERE rm.room_id = p_room_id
        AND (
          rm.user_id = p_user_id
          OR rm.email = auth.email()
        )
    );
$$;
