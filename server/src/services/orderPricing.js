import { CURRENCY, SUPPORTED_TLDS } from '../config/pricing.js';

/**
 * Prices come only from server configuration. unitPriceMinor is the annual price;
 * the order total is the sum of unit price x term. All amounts are integer minor units (kobo).
 */
export function buildOrderLines(items) {
  const lines = items.map(({ fqdn, tld, termYears }) => ({
    fqdn,
    termYears,
    unitPriceMinor: SUPPORTED_TLDS[tld],
    currency: CURRENCY,
  }));
  const subtotalMinor = lines.reduce((sum, l) => sum + l.unitPriceMinor * l.termYears, 0);
  if (!Number.isSafeInteger(subtotalMinor)) throw new Error('Order total out of range');
  return { currency: CURRENCY, lines, subtotalMinor, totalMinor: subtotalMinor };
}
