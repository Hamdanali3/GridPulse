import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-display text-[64px] font-bold leading-none text-pine tabular">404</p>
      <p className="text-ink-muted">That page does not exist.</p>
      <Link to="/" className="btn btn-primary mt-2">Back home</Link>
    </div>
  );
}
