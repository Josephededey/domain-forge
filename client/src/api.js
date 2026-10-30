export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? 'Something went wrong. Please try again.');
    this.status = status;
    this.code = body?.error?.code ?? 'UNKNOWN';
    this.details = body?.error?.details ?? [];
    this.requestId = body?.error?.requestId;
  }
}

const NETWORK = { error: { code: 'NETWORK', message: 'Could not reach the server. Check your connection and try again.' } };

/** Calls /api/v1. Sends the session cookie and, for writes, the CSRF token. Returns `data` (or null for 204). */
export async function api(method, path, { body, csrf, signal, headers: extra } = {}) {
  const headers = { ...extra };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf) headers['X-CSRF-Token'] = csrf;
  let res;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, NETWORK);
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json);
  return json.data;
}

export const searchDomains = (q, signal) => api('GET', `/domains/search?q=${encodeURIComponent(q)}`, { signal });

export function formatPrice({ amountMinor, currency }) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
}

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const formatDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '—');
