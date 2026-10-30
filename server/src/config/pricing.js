// ILLUSTRATIVE demo prices. Money is integer minor units (100 kobo = ₦1).
export const CURRENCY = 'NGN';
export const SUPPORTED_TLDS = Object.freeze({
  com: 1_500_000,
  net: 1_800_000,
  org: 1_700_000,
  io: 4_500_000,
  ng: 800_000,
  'com.ng': 600_000,
});
export const DEFAULT_TLDS = Object.freeze(['com', 'net', 'org', 'io', 'ng']);

export const priceFor = (tld) => ({ amountMinor: SUPPORTED_TLDS[tld], currency: CURRENCY });
