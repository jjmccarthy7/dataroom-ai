-- Fix: profiles_role_check constraint rejects values sent by the UI
--
-- Root cause:
--   The profiles table has a CHECK constraint defined as:
--     role IN ('founder', 'investor', 'both')   -- or similar lowercase set
--   But profile.html sends title-cased values: 'Entrepreneur', 'Investor', 'Both'
--   and dashboard.html compares against those same title-cased values for
--   role-based greeting logic.
--
--   The constraint was defined with a different value set than the UI uses.
--   The UI values are correct and consistent across all HTML files, so we
--   update the constraint to match the UI — not the other way around.
--
-- Fix:
--   Drop the existing profiles_role_check constraint and recreate it
--   accepting the three values the UI actually sends:
--     'Entrepreneur', 'Investor', 'Both'
--
--   Existing rows with non-conforming values (e.g. 'founder') are updated
--   to the canonical title-cased equivalents before the constraint is added.

-- ── 1. NORMALISE ANY EXISTING ROWS ───────────────────────────────────────────
-- Map old lowercase/alternate values to the canonical UI values so the new
-- constraint doesn't reject rows that were saved under the old scheme.

UPDATE public.profiles
SET role = CASE
  WHEN lower(role) = 'founder'       THEN 'Entrepreneur'
  WHEN lower(role) = 'entrepreneur'  THEN 'Entrepreneur'
  WHEN lower(role) = 'investor'      THEN 'Investor'
  WHEN lower(role) = 'both'          THEN 'Both'
  ELSE role
END
WHERE role IS NOT NULL;

-- ── 2. DROP THE OLD CONSTRAINT ───────────────────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- ── 3. ADD THE CORRECT CONSTRAINT ────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('Entrepreneur', 'Investor', 'Both'));
