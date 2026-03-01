import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Repair any rows in the users table where `availability` is stored as an
 * array/JSON value instead of the expected string.  The migration that created
 * the column defined it as VARCHAR, but some previous logic accidentally
 * wrote `[]`/`{}` (and the underlying Postgres driver can sometimes upgrade
 * the column to an array type).  Reading such a row triggers a Prisma
 * `P2032` conversion error.
 *
 * The SQL below casts the field to text so that `[]` or `{}` become normal
 * strings, then replaces those particular literals with the default value.
 * Calling this on every startup is cheap and makes the rest of the app
 * resilient.  You only need a production migration if you want to change the
 * column type permanently.
 */
export async function sanitizeAvailabilityColumn(): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE "users"
      SET availability = 'available'
      WHERE availability::text IN ('[]','{}');
    `;
  } catch (err) {
    console.error('[dbSanitizer] failed to sanitise availability column', err);
  }
}
