import { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import { parseDomainInput, parseTldList } from './domain.js';

const querySchema = z.object({
  q: z.string({ required_error: 'Enter a domain name to search.', invalid_type_error: 'Send a single value for q.' }),
  tlds: z.string({ invalid_type_error: 'Send tlds as a comma-separated list.' }).optional(),
});

const fail = (details) => new AppError(400, 'VALIDATION_ERROR', 'Please check the domain name and try again.', details);

export function validateSearchQuery(query) {
  const shape = querySchema.safeParse(query);
  if (!shape.success) {
    throw fail(shape.error.issues.map((i) => ({ field: i.path[0] ?? 'q', issue: i.message })));
  }
  const domain = parseDomainInput(shape.data.q);
  if (!domain.ok) throw fail([{ field: 'q', issue: domain.issue }]);
  const list = parseTldList(shape.data.tlds);
  if (!list.ok) throw fail([{ field: 'tlds', issue: list.issue }]);
  return { label: domain.label, tlds: domain.tld ? [domain.tld] : list.tlds };
}
