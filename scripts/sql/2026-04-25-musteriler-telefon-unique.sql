CREATE UNIQUE INDEX IF NOT EXISTS musteriler_telefon_uniq
  ON musteriler (telefon)
  WHERE telefon IS NOT NULL AND telefon <> '';
