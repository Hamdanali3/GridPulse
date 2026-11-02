import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import Reveal from './Reveal';

export const CONTACT_EMAIL = 'h27907177@gmail.com';
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
  const [sending, setSending] = useState(false);

  const validate = (): boolean => {
    const next: Partial<FormState> = {};
    if (!form.name.trim()) next.name = 'Tell us who you are.';
    if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.message.trim().length < 10) next.message = 'A few more words would help (10+ characters).';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending || !validate()) return;

    const trimmedName = form.name.trim();
    const trimmedEmail = form.email.trim();
    const trimmedMessage = form.message.trim();
    const subjectLine = `GridPulse enquiry from ${trimmedName}`;

    setSending(true);
    try {
      const res = await fetch(`https://formsubmit.co/ajax/${CONTACT_EMAIL}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          _replyto: trimmedEmail,
          _subject: subjectLine,
          message: trimmedMessage,
          _template: 'table',
        }),
      });

      const data = (await res.json().catch(() => null)) as { success?: boolean | string; message?: string } | null;

      if (res.ok && (data?.success === true || data?.success === 'true')) {
        toast.success('Message sent!', {
          description: `Your message has been delivered to ${CONTACT_EMAIL}.`,
        });
        setForm({ name: '', email: '', message: '' });
        setErrors({});
        return;
      }

      if (typeof data?.message === 'string' && /activat/i.test(data.message)) {
        toast.info('One-time form activation sent', {
          description: `Check ${CONTACT_EMAIL} (including Spam) and click "Activate Form" once to enable direct messages.`,
        });
        return;
      }

      throw new Error(data?.message || 'Direct form submission failed');
    } catch {
      const subject = encodeURIComponent(subjectLine);
      const body = encodeURIComponent(`${trimmedMessage}\n\n— ${trimmedName} (${trimmedEmail})`);
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;

      toast.info('Opening your email app…', {
        description: `Pre-filled your message to ${CONTACT_EMAIL} — just hit send.`,
      });
      setForm({ name: '', email: '', message: '' });
      setErrors({});
    } finally {
      setSending(false);
    }
  };

  return (
    <section id="contact" className="scroll-mt-14 py-20 md:py-28">
      <span id="visit-chitral" className="block scroll-mt-24" aria-hidden />
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal className="grid gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16">
          <div id="support" className="scroll-mt-24">
            <p className="eyebrow">Get in touch</p>
            <h2 className="mt-3 text-[26px] font-semibold leading-[1.18] tracking-[-0.022em] text-pine sm:text-[30px]">
              Questions about the fleet, or the code behind it?
            </h2>
            <p className="mt-4 max-w-[44ch] text-[14.5px] leading-relaxed text-ink-muted">
              Send a note and it goes straight to our inbox. Prefer to read the source first? It's public.
            </p>
            <div className="mt-8 flex flex-col gap-2 border-t border-line pt-5 text-[13.5px]">
              <a href={`mailto:${CONTACT_EMAIL}`} className="w-fit text-pine underline-offset-4 hover:underline">
                {CONTACT_EMAIL}
              </a>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="w-fit text-ink-muted underline-offset-4 hover:text-pine hover:underline">
                Source on GitHub
              </a>
            </div>
          </div>

          <form id="book-a-demo" onSubmit={handleSubmit} noValidate className="panel scroll-mt-24 space-y-4 p-6 sm:p-7">
            <div>
              <label htmlFor="contact-name" className="mb-1.5 block text-[12.5px] font-medium text-pine">Name</label>
              <input
                id="contact-name"
                name="name"
                className="field"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'contact-name-error' : undefined}
              />
              {errors.name && <p id="contact-name-error" className="mt-1 text-[12px] text-ember">{errors.name}</p>}
            </div>
            <div>
              <label htmlFor="contact-email" className="mb-1.5 block text-[12.5px] font-medium text-pine">Email</label>
              <input
                id="contact-email"
                name="email"
                type="email"
                className="field"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'contact-email-error' : undefined}
              />
              {errors.email && <p id="contact-email-error" className="mt-1 text-[12px] text-ember">{errors.email}</p>}
            </div>
            <div>
              <label htmlFor="contact-message" className="mb-1.5 block text-[12.5px] font-medium text-pine">Message</label>
              <textarea
                id="contact-message"
                name="message"
                className="field min-h-[110px] resize-y"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                aria-invalid={!!errors.message}
                aria-describedby={errors.message ? 'contact-message-error' : undefined}
              />
              {errors.message && <p id="contact-message-error" className="mt-1 text-[12px] text-ember">{errors.message}</p>}
            </div>
            <button type="submit" disabled={sending} className="btn btn-primary w-full sm:w-auto disabled:opacity-60">
              {sending ? 'Sending…' : 'Send message'}
            </button>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
