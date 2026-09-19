import { useDocumentMeta } from '../lib/hooks';
import LandingNav from '../components/landing/LandingNav';
import Hero from '../components/landing/Hero';
import About from '../components/landing/About';
import Features from '../components/landing/Features';
import HowItWorks from '../components/landing/HowItWorks';
import Stats from '../components/landing/Stats';
import Contact from '../components/landing/Contact';
import FinalCta from '../components/landing/FinalCta';
import LandingFooter from '../components/landing/LandingFooter';

/**
 * Public marketing page at `/` for logged-out visitors. A logged-in visitor never sees this —
 * RequireAuth in App.tsx renders the dashboard's AppLayout at the same path instead.
 * Entirely separate from AppLayout: its own scroll, its own footer, no shared chrome.
 */
export default function LandingPage() {
  useDocumentMeta({
    title: 'GridPulse — Renewable fleet operations for Chitral',
    description:
      'Real-time monitoring for eleven hydro, solar and wind plants across Upper and Lower Chitral. Live telemetry every 5 seconds, alerting, work orders and reports in one dashboard.',
  });

  return (
    <div className="min-h-full">
      <LandingNav />
      <main>
        <Hero />
        <About />
        <Features />
        <HowItWorks />
        <Stats />
        <Contact />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
