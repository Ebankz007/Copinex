import { and, desc, eq, isNull } from 'drizzle-orm';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';

export interface NewNotification {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
}

/** Insert a notification for a member. */
export async function createNotification(n: NewNotification) {
  const [row] = await db.insert(schema.notifications).values(n).returning();
  return row;
}

/** A member's notifications, newest first. */
export async function listNotifications(userId: string, limit = 50) {
  return db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, userId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
}

/** Unread count for the header badge. */
export async function unreadCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  return rows.length;
}

/** Mark one notification read (idempotent). Returns the updated row or null. */
export async function markNotificationRead(userId: string, notificationId: string) {
  const [row] = await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.id, notificationId),
        eq(schema.notifications.userId, userId),
        isNull(schema.notifications.readAt),
      ),
    )
    .returning();
  return row ?? null;
}

/** Mark every notification read. Returns the count updated. */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const rows = await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)))
    .returning({ id: schema.notifications.id });
  return rows.length;
}

/** Fan-out: notify every member (used when an announcement is published). */
export async function notifyAllMembers(type: string, title: string, body: string, link?: string) {
  const members = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, 'MEMBER'));
  for (const m of members) {
    await createNotification({ userId: m.id, type, title, body, link: link ?? null });
  }
  return members.length;
}