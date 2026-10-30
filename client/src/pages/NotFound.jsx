import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="page">
      <h1 className="h-sm">Page not found</h1>
      <p>That page doesn’t exist. <Link to="/">Go back to search</Link>.</p>
    </section>
  );
}
