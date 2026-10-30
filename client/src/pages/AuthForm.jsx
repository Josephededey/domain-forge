import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function AuthForm({ mode }) {
  const isRegister = mode === 'register';
  const { status, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = typeof location.state?.from === 'string' && location.state.from.startsWith('/') ? location.state.from : '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null); // { message, fields: {email?, password?} }

  if (status === 'authed') return <Navigate to={from} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await (isRegister ? register : login)(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      const fields = Object.fromEntries((err.details ?? []).map((d) => [d.field, d.issue]));
      setError({ message: Object.keys(fields).length ? 'Please fix the highlighted fields.' : err.message, fields });
      setPending(false);
    }
  }

  return (
    <section className="page card" aria-labelledby="auth-h">
      <h1 id="auth-h" className="h-sm">{isRegister ? 'Create your account' : 'Sign in'}</h1>
      <form onSubmit={onSubmit} noValidate>
        {error && <p className="field-error" role="alert"><span aria-hidden="true">! </span>{error.message}</p>}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error?.fields.email} aria-describedby={error?.fields.email ? 'email-err' : undefined} />
          {error?.fields.email && <p id="email-err" className="field-error"><span aria-hidden="true">! </span>{error.fields.email}</p>}
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error?.fields.password} aria-describedby={`pw-hint${error?.fields.password ? ' pw-err' : ''}`} />
          {isRegister && <p id="pw-hint" className="muted">At least 12 characters. A few random words works well.</p>}
          {!isRegister && <span id="pw-hint" />}
          {error?.fields.password && <p id="pw-err" className="field-error"><span aria-hidden="true">! </span>{error.fields.password}</p>}
        </div>

        <button type="submit" className="btn primary" disabled={pending}>
          {pending ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
        </button>
      </form>

      {isRegister && (
        <p className="muted">We store only your email and a password hash. This is a demo: please use a fictional email address and a password you don’t use anywhere else.</p>
      )}
      <p>
        {isRegister ? <>Already have an account? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/register">Create an account</Link></>}
      </p>
    </section>
  );
}
