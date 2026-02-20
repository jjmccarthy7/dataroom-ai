-- Migration: create room_memberships table
-- Enables owner-to-investor invite system with token-based deep links.
--
-- Table columns:
--   id           UUID PK
--   room_id      FK -> data_rooms.id (CASCADE delete)
--   invited_by   FK -> auth.users (the owner who sent the invite)
--   email        the email address that was invited
--   handle       optional @handle if invited by handle (resolved at invite time)
--   user_id      FK -> auth.users (backfilled when the invited user accepts)
--   role         text, default 'investor'
--   status       text: 'pending' | 'accepted'
--   token        UUID used in the invite deep-link (?invite=<token>)
--   created_at   timestamptz

CREATE TABLE IF NOT EXISTS public.room_memberships (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID NOT NULL REFERENCES public.data_rooms(id) ON DELETE CASCADE,
  invited_by   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  handle       TEXT,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role         TEXT NOT NULL DEFAULT 'investor',
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted')),
  token        UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, email)
);

-- Index for fast lookup by token (deep-link accept flow)
CREATE INDEX IF NOT EXISTS room_memberships_token_idx
  ON public.room_memberships (token);

-- Index for fast lookup by room
CREATE INDEX IF NOT EXISTS room_memberships_room_idx
  ON public.room_memberships (room_id);

-- RLS
ALTER TABLE public.room_memberships ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies (idempotent)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'room_memberships'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.room_memberships', pol.policyname);
  END LOOP;
END;
$$;

-- Room owner can read all memberships for their rooms
CREATE POLICY "memberships_select_owner"
  ON public.room_memberships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.data_rooms dr
      WHERE dr.id = room_memberships.room_id
        AND dr.owner_id = auth.uid()
    )
  );

-- Invited user can read their own membership (by user_id or email match)
CREATE POLICY "memberships_select_member"
  ON public.room_memberships FOR SELECT
  USING (
    user_id = auth.uid()
    OR
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Only room owners can insert invites
CREATE POLICY "memberships_insert_owner"
  ON public.room_memberships FOR INSERT
  WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.data_rooms dr
      WHERE dr.id = room_memberships.room_id
        AND dr.owner_id = auth.uid()
    )
  );

-- Invited user can update their own row (accept); room owner can also update
CREATE POLICY "memberships_update_member_or_owner"
  ON public.room_memberships FOR UPDATE
  USING (
    user_id = auth.uid()
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.data_rooms dr
      WHERE dr.id = room_memberships.room_id
        AND dr.owner_id = auth.uid()
    )
  );

-- Room owner can delete (revoke) memberships
CREATE POLICY "memberships_delete_owner"
  ON public.room_memberships FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.data_rooms dr
      WHERE dr.id = room_memberships.room_id
        AND dr.owner_id = auth.uid()
    )
  );

-- Widen data_rooms SELECT so members can read rooms they are invited to
DROP POLICY IF EXISTS "data_rooms_select_owner" ON public.data_rooms;

CREATE POLICY "data_rooms_select_owner_or_member"
  ON public.data_rooms FOR SELECT
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.room_memberships rm
      WHERE rm.room_id = data_rooms.id
        AND (
          rm.user_id = auth.uid()
          OR rm.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        )
    )
  );

-- Widen documents SELECT so members can read docs in their rooms
DROP POLICY IF EXISTS "documents_select_uploader" ON public.documents;

CREATE POLICY "documents_select_uploader_or_member"
  ON public.documents FOR SELECT
  USING (
    uploader_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.data_rooms dr
      WHERE dr.id = documents.room_id
        AND dr.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.room_memberships rm
      WHERE rm.room_id = documents.room_id
        AND (
          rm.user_id = auth.uid()
          OR rm.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        )
    )
  );

-- Storage: members can read files in rooms they are invited to
DROP POLICY IF EXISTS "room_docs_select" ON storage.objects;

CREATE POLICY "room_docs_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'room-documents'
    AND (
      EXISTS (
        SELECT 1 FROM public.data_rooms dr
        WHERE dr.id::text = split_part(name, '/', 2)
          AND dr.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.room_memberships rm
        WHERE rm.room_id::text = split_part(name, '/', 2)
          AND (
            rm.user_id = auth.uid()
            OR rm.email = (SELECT email FROM auth.users WHERE id = auth.uid())
          )
      )
    )
  );
