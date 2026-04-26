-- Fix type mismatch: GORM/pgx send bool for enable; 0028 created INTEGER (int4).
-- Idempotent: no-op if enable is already boolean or column missing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nodes'
      AND column_name = 'enable'
      AND udt_name = 'int4'
  ) THEN
    ALTER TABLE nodes ALTER COLUMN enable DROP DEFAULT;
    ALTER TABLE nodes ALTER COLUMN enable TYPE BOOLEAN USING (enable <> 0);
    ALTER TABLE nodes ALTER COLUMN enable SET DEFAULT true;
    ALTER TABLE nodes ALTER COLUMN enable SET NOT NULL;
  END IF;
END $$;
