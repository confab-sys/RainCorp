-- Ensure the `availability` column is a plain VARCHAR and clean up bad data.
-- This script can be run with `npx prisma migrate dev --name fix_availability_type`
-- or applied manually against the database.

BEGIN;

-- if the column was accidentally converted to an array type, cast back to text
ALTER TABLE "users"
  ALTER COLUMN availability TYPE VARCHAR USING availability::text;

-- update any rows that still contain the empty-array/object literal
UPDATE "users"
SET availability = 'available'
WHERE availability::text IN ('[]','{}');

COMMIT;
