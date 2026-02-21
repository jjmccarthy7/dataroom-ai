-- Migration: room-logos storage bucket
-- Creates a public bucket for data room logos, mirroring the avatars bucket pattern.
-- Owners can upload/update their own room logo; anyone (authenticated) can read.

-- 1. Create the bucket (public = true so getPublicUrl works without signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'room-logos',
  'room-logos',
  true,
  5242880,  -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Drop any existing policies on this bucket so re-running is idempotent
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'room_logos_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END;
$$;

-- 3. Public read: anyone can view logos (bucket is public, but belt-and-suspenders)
CREATE POLICY "room_logos_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'room-logos');

-- 4. Owner insert: only the room owner can upload a logo
CREATE POLICY "room_logos_insert_owner"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'room-logos'
    AND EXISTS (
      SELECT 1 FROM public.data_rooms dr
      WHERE dr.id::text = split_part(name, '/', 1)
        AND dr.owner_id = auth.uid()
    )
  );

-- 5. Owner update/replace (upsert): room owner can overwrite their logo
CREATE POLICY "room_logos_update_owner"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'room-logos'
    AND EXISTS (
      SELECT 1 FROM public.data_rooms dr
      WHERE dr.id::text = split_part(name, '/', 1)
        AND dr.owner_id = auth.uid()
    )
  );

-- 6. Owner delete: room owner can remove their logo
CREATE POLICY "room_logos_delete_owner"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'room-logos'
    AND EXISTS (
      SELECT 1 FROM public.data_rooms dr
      WHERE dr.id::text = split_part(name, '/', 1)
        AND dr.owner_id = auth.uid()
    )
  );
