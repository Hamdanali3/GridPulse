import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Reveal from './Reveal';

export default function FinalCta() {
  return (
    <section className="border-t border-line bg-paper py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.022em] text-pine sm:text-[28px]">
              See the whole fleet, in real time.
            </h2>
            <p className="mt-2 max-w-[48ch] text-[14.5px] text-ink-muted">
              Sign in with any of the three demo roles — admin, engineer or viewer — and look around.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link to="/register" className="btn btn-primary">
              Get started <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Link>
            <Link to="/login" className="btn btn-secondary">
              Log in
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
