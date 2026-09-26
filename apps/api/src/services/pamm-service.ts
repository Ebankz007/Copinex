/**
 * Copinex PAMM Service — broker directory + connection requests.
 *
 * The PAMM (Percentage Allocation Management Module) model replaces the
 * copy-trading engine: the client selects a partner broker, submits a
 * connection request, and the system redirects them to the broker's private
 * PAMM link. The investment itself happens broker-side — Copinex never
 * touches the client's PAMM funds.
 *
 * Broker directory is admin-managed (add / remove). Removal is a soft
 * deactivate (`is_active = false`) so historical connections keep their
 * broker reference and the list shown to clients simply drops the broker.
 *
 * Connection status stays REQUESTED after the redirect; LINKED is reserved
 * for when broker-side confirmation exists (future work).
 */
import { desc, eq } from 'drizzle-orm';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';

// ── Broker directory ───────────────────────────────────

export async function listActiveBrokers() {
  return db
    .select({
      id: schema.brokers.id,
      name: schema.brokers.name,
      code: schema.brokers.code,
      isActive: schema.brokers.isActive,
      createdAt: schema.brokers.createdAt,
    })
    .from(schema.brokers)
    .where(eq(schema.brokers.isActive, true))
    .orderBy(schema.brokers.name);
}

/** All brokers, including deactivated — admin view. */
export async function listAllBrokers() {
  return db
    .select({
      id: schema.brokers.id,
      name: schema.brokers.name,
      code: schema.brokers.code,
      pammLink: schema.brokers.pammLink,
      isActive: schema.brokers.isActive,
      createdAt: schema.brokers.createdAt,
    })
    .from(schema.brokers)
    .orderBy(schema.brokers.name);
}

export async function createBroker(input: { name: string; code: string; pammLink: string }) {
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  const pammLink = input.pammLink.trim();

  if (!name || !code || !pammLink) {
    throw new HttpError(400, 'INVALID_BROKER', 'name, code and pammLink are required');
  }
  if (!/^https?:\/\//.test(pammLink)) {
    throw new HttpError(400, 'INVALID_PAMM_LINK', 'pammLink must be a valid http(s) URL');
  }

  const existing = await db
    .select({ id: schema.brokers.id })
    .from(schema.brokers)
    .where(eq(schema.brokers.code, code))
    .limit(1);
  if (existing.length > 0) {
    throw new HttpError(409, 'BROKER_EXISTS', `A broker with code ${code} already exists`);
  }

  const [row] = await db.insert(schema.brokers).values({ name, code, pammLink }).returning();
  if (!row) throw new HttpError(500, 'INTERNAL_ERROR', 'Failed to create broker');
  return row;
}

/** Soft-remove a broker from the client-facing list. */
export async function deactivateBroker(brokerId: string) {
  const [row] = await db
    .update(schema.brokers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(schema.brokers.id, brokerId))
    .returning();
  if (!row) throw new HttpError(404, 'BROKER_NOT_FOUND', 'Broker not found');
  return row;
}

// ── PAMM connection requests ───────────────────────────

export async function requestPammConnection(userId: string, brokerId: string) {
  const [broker] = await db
    .select({ id: schema.brokers.id, pammLink: schema.brokers.pammLink, isActive: schema.brokers.isActive })
    .from(schema.brokers)
    .where(eq(schema.brokers.id, brokerId))
    .limit(1);
  if (!broker) throw new HttpError(404, 'BROKER_NOT_FOUND', 'Broker not found');
  if (!broker.isActive) throw new HttpError(400, 'BROKER_INACTIVE', 'This broker is no longer accepting connections');

  const [connection] = await db
    .insert(schema.pammConnections)
    .values({ userId, brokerId })
    .returning();
  if (!connection) throw new HttpError(500, 'INTERNAL_ERROR', 'Failed to create connection request');

  return { connection, redirectUrl: broker.pammLink };
}

export async function listMyPammConnections(userId: string) {
  return db
    .select({
      id: schema.pammConnections.id,
      status: schema.pammConnections.status,
      createdAt: schema.pammConnections.createdAt,
      broker: {
        id: schema.brokers.id,
        name: schema.brokers.name,
        code: schema.brokers.code,
      },
    })
    .from(schema.pammConnections)
    .innerJoin(schema.brokers, eq(schema.pammConnections.brokerId, schema.brokers.id))
    .where(eq(schema.pammConnections.userId, userId))
    .orderBy(desc(schema.pammConnections.createdAt));
}

export async function listAllPammConnections() {
  return db
    .select({
      id: schema.pammConnections.id,
      status: schema.pammConnections.status,
      createdAt: schema.pammConnections.createdAt,
      userId: schema.pammConnections.userId,
      broker: {
        id: schema.brokers.id,
        name: schema.brokers.name,
        code: schema.brokers.code,
      },
    })
    .from(schema.pammConnections)
    .innerJoin(schema.brokers, eq(schema.pammConnections.brokerId, schema.brokers.id))
    .orderBy(desc(schema.pammConnections.createdAt));
}