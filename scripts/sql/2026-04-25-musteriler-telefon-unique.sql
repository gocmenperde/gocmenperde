ALTER TABLE IF EXISTS musteriler
  ADD COLUMN IF NOT EXISTS telefon TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS musteriler_telefon_unique_idx
  ON musteriler (telefon)
  WHERE COALESCE(TRIM(telefon), '') <> '';
