-- Fix: avatars storage bucket RLS policies blocking avatar uploads
--
-- Root cause:
--   The 'avatars' storage bucket has no INSERT policy (or a policy that
--   doesn't match the upload path), so authenticated users cannot upload.
--
--   profile.html uploads to path:  {user_id}.{ext}   (flat at bucket root)
--   supabase-config.js uses path:  {user_id}/avatar.{ext}  (subfolder)
--
-- Fix:
--   Drop any existing avatar storage policies and recreate them to allow
--   authenticated users to INSERT/UPDATE/SELECT/DELETE their own files
--   under both path patterns. Also add a public SELECT so avatar URLs
--   render correctly anywhere on the platform.

-- ── 1. DROP EXISTING AVATARS STORAGE POLICIES ────────────────────────────────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname ILIKE '%avatar%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END;
$$;

-- ── 2. ENSURE BUCKET EXISTS ───────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;

-- ── 3. POLICIES ───────────────────────────────────────────────────────────────

CREATE POLICY "avatars_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
      bucket_id = 'avatars' AND (
        name LIKE (auth.uid()::text || '.%') OR
        name LIKE (auth.uid()::text || '/%')
      )
    );

CREATE POLICY "avatars_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
      bucket_id = 'avatars' AND (
        name LIKE (auth.uid()::text || '.%') OR
        name LIKE (auth.uid()::text || '/%')
      )
    );

CREATE POLICY "avatars_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
      bucket_id = 'avatars' AND (
        name LIKE (auth.uid()::text || '.%') OR
        name LIKE (auth.uid()::text || '/%')
      )
    );

CREATE POLICY "avatars_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
      bucket_id = 'avatars' AND (
        name LIKE (auth.uid()::text || '.%') OR
        name LIKE (auth.uid()::text || '/%')
      )
    );

-- Public read so avatar image URLs work everywhere (data rooms, nav, etc.)
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT TO public
  USING ( bucket_id = 'avatars' );
