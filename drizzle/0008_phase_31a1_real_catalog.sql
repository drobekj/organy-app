ALTER TABLE catalog_songs ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE catalog_songs ADD CONSTRAINT catalog_songs_number_digits_only CHECK (number ~ '^[0-9]+$');
