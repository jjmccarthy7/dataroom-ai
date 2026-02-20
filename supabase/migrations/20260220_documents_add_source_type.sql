-- Feat: add source_type + source_url columns to documents table
--
-- Adds support for link-type documents (Google Docs, Slides, Notion, etc.)
-- alongside existing file-upload documents.
--
-- Changes:
--   source_type TEXT NOT NULL DEFAULT 'file'  CHECK ('file' | 'link')
--   source_url  TEXT NULL   -- populated for link-type rows, NULL for file rows
--
-- Existing rows are untouched (they default to source_type = 'file').
-- file_path and file_size are left nullable so link rows can omit them.

-- 1. Add source_type with a default + check constraint
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'file'
  CHECK (source_type IN ('file', 'link'));

-- 2. Add source_url (nullable; only populated for link rows)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS source_url TEXT NULL;

-- 3. Make file_path nullable so link rows don't need a storage path
ALTER TABLE public.documents
  ALTER COLUMN file_path DROP NOT NULL;

-- 4. Make file_size nullable so link rows don't need a byte count
ALTER TABLE public.documents
  ALTER COLUMN file_size DROP NOT NULL;

-- 5. Add a constraint: link rows MUST have source_url; file rows MUST have file_path
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_source_consistency;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_source_consistency CHECK (
    (source_type = 'file' AND file_path IS NOT NULL)
    OR
    (source_type = 'link' AND source_url IS NOT NULL)
  );
