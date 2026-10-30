import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    // One or more allowed browser origins, comma-separated.
    CLIENT_URL: z
      .string()
      .default('http://localhost:5173')
      .refine((v) => v.split(',').every((u) => URL.canParse(u.trim())), 'must be URL(s)'),
    PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(50).max(30000).default(5000),
    SEARCH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    DATABASE_URL: z.string().optional(),
    SESSION_SECRET: z.string().min(32).optional(),
    // Number of reverse proxies in front of the API (Render's router = 1; Cloudflare Worker + Render = 2).
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
    // When set, every request except /api/health must carry a matching X-Proxy-Secret header.
    PROXY_SHARED_SECRET: z.string().min(16).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.DATABASE_URL && !v.SESSION_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'required when DATABASE_URL is set' });
    }
    // Trusting a forwarded client IP is only safe if nothing can reach the API except through the trusted proxy.
    if (v.NODE_ENV === 'production' && v.TRUST_PROXY_HOPS > 1 && !v.PROXY_SHARED_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['PROXY_SHARED_SECRET'], message: 'required when TRUST_PROXY_HOPS > 1 in production' });
    }
  });

/** Validates configuration at startup. Fails with names of bad variables only, never their values. */
export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))];
    throw new Error(`Invalid environment configuration. Check: ${names.join(', ')} (see .env.example).`);
  }
  const CLIENT_ORIGINS = parsed.data.CLIENT_URL.split(',').map((u) => new URL(u.trim()).origin);
  return { ...parsed.data, CLIENT_ORIGINS };
}

/** Migrations and seeding only need the database URL, not the full app config. */
export function loadDatabaseConfig(env = process.env) {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to server/.env and fill it in.');
  }
  return { DATABASE_URL: env.DATABASE_URL, NODE_ENV: env.NODE_ENV ?? 'development' };
}
