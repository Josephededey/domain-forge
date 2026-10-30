import { z } from 'zod';
import { AppError } from '../utils/AppError.js';

const idSchema = z.string().uuid();

// Only these fields are editable. Anything else (owner, fqdn, status, ...) is rejected, not ignored.
const patchSchema = z
  .object({
    label: z.string().trim().max(60, 'Use at most 60 characters.').transform((v) => (v === '' ? null : v)).nullable().optional(),
    autoRenewDemo: z.boolean({ invalid_type_error: 'Must be true or false.' }).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Send at least one field to update.' });

const notFound = () => new AppError(404, 'NOT_FOUND', 'That domain record does not exist.');

/** A malformed id is treated exactly like a missing one. */
export function parseRecordId(raw) {
  const r = idSchema.safeParse(raw);
  if (!r.success) throw notFound();
  return r.data;
}

export function validateRecordPatch(body) {
  const r = patchSchema.safeParse(body ?? {});
  if (r.success) return r.data;
  const details = r.error.issues.flatMap((i) =>
    i.code === 'unrecognized_keys'
      ? i.keys.map((k) => ({ field: k, issue: 'This field cannot be changed.' }))
      : [{ field: String(i.path[0] ?? 'body'), issue: i.message }],
  );
  throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', details);
}
