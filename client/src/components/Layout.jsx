import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Layout() {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="bar">
        <Link className="brand" to="/">DomainForge</Link>
        <nav aria-label="Main" className="nav">
          <NavLink to="/" end>Search</NavLink>
          {status === 'authed' && <NavLink to="/dashboard">Dashboard</NavLink>}
          {status === 'anon' && (
            <>
              <NavLink to="/login">Sign in</NavLink>
              <NavLink to="/register" className="cta">Create account</NavLink>
            </>
          )}
          {status === 'authed' && (
            <>
              <span className="who" title={user.email}>{user.email}</span>
              <button type="button" className="btn ghost" onClick={async () => { await logout(); navigate('/'); }}>
                Sign out
              </button>
            </>
          )}
        </nav>
      </header>
      <main id="main"><Outlet /></main>
      <footer className="foot">
        Prices are illustrative demo values in NGN. DomainForge is a portfolio project, not a registrar.
      </footer>
    </>
  );
}
