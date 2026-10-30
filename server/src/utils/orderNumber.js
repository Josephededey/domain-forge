import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // no 0/O/1/I/L

/** e.g. DF-20261029-7K3QX9 */
export function generateOrderNumber(now = new Date()) {
  const day = now.toISOString().slice(0, 10).replaceAll('-', '');
  const rand = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `DF-${day}-${rand}`;
}
