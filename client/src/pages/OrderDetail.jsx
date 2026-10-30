import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatDate, formatPrice } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

export default function OrderDetail() {
  const { id } = useParams();
  const { csrf } = useAuth();
  const [load, setLoad] = useState({ phase: 'loading' }); // loading | ready | missing | error
  const [action, setAction] = useState({ phase: 'idle' }); // idle | working | error

  useEffect(() => {
    const c = new AbortController();
    setLoad({ phase: 'loading' });
    api('GET', `/orders/${encodeURIComponent(id)}`, { signal: c.signal })
      .then(({ order }) => setLoad({ phase: 'ready', order }))
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setLoad(e.status === 404 ? { phase: 'missing' } : { phase: 'error', message: e.message });
      });
    return () => c.abort();
  }, [id]);

  async function run(kind) {
    if (action.phase === 'working') return;
    setAction({ phase: 'working', kind });
    try {
      const { order } = await api('POST', `/orders/${encodeURIComponent(id)}/${kind}`, { csrf });
      setLoad({ phase: 'ready', order });
      setAction({ phase: 'idle' });
    } catch (err) {
      setAction({ phase: 'error', message: err.message });
    }
  }

  if (load.phase === 'loading') return <p className="page muted" role="status">Loading…</p>;
  if (load.phase === 'missing') {
    return (
      <section className="page">
        <h1 className="h-sm">Order not found</h1>
        <p>We couldn’t find that order. <Link to="/dashboard">Back to your dashboard</Link>.</p>
      </section>
    );
  }
  if (load.phase === 'error') {
    return (
      <section className="page">
        <div className="callout" role="alert"><p><strong>We couldn’t load this order.</strong> {load.message}</p></div>
        <p><Link to="/dashboard">Back to your dashboard</Link></p>
      </section>
    );
  }

  const { order } = load;
  const working = action.phase === 'working';

  return (
    <section className="page" aria-labelledby="ord-h">
      <p><Link to="/dashboard">← Dashboard</Link></p>
      <h1 id="ord-h" className="h-sm">Order {order.orderNumber}</h1>
      <p className="demo" role="note">
        <strong>Demo checkout.</strong> No payment is taken and no domain is registered. Confirming only creates demo records in your account.
      </p>

      <dl className="detail">
        <div><dt>Status</dt><dd><StatusBadge status={order.status} /></dd></div>
        <div><dt>Placed</dt><dd>{formatDate(order.createdAt)}</dd></div>
        <div><dt>Currency</dt><dd>{order.currency}</dd></div>
      </dl>

      <h2 className="h-xs">Items</h2>
      <ul className="records">
        {order.items.map((i) => (
          <li key={i.id} className="record">
            <span className="name">{i.fqdn}</span>
            <span className="price">{formatPrice({ amountMinor: i.unitPriceMinor * i.termYears, currency: i.currency })}</span>
            <span className="meta">
              {i.termYears} {i.termYears === 1 ? 'year' : 'years'} × {formatPrice({ amountMinor: i.unitPriceMinor, currency: i.currency })} per year
            </span>
          </li>
        ))}
      </ul>
      <p className="total">
        <span>Total (illustrative)</span>
        <strong>{formatPrice({ amountMinor: order.totalMinor, currency: order.currency })}</strong>
      </p>

      {action.phase === 'error' && <p className="field-error" role="alert"><span aria-hidden="true">! </span>{action.message}</p>}

      {order.status === 'pending_demo' && (
        <div className="actions">
          <button type="button" className="btn primary" disabled={working} onClick={() => run('confirm-demo')}>
            {working && action.kind === 'confirm-demo' ? 'Confirming…' : 'Confirm demo order'}
          </button>
          <button type="button" className="btn ghost" disabled={working} onClick={() => run('cancel')}>
            {working && action.kind === 'cancel' ? 'Cancelling…' : 'Cancel order'}
          </button>
        </div>
      )}
      {order.status === 'completed_demo' && (
        <p className="ok" role="status"><span aria-hidden="true">✓ </span>Demo order completed. Your demo records are on the <Link to="/dashboard">dashboard</Link>.</p>
      )}
      {order.status === 'cancelled' && <p role="status">This order was cancelled. Nothing was created.</p>}
    </section>
  );
}
