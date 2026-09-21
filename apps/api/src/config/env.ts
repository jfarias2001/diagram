import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
  /** Origem pública da aplicação, ex.: https://diagram.paglamp.com.br */
  APP_URL: z.string().url(),
  /** Pepper do hash dos tokens de sessão. Mínimo 32 caracteres. */
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET precisa de pelo menos 32 caracteres'),
  /** Restrição opcional de domínio ao criar usuário. Vazio = qualquer e-mail (ADR-003). */
  ALLOWED_EMAIL_DOMAINS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
    ),
  SEED_ADMIN_EMAIL: optionalString,
  SEED_ADMIN_NAME: optionalString,
  SEED_ADMIN_PASSWORD: optionalString,
  TRASH_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  /** Limite global de requisições por IP por minuto. */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  /** Tentativas de login por IP por minuto (SPEC-001 §3.1). */
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  return parsed.data;
}

/** HTTPS em APP_URL → cookie `__Host-` com Secure (SPEC-001 §3.1). */
export function isSecureApp(env: Env): boolean {
  return new URL(env.APP_URL).protocol === 'https:';
}
