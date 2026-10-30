import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatDate } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const LOCKED = ['cancelled', 'failed'];

export default function DomainDetail() {
  const { id } = useParams();
  const { csrf } = useAuth();
  const [load, setLoad] = useState({ phase: 'loading' }); // loading | ready | missing | error
  const [label, setLabel] = useState('');
  const [autoRenew, setAutoRenew] = useState(false);
  const [save, setSave] = useState({ phase: 'idle' }); // idle | saving | saved | error

  useEffect(() => {
    const c = new AbortController();
    setLoad({ phase: 'loading' });
    api('GET', `/domains/${encodeURIComponent(id)}`, { signal: c.signal })
      .then(({ record }) => {
        setLoad({ phase: 'ready', record });
        setLabel(record.label ?? '');
        setAutoRenew(record.autoRenewDemo);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setLoad(e.status === 404 ? { phase: 'missing' } : { phase: 'error', message: e.message });
      });
    return () => c.abort();
  }, [id]);

  async function onSubmit(e) {
    e.preventDefault();
    if (save.phase === 'saving') return;
    setSave({ phase: 'saving' });
    try {
      const { record } = await api('PATCH', `/domains/${encodeURIComponent(id)}`, { body: { label, autoRenewDemo: autoRenew }, csrf });
      setLoad({ phase: 'ready', record });
      setLabel(record.label ?? '');
      setSave({ phase: 'saved' });
    } catch (err) {
      const fields = Object.fromEntries((err.details ?? []).map((d) => [d.field, d.issue]));
      setSave({ phase: 'error', message: err.message, fields });
    }
  }

  if (load.phase === 'loading') return <p className="page muted" role="status">Loading…</p>;
  if (load.phase === 'missing') {
    return (
      <section className="page">
        <h1 className="h-sm">Record not found</h1>
        <p>We couldn’t find that domain record. <Link to="/dashboard">Back to your dashboard</Link>.</p>
      </section>
    );
  }
  if (load.phase === 'error') {
    return (
      <section className="page">
        <div className="callout" role="alert"><p><strong>We couldn’t load this record.</strong> {load.message}</p></div>
        <p><Link to="/dashboard">Back to your dashboard</Link></p>
      </section>
    );
  }

  const { record } = load;
  const locked = LOCKED.includes(record.status);

  return (
    <section className="page" aria-labelledby="rec-h">
      <p><Link to="/dashboard">← Dashboard</Link></p>
      <h1 id="rec-h" className="h-sm name">{record.fqdn}</h1>
      <p className="demo" role="note">Demo record. This is not a live registration and DNS is not affected.</p>

      <dl className="detail">
        <div><dt>Status</dt><dd><StatusBadge status={record.status} /></dd></div>
        <div><dt>Mode</dt><dd>Demo (simulated)</dd></div>
        <div><dt>Created</dt><dd>{formatDate(record.createdAt)}</dd></div>
        <div><dt>Last updated</dt><dd>{formatDate(record.updatedAt)}</dd></div>
        {record.expiresAt && <div><dt>Demo expiry</dt><dd>{formatDate(record.expiresAt)}</dd></div>}
      </dl>

      <form className="card" onSubmit={onSubmit} noValidate>
        <h2 className="h-xs">Demo settings</h2>
        {locked && <p className="muted">This record can no longer be edited.</p>}

        {save.phase === 'error' && (
          <p className="field-error" role="alert"><span aria-hidden="true">! </span>{save.message}</p>
        )}
        {save.phase === 'saved' && <p className="ok" role="status"><span aria-hidden="true">✓ </span>Saved.</p>}

        <div className="field">
          <label htmlFor="label">Label</label>
          <input id="label" value={label} maxLength={60} disabled={locked}
            onChange={(e) => { setLabel(e.target.value); setSave({ phase: 'idle' }); }}
            aria-invalid={!!save.fields?.label} aria-describedby={save.fields?.label ? 'label-err' : undefined} />
          {save.fields?.label && <p id="label-err" className="field-error"><span aria-hidden="true">! </span>{save.fields.label}</p>}
        </div>

        <div className="field check">
          <input id="renew" type="checkbox" checked={autoRenew} disabled={locked}
            onChange={(e) => { setAutoRenew(e.target.checked); setSave({ phase: 'idle' }); }} />
          <label htmlFor="renew">Auto-renew (demo setting, has no real effect)</label>
        </div>

        <button type="submit" className="btn primary" disabled={locked || save.phase === 'saving'}>
          {save.phase === 'saving' ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </section>
  );
}
