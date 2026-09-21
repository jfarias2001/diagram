import { hash, verify } from '@node-rs/argon2';
import { createHmac, randomBytes, randomInt } from 'node:crypto';

// argon2id com os parâmetros padrão da @node-rs/argon2 (m=19 MiB, t=2, p=1).
export const hashPassword = (password: string) => hash(password);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;
/**
 * Verificação contra um hash fictício, para que login com e-mail inexistente
 * leve o mesmo tempo que senha errada (SPEC-001 §3.1).
 */
export async function verifyDummy(password: string): Promise<void> {
  dummyHash ??= hash(randomBytes(16).toString('hex'));
  await verifyPassword(await dummyHash, password);
}

/** Token de sessão: 32 bytes aleatórios em base64url. */
export const generateSessionToken = () => randomBytes(32).toString('base64url');

/** Só o HMAC do token vai para o banco — vazar a tabela não permite logar. */
export const hashSessionToken = (token: string, secret: string) =>
  createHmac('sha256', secret).update(token).digest('hex');

// Sem caracteres ambíguos (0/O, 1/l/I).
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generateTemporaryPassword(length = 16): string {
  let out = '';
  for (let i = 0; i < length; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return out;
}
