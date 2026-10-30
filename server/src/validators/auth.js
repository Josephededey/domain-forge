import { z } from 'zod';
import { AppError } from '../utils/AppError.js';

const email = z
  .string({ required_error: 'Enter your email address.', invalid_type_error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .max(254, 'That email address is too long.')
  .email('Enter a valid email address.');

const registerSchema = z.object({
  email,
  password: z
    .string({ required_error: 'Enter a password.', invalid_type_error: 'Enter a password.' })
    .min(12, 'Use at least 12 characters.')
    .max(128, 'Use at most 128 characters.'),
});

// Login does not restate password policy.
const loginSchema = z.object({
  email,
  password: z.string({ required_error: 'Enter your password.', invalid_type_error: 'Enter your password.' }).min(1, 'Enter your password.').max(128),
});

function parse(schema, body) {
  const r = schema.safeParse(body ?? {});
  if (r.success) return r.data;
  throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.',
    r.error.issues.map((i) => ({ field: String(i.path[0] ?? 'body'), issue: i.message })));
}

export const validateRegister = (body) => parse(registerSchema, body);
export const validateLogin = (body) => parse(loginSchema, body);
