// Serves the static site and forwards /api/* to the API host, so the browser only ever talks to one origin.
// That keeps the session cookie first-party (SameSite=Lax) and means no CORS is needed.

const json = (status, code, message) =>
  new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export function buildApiRequest(request, env) {
  const source = new URL(request.url);
  const target = new URL(source.pathname + source.search, env.API_ORIGIN);

  const headers = new Headers(request.headers);
  headers.delete('host');
  // Never trust a client-supplied forwarding header; replace it with the address Cloudflare saw.
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) headers.set('X-Forwarded-For', ip);
  else headers.delete('X-Forwarded-For');
  // Proves to the API that this request came through us.
  if (env.PROXY_SHARED_SECRET) headers.set('X-Proxy-Secret', env.PROXY_SHARED_SECRET);
  else headers.delete('X-Proxy-Secret');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return new Request(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: 'manual',
    duplex: 'half',
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (!env.API_ORIGIN) return json(503, 'MISCONFIGURED', 'The API address is not configured.');
    try {
      const upstream = await fetch(buildApiRequest(request, env));
      const response = new Response(upstream.body, upstream);
      response.headers.set('Cache-Control', 'no-store'); // auth and order responses must never be cached
      return response;
    } catch {
      return json(502, 'UPSTREAM_UNAVAILABLE', 'The service is not reachable right now. Please try again in a moment.');
    }
  },
};
