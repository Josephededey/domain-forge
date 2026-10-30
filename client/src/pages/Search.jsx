import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, searchDomains, formatPrice } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

const STATUS = {
  unknown: { glyph: '?', label: 'Not verified' },
  available: { glyph: '✓', label: 'Available' },
  unavailable: { glyph: '✕', label: 'Unavailable' },
  error: { glyph: '!', label: 'Could not check' },
};

export default function Search() {
  const [q, setQ] = useState('');
  const [state, setState] = useState({ phase: 'idle' }); // idle | loading | success | invalid | error
  const controller = useRef(null);
  const { status: authStatus, csrf } = useAuth();
  const navigate = useNavigate();
  const orderKeys = useRef(new Map()); // one stable Idempotency-Key per domain, so repeat clicks cannot double-order
  const [ordering, setOrdering] = useState(null); // { domain } while a request is in flight
  const [orderError, setOrderError] = useState(null); // { domain, message }

  async function startOrder(domain) {
    if (ordering) return;
    if (!orderKeys.current.has(domain)) orderKeys.current.set(domain, crypto.randomUUID());
    setOrdering({ domain });
    setOrderError(null);
    try {
      const { order } = await api('POST', '/orders', {
        body: { items: [{ domain, termYears: 1 }] },
        csrf,
        headers: { 'Idempotency-Key': orderKeys.current.get(domain) },
      });
      orderKeys.current.delete(domain);
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setOrderError({ domain, message: err.message });
      setOrdering(null);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const value = q.trim();
    if (!value) {
      setState({ phase: 'invalid', message: 'Enter a domain name to search.' });
      return;
    }
    controller.current?.abort(); // de-duplicate in-flight searches (FR-024)
    controller.current = new AbortController();
    setState({ phase: 'loading' });
    try {
      const data = await searchDomains(value, controller.current.signal);
      setState({ phase: 'success', data });
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (err.status === 400) {
        setState({ phase: 'invalid', message: err.details[0]?.issue ?? err.message });
      } else {
        setState({ phase: 'error', message: err.message, requestId: err.requestId });
      }
    }
  }

  const loading = state.phase === 'loading';

  return (
    <>
        <section className="hero">
          <h1>Find a name. See what it would cost.</h1>
          <p className="lede">
            Check a name across common extensions and compare indicative prices before you decide.
          </p>

          <p className="demo" role="note">
            <strong>Portfolio demo.</strong> Results are simulated. Nothing here confirms that a domain is
            available, and no domain is registered or charged.
          </p>

          <form className="forge" onSubmit={onSubmit} noValidate>
            <label htmlFor="q">Domain name</label>
            <div className="row">
              <input
                id="q"
                name="q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="example or example.com"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck="false"
                aria-invalid={state.phase === 'invalid'}
                aria-describedby={state.phase === 'invalid' ? 'q-error' : undefined}
              />
              <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
            </div>
            {state.phase === 'invalid' && (
              <p id="q-error" className="field-error"><span aria-hidden="true">! </span>{state.message}</p>
            )}
          </form>
        </section>

        <section aria-labelledby="results-h" className="results" aria-busy={loading}>
          <h2 id="results-h" className="sr-only">Search results</h2>
          <div aria-live="polite">
            {state.phase === 'idle' && <p className="muted">Results appear here.</p>}
            {loading && <p className="muted">Searching…</p>}
            {state.phase === 'error' && (
              <div className="callout" role="alert">
                <p><strong>The search could not be completed.</strong> {state.message}</p>
                {state.requestId && <p className="muted">Reference: {state.requestId}</p>}
                <button type="button" onClick={onSubmit}>Try again</button>
              </div>
            )}
            {state.phase === 'success' && state.data.results.length === 0 && (
              <p>No extensions to show. Try another name.</p>
            )}
            {state.phase === 'success' && state.data.results.length > 0 && (
              <>
                <p className="muted">
                  {state.data.results.length} results for “{state.data.query}” · source: <strong>{state.data.source}</strong>
                </p>
                <ul className="ledger">
                  {state.data.results.map((r) => {
                    const s = STATUS[r.availability] ?? STATUS.unknown;
                    return (
                      <li key={r.domain} className={`entry ${r.availability}`}>
                        <span className="name">{r.domain}</span>
                        <span className="status"><span aria-hidden="true" className="glyph">{s.glyph}</span>{s.label}<span className="tag">Simulated</span></span>
                        <span className="price">{r.price ? `${formatPrice(r.price)} / year` : '—'}</span>
                        <span className="note">{r.message}</span>
                        {r.price && r.availability !== 'error' && (
                          <span className="action">
                            {authStatus === 'authed' ? (
                              <button type="button" className="btn ghost" disabled={!!ordering}
                                aria-label={`Start demo order for ${r.domain}`} onClick={() => startOrder(r.domain)}>
                                {ordering?.domain === r.domain ? 'Starting…' : 'Start demo order'}
                              </button>
                            ) : (
                              <Link className="btn ghost" to="/login" state={{ from: '/' }}>Sign in to start a demo order</Link>
                            )}
                            {orderError?.domain === r.domain && (
                              <span className="field-error" role="alert"><span aria-hidden="true">! </span>{orderError.message}</span>
                            )}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </section>
    </>
  );
}
