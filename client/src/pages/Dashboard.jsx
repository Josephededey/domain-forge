import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate, formatPrice } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [state, setState] = useState({ phase: 'loading' }); // loading | ready | error

  const load = useCallback((signal) => {
    setState({ phase: 'loading' });
    Promise.all([api('GET', '/domains', { signal }), api('GET', '/orders', { signal })])
      .then(([d, o]) => setState({ phase: 'ready', records: d.records, orders: o.orders }))
      .catch((e) => { if (e.name !== 'AbortError') setState({ phase: 'error', message: e.message }); });
  }, []);

  useEffect(() => {
    const c = new AbortController();
    load(c.signal);
    return () => c.abort();
  }, [load]);

  return (
    <section className="page" aria-labelledby="dash-h">
      <h1 id="dash-h" className="h-sm">Dashboard</h1>
      <p>Signed in as <strong>{user.email}</strong>.</p>
      <p className="demo" role="note">These are demo records. No domain has been registered and nothing has been charged.</p>

      <h2 className="h-xs">Your domains</h2>
      <div aria-live="polite">
        {state.phase === 'loading' && <p className="muted" role="status">Loading your domains…</p>}

        {state.phase === 'error' && (
          <div className="callout" role="alert">
            <p><strong>We couldn’t load your domains.</strong> {state.message}</p>
            <button type="button" className="btn primary" onClick={() => load()}>Try again</button>
          </div>
        )}

        {state.phase === 'ready' && state.records.length === 0 && (
          <div className="card">
            <h3 className="h-xs">No domains yet</h3>
            <p className="muted">Search for a name, then start a demo order to add it here.</p>
            <Link className="btn primary" to="/">Search for a domain</Link>
          </div>
        )}

        {state.phase === 'ready' && state.records.length > 0 && (
          <ul className="records">
            {state.records.map((r) => (
              <li key={r.id} className="record">
                <div>
                  <Link className="name" to={`/domains/${r.id}`}>{r.fqdn}</Link>
                  {r.label && <span className="muted"> · {r.label}</span>}
                </div>
                <StatusBadge status={r.status} />
                <dl className="meta">
                  <div><dt>Created</dt><dd>{formatDate(r.createdAt)}</dd></div>
                  {r.expiresAt && <div><dt>Demo expiry</dt><dd>{formatDate(r.expiresAt)}</dd></div>}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="h-xs section-gap">Your orders</h2>
      {state.phase === 'ready' && state.orders.length === 0 && <p className="muted">No orders yet.</p>}
      {state.phase === 'ready' && state.orders.length > 0 && (
        <ul className="records">
          {state.orders.map((o) => (
            <li key={o.id} className="record">
              <Link className="name" to={`/orders/${o.id}`}>{o.orderNumber}</Link>
              <StatusBadge status={o.status} />
              <dl className="meta">
                <div><dt>Placed</dt><dd>{formatDate(o.createdAt)}</dd></div>
                <div><dt>Total</dt><dd>{formatPrice({ amountMinor: o.totalMinor, currency: o.currency })}</dd></div>
                <div><dt>Items</dt><dd>{o.items.map((i) => i.fqdn).join(', ')}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
