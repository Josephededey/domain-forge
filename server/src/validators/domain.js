import { SUPPORTED_TLDS } from '../config/pricing.js';

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const supportedList = () => Object.keys(SUPPORTED_TLDS).map((t) => `.${t}`).join(', ');

/**
 * Pure syntax validation + normalisation. Says nothing about availability (FR-015).
 * MVP limitation: internationalised (non-ASCII / xn--) names are rejected explicitly (FR-014).
 * @returns {{ok:true,label:string,tld:string|null}|{ok:false,issue:string}}
 */
export function parseDomainInput(raw) {
  if (typeof raw !== 'string') return { ok: false, issue: 'Enter a domain name to search.' };
  const input = raw.trim().toLowerCase().replace(/\.$/, '');
  if (!input) return { ok: false, issue: 'Enter a domain name to search.' };
  if (input.length > 253) return { ok: false, issue: 'That name is too long.' };
  if (/[^\x00-\x7f]/.test(input) || input.includes('xn--')) {
    return { ok: false, issue: 'Internationalised names are not supported yet. Use letters a–z, digits and hyphens.' };
  }
  if (!/^[a-z0-9.-]+$/.test(input)) {
    return { ok: false, issue: 'Use only letters, digits, hyphens and dots. Remove spaces, slashes and symbols.' };
  }

  const parts = input.split('.');
  let tld = null;
  let labelParts = parts;
  if (parts.length > 1) {
    const two = parts.slice(-2).join('.');
    const one = parts[parts.length - 1];
    if (parts.length > 2 && SUPPORTED_TLDS[two]) { tld = two; labelParts = parts.slice(0, -2); }
    else if (SUPPORTED_TLDS[one]) { tld = one; labelParts = parts.slice(0, -1); }
    else return { ok: false, issue: `That extension is not supported. Supported: ${supportedList()}.` };
  }
  if (labelParts.length !== 1) {
    return { ok: false, issue: 'Enter the name without subdomains, for example “example” or “example.com”.' };
  }
  const label = labelParts[0];
  if (!LABEL.test(label)) {
    return { ok: false, issue: 'Names must be 1–63 characters and cannot start or end with a hyphen.' };
  }
  if (label.slice(2, 4) === '--') {
    return { ok: false, issue: 'Hyphens in the third and fourth position are reserved.' };
  }
  return { ok: true, label, tld };
}

export function parseTldList(raw) {
  if (raw === undefined || raw === '') return { ok: true, tlds: null };
  const tlds = [...new Set(String(raw).toLowerCase().split(',').map((t) => t.trim().replace(/^\./, '')).filter(Boolean))];
  const bad = tlds.filter((t) => !SUPPORTED_TLDS[t]);
  if (bad.length) return { ok: false, issue: `Unsupported extension: ${bad.map((b) => `.${b}`).join(', ')}.` };
  return { ok: true, tlds };
}
