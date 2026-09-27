import { desc, eq } from 'drizzle-orm';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import { notifyAllMembers } from './notifications.js';

export interface NewAnnouncement {
  title: string;
  body: string;
  status?: 'DRAFT' | 'PUBLISHED';
}

/** All announcements, newest first. */
export async function listAnnouncements() {
  return db
    .select()
    .from(schema.announcements)
    .orderBy(desc(schema.announcements.createdAt));
}

/** Create an announcement. Publishing immediately notifies every member. */
export async function createAnnouncement(adminId: string, input: NewAnnouncement) {
  const status = input.status ?? 'DRAFT';
  const [row] = await db
    .insert(schema.announcements)
    .values({
      title: input.title,
      body: input.body,
      status,
      createdBy: adminId,
      publishedAt: status === 'PUBLISHED' ? new Date() : null,
    })
    .returning();
  if (status === 'PUBLISHED') {
    await notifyAllMembers('ANNOUNCEMENT', row!.title, row!.body, '/dashboard');
  }
  return row!;
}

/** Update an announcement (title/body/status). Publishing notifies members. */
export async function updateAnnouncement(adminId: string, id: string, input: Partial<NewAnnouncement>) {
  const [existing] = await db
    .select()
    .from(schema.announcements)
    .where(eq(schema.announcements.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Announcement not found');

  const status = input.status ?? existing.status;
  const [row] = await db
    .update(schema.announcements)
    .set({
      title: input.title ?? existing.title,
      body: input.body ?? existing.body,
      status,
      publishedAt: status === 'PUBLISHED' && !existing.publishedAt ? new Date() : existing.publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.announcements.id, id))
    .returning();

  if (status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
    await notifyAllMembers('ANNOUNCEMENT', row!.title, row!.body, '/dashboard');
  }
  return row!;
}

/** Delete an announcement. */
export async function deleteAnnouncement(id: string) {
  const [row] = await db
    .delete(schema.announcements)
    .where(eq(schema.announcements.id, id))
    .returning();
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Announcement not found');
  return row;
}