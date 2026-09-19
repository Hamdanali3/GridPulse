import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Github, Mail } from 'lucide-react';
import Reveal from './Reveal';

const CONTACT_EMAIL = 'hello@gridpulse.io';
const GITHUB_URL = 'https://github.com/Hamdanali3/GridPulse';

interface FormState {
  name: string;
  email: string;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Contact() {
  const [form, setForm] = useState<FormState>({ name: '', email: '', message: '' });
  const [errors, setErrors] = useState<Partial<FormState>>({});

  const validate = (): boolean => {
    const next: Partial<FormState> = {};
    if (!form.name.trim()) next.name = 'Tell us who you are.';
    if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.message.trim().length < 10) next.message = 'A few more words would help (10+ characters).';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const subject = encodeURIComponent(`GridPulse enquiry from ${form.name}`);
    const body = encodeURIComponent(`${form.message}\n\n— ${form.name} (${form.email})`);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;

    toast.success('Opening your email app…', { description: 'Your message is pre-filled — just hit send.' });
    setForm({ name: '', email: '', message: '' });
    setErrors({});
  };

  return (
    <section id="contact" className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <p className="chip bg-moss text-pine">Get in touch</p>
            <h2 className="mt-3 font-display text-[28px] font-semibold leading-tight text-pine sm:text-[32px]">
              Questions about the fleet, or the code behind it?
            </h2>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">
              Send a note and it'll open in your email app, ready to send. Prefer to read the source first? It's
              public.
            </p>
            <div className="mt-6 flex flex-col gap-2.5 text-[14px]">
              <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 text-pine transition-colors hover:text-pine-soft">
                <Mail className="h-4 w-4" strokeWidth={1.75} /> {CONTACT_EMAIL}
              </a>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-pine transition-colors hover:text-pine-soft">
                <Github className="h-4 w-4" strokeWidth={1.75} /> Source on GitHub
              </a>
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate className="panel space-y-4 p-6">
            <div>
              <label htmlFor="contact-name" className="mb-1.5 block text-[13px] font-medium text-pine">Name</label>
              <input
                id="contact-name"
                className="field"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'contact-name-error' : undefined}
              />
              {errors.name && <p id="contact-name-error" className="mt-1 text-[12.5px] text-ember">{errors.name}</p>}
            </div>
            <div>
              <label htmlFor="contact-email" className="mb-1.5 block text-[13px] font-medium text-pine">Email</label>
              <input
                id="contact-email"
                type="email"
                className="field"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'contact-email-error' : undefined}
              />
              {errors.email && <p id="contact-email-error" className="mt-1 text-[12.5px] text-ember">{errors.email}</p>}
            </div>
            <div>
              <label htmlFor="contact-message" className="mb-1.5 block text-[13px] font-medium text-pine">Message</label>
              <textarea
                id="contact-message"
                className="field min-h-[110px] resize-y"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                aria-invalid={!!errors.message}
                aria-describedby={errors.message ? 'contact-message-error' : undefined}
              />
              {errors.message && <p id="contact-message-error" className="mt-1 text-[12.5px] text-ember">{errors.message}</p>}
            </div>
            <button type="submit" className="btn btn-primary w-full sm:w-auto">Send message</button>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
