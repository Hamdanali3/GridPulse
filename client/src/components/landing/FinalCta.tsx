import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Reveal from './Reveal';

export default function FinalCta() {
  return (
    <section className="bg-paper/60 py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal className="panel-dark relative flex flex-col items-center gap-5 overflow-hidden p-10 text-center sm:p-14">
          <div className="chitral-strip" aria-hidden />
          <h2 className="max-w-[36ch] font-display text-[26px] font-semibold leading-tight text-white sm:text-[32px]">
            See the whole fleet, in real time.
          </h2>
          <p className="max-w-[46ch] text-[15px] text-white/70">
            Sign in with any of the three demo roles — admin, engineer or viewer — and look around.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/register" className="btn btn-primary bg-amber text-pine hover:bg-amber-deep">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login" className="btn border-white/25 bg-transparent text-white hover:bg-white/10">
              Log in
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
