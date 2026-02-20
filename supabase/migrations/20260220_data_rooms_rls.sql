-- Fix: Enable RLS + add owner-scoped policies for data_rooms and documents tables
--
-- Root cause:
--   The data_rooms and documents tables were created without RLS policies, so
--   authenticated users could not SELECT / INSERT / UPDATE / DELETE their own rows
--   via the Supabase anon key (all operations were silently denied or returned empty).
--
-- Fix:
--   1. Enable RLS on both tables (idempotent).
--   2. Drop any pre-existing policies to ensure a clean state.
--   3. Recreate minimal, non-recursive policies keyed on auth.uid().

-- ── data_rooms ────────────────────────────────────────────────────────────────

ALTER TABLE public.data_rooms ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'data_rooms'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.data_rooms', pol.policyname);
  END LOOP;
END;
$$;

-- Owner can read their own rooms
CREATE POLICY "data_rooms_select_owner"
  ON public.data_rooms
  FOR SELECT
  USING ( owner_id = auth.uid() );

-- Owner can create rooms (owner_id must equal the caller)
CREATE POLICY "data_rooms_insert_owner"
  ON public.data_rooms
  FOR INSERT
  WITH CHECK ( owner_id = auth.uid() );

-- Owner can update their own rooms
CREATE POLICY "data_rooms_update_owner"
  ON public.data_rooms
  FOR UPDATE
  USING  ( owner_id = auth.uid() )
  WITH CHECK ( owner_id = auth.uid() );

-- Owner can delete their own rooms
CREATE POLICY "data_rooms_delete_owner"
  ON public.data_rooms
  FOR DELETE
  USING ( owner_id = auth.uid() );

-- ── documents ─────────────────────────────────────────────────────────────────

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'documents'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.documents', pol.policyname);
  END LOOP;
END;
$$;

-- The uploader can read documents they uploaded
CREATE POLICY "documents_select_uploader"
  ON public.documents
  FOR SELECT
  USING ( uploader_id = auth.uid() );

-- Room owner can also read all documents in their rooms
CREATE POLICY "documents_select_room_owner"
  ON public.documents
  FOR SELECT
  USING (
      EXISTS (
        SELECT 1 FROM public.data_rooms dr
        WHERE dr.id = documents.room_id
          AND dr.owner_id = auth.uid()
      )
    );

-- Only authenticated users can insert documents into rooms they own
CREATE POLICY "documents_insert_room_owner"
  ON public.documents
  FOR INSERT
  WITH CHECK (
      uploader_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.data_rooms dr
        WHERE dr.id = documents.room_id
          AND dr.owner_id = auth.uid()
      )
    );

-- Only the uploader (or room owner) can delete a document
CREATE POLICY "documents_delete_uploader_or_owner"
  ON public.documents
  FOR DELETE
  USING (
      uploader_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.data_rooms dr
        WHERE dr.id = documents.room_id
          AND dr.owner_id = auth.uid()
      )
    );

-- ── room-documents storage bucket ─────────────────────────────────────────────
-- Allow authenticated room owners to upload / read / delete files in their rooms.
-- Storage RLS is managed in the storage.objects table.

-- Drop existing storage policies for room-documents (if any)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'room_docs_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END;
$$;

-- Read: authenticated users can read files in rooms they own
CREATE POLICY "room_docs_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
      bucket_id = 'room-documents'
      AND (
        -- path starts with rooms/<room_id>/
        EXISTS (
          SELECT 1 FROM public.data_rooms dr
          WHERE dr.id::text = split_part(name, '/', 2)
            AND dr.owner_id = auth.uid()
        )
      )
    );

-- Insert: authenticated users can upload to rooms they own
CREATE POLICY "room_docs_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
      bucket_id = 'room-documents'
      AND EXISTS (
        SELECT 1 FROM public.data_rooms dr
        WHERE dr.id::text = split_part(name, '/', 2)
          AND dr.owner_id = auth.uid()
      )
    );

-- Delete: authenticated users can delete from rooms they own
CREATE POLICY "room_docs_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
      bucket_id = 'room-documents'
      AND EXISTS (
        SELECT 1 FROM public.data_rooms dr
        WHERE dr.id::text = split_part(name, '/', 2)
          AND dr.owner_id = auth.uid()
      )
    );
