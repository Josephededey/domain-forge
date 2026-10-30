import { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import { parseDomainInput } from './domain.js';

const itemSchema = z.object({
  domain: z.string({ required_error: 'Enter a domain.', invalid_type_error: 'Enter a domain.' }),
  termYears: z
    .number({ invalid_type_error: 'Choose 1 to 10 years.' })
    .int('Choose a whole number of years.')
    .min(1, 'Choose 1 to 10 years.')
    .max(10, 'Choose 1 to 10 years.')
    .default(1),
});

// Unknown keys (price, total, currency, status, userId, ...) are dropped, never read.
const bodySchema = z.object({
  items: z
    .array(itemSchema, { required_error: 'Add at least one domain.', invalid_type_error: 'Add at least one domain.' })
    .min(1, 'Add at least one domain.')
    .max(10, 'An order can have at most 10 domains.'),
});

const KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const bad = (details) => new AppError(400, 'VALIDATION_ERROR', 'Please check the order and try again.', details);

export function validateCreateOrder(body, idempotencyKey) {
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw bad(parsed.error.issues.map((i) => ({ field: i.path.join('.') || 'items', issue: i.message })));
  }

  const details = [];
  const seen = new Set();
  const items = parsed.data.items.map((item, i) => {
    const d = parseDomainInput(item.domain);
    const field = `items.${i}.domain`;
    if (!d.ok) { details.push({ field, issue: d.issue }); return null; }
    if (!d.tld) { details.push({ field, issue: 'Include a supported extension, for example example.com.' }); return null; }
    const fqdn = `${d.label}.${d.tld}`;
    if (seen.has(fqdn)) details.push({ field, issue: 'Each domain can only appear once.' });
    seen.add(fqdn);
    return { fqdn, tld: d.tld, termYears: item.termYears };
  });

  if (idempotencyKey !== undefined && !KEY.test(idempotencyKey)) {
    details.push({ field: 'Idempotency-Key', issue: 'Use 8 to 128 letters, digits, dots, dashes, underscores or colons.' });
  }
  if (details.length) throw bad(details);
  return { items, idempotencyKey };
}

export function parseOrderId(raw) {
  if (!z.string().uuid().safeParse(raw).success) {
    throw new AppError(404, 'NOT_FOUND', 'That order does not exist.');
  }
  return raw;
}
