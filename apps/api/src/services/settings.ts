import { eq } from 'drizzle-orm';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';

export interface SettingValue {
  key: string;
  value: unknown;
  description?: string | null;
}

/** All settings. */
export async function listSettings() {
  return db.select().from(schema.config).orderBy(schema.config.key);
}

/** Read one setting (returns the JSON value or null). */
export async function getSetting(key: string): Promise<unknown | null> {
  const [row] = await db
    .select({ value: schema.config.value })
    .from(schema.config)
    .where(eq(schema.config.key, key))
    .limit(1);
  return row ? row.value : null;
}

/** Upsert one setting. */
export async function upsertSetting(input: SettingValue) {
  const [row] = await db
    .insert(schema.config)
    .values({ ...input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.config.key,
      set: {
        value: input.value,
        description: input.description ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/** Delete a setting (admin only). */
export async function deleteSetting(key: string) {
  const [row] = await db.delete(schema.config).where(eq(schema.config.key, key)).returning();
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Setting not found');
  return row;
}