import { z } from 'zod';

const databaseUrl = z.string().url().refine(value => {
  try { return ['postgres:', 'postgresql:'].includes(new URL(value).protocol); } catch { return false; }
});
const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: databaseUrl,
  DIRECT_URL: databaseUrl,
  CORS_ORIGIN: z.string().default('http://localhost:5173').refine(value => value.split(',').every(origin => z.string().url().safeParse(origin.trim()).success)),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SENTRY_DSN: z.preprocess(value => value === '' ? undefined : value, z.string().url().optional()),
});

export function validateEnvironment(values: Record<string, unknown>) {
  const result = schema.safeParse(values);
  if (!result.success) {
    // Never include values, URLs or Zod's raw input in boot logs.
    throw new Error(`Configuração de ambiente inválida: ${[...new Set(result.error.issues.map(issue => issue.path.join('.')))].join(', ')}`);
  }
  return { ...values, ...result.data };
}
