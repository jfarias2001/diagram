import type { PrismaClient, Session, User } from '@prisma/client';
import { type Env, isSecureApp } from '../../config/env.js';
import { generateSessionToken, hashSessionToken } from '../../lib/crypto.js';

// SPEC-001 §3.1 — sessão opaca no banco.

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 7 * DAY;
export const SESSION_RENEW_BELOW_MS = 3.5 * DAY;
export const SESSION_ABSOLUTE_MAX_MS = 30 * DAY;
export const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export const sessionCookieName = (env: Env) => (isSecureApp(env) ? '__Host-sid' : 'sid');

export function sessionCookieOptions(env: Env, expires: Date) {
  return {
    path: '/',
    httpOnly: true,
    secure: isSecureApp(env),
    sameSite: 'lax' as const,
    expires,
  };
}

export async function createSession(
  prisma: PrismaClient,
  env: Env,
  userId: string,
  meta: { ip?: string; userAgent?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(token, env.SESSION_SECRET),
      userId,
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 256) ?? null,
    },
  });
  return { token, expiresAt };
}

/** O que atualizar numa sessão válida (pura, testável). */
export function sessionRefresh(
  session: Pick<Session, 'createdAt' | 'expiresAt' | 'lastSeenAt'>,
  now: number,
): { expiresAt?: Date; lastSeenAt?: Date } | null {
  const update: { expiresAt?: Date; lastSeenAt?: Date } = {};
  const absoluteEnd = session.createdAt.getTime() + SESSION_ABSOLUTE_MAX_MS;
  if (session.expiresAt.getTime() - now < SESSION_RENEW_BELOW_MS) {
    const renewed = Math.min(now + SESSION_TTL_MS, absoluteEnd);
    if (renewed > session.expiresAt.getTime()) update.expiresAt = new Date(renewed);
  }
  if (now - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) update.lastSeenAt = new Date(now);
  return Object.keys(update).length ? update : null;
}

export interface ResolvedSession {
  session: Session;
  user: User;
}

/** Sessão válida + usuário ativo, ou null. Renova a sessão quando cabe. */
export async function resolveSession(
  prisma: PrismaClient,
  env: Env,
  token: string | undefined,
): Promise<ResolvedSession | null> {
  if (!token || token.length > 100) return null;
  const found = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token, env.SESSION_SECRET) },
    include: { user: true },
  });
  if (!found) return null;

  const now = Date.now();
  const { user, ...session } = found;
  if (session.expiresAt.getTime() <= now || !user.active) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  const refresh = sessionRefresh(session, now);
  if (refresh) {
    const updated = await prisma.session.update({ where: { id: session.id }, data: refresh });
    return { session: updated, user };
  }
  return { session, user };
}
