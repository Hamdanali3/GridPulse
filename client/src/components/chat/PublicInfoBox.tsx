import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  Loader2,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  PUBLIC_STARTER_QUESTIONS,
  streamPublicChat,
  type ChatTurnHistory,
  type DeepLink,
  type PublicAssistantResponse,
} from '../../lib/assistant';

interface Props {
  variant?: 'landing' | 'compact';
}

interface PublicExchange {
  question: string;
  streamedText: string;
  statusText?: string;
  streaming: boolean;
  response?: PublicAssistantResponse;
  error?: string;
}

export default function PublicInfoBox({ variant = 'landing' }: Props) {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<ChatTurnHistory[]>([]);
  const [current, setCurrent] = useState<PublicExchange | null>(null);

  const isStreaming = Boolean(current?.streaming);

  const askQuestion = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || isStreaming) return;

    setInput('');
    setCurrent({
      question: trimmed,
      streamedText: '',
      statusText: 'Searching GridPulse project guide…',
      streaming: true,
    });

    try {
      const result = await streamPublicChat({
        message: trimmed,
        history,
        onStatus: (msg) => {
          setCurrent((prev) => (prev ? { ...prev, statusText: msg } : prev));
        },
        onDelta: (delta) => {
          setCurrent((prev) =>
            prev ? { ...prev, streamedText: prev.streamedText + delta } : prev,
          );
        },
      });

      setCurrent({
        question: trimmed,
        streamedText: result.response.summary,
        streaming: false,
        response: result.response,
      });

      setHistory((prev) =>
        [
          ...prev,
          { role: 'user' as const, content: trimmed },
          { role: 'assistant' as const, content: result.response.summary },
        ].slice(-6),
      );
    } catch (err: unknown) {
      const friendly =
        err instanceof Error && err.message
          ? err.message
          : 'Unable to reach the project guide right now. You can also explore directly with a demo account.';
      setCurrent({
        question: trimmed,
        streamedText: '',
        streaming: false,
        error: friendly,
      });
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void askQuestion(input);
  };

  const handleLink = (link: DeepLink) => {
    if (link.route.startsWith('/#')) {
      const id = link.route.slice(2);
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    navigate(link.route);
  };

  const chips =
    variant === 'compact'
      ? PUBLIC_STARTER_QUESTIONS.slice(0, 4)
      : PUBLIC_STARTER_QUESTIONS;

  const innerCard = (
    <div
      className={clsx(
        'rounded-panel border border-line bg-paper',
        variant === 'landing' ? 'p-5 md:p-7' : 'p-4',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-teal">
            <Sparkles className="h-3.5 w-3.5 text-amber" />
            <span>PulseBot Project Guide</span>
          </div>
          <h2
            className={clsx(
              'mt-1 font-semibold tracking-[-0.02em] text-pine',
              variant === 'landing' ? 'text-[20px] md:text-[23px]' : 'text-[14.5px]',
            )}
          >
            {variant === 'landing'
              ? 'Ask anything about GridPulse and the Chitral platform'
              : 'Questions before signing in? Ask PulseBot'}
          </h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            Instant answers on features, roles &amp; RBAC, alert-to-work-order automation, telemetry simulation, and tech stack. Private plant data stays strictly behind sign-in.
          </p>
        </div>

        {current && !current.streaming && (
          <button
            type="button"
            onClick={() => setCurrent(null)}
            className="inline-flex items-center gap-1 rounded-control border border-line bg-mist px-2.5 py-1 text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:text-pine"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Suggested Question Chips */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {chips.map((q) => (
          <button
            key={q}
            type="button"
            disabled={isStreaming}
            onClick={() => void askQuestion(q)}
            className="rounded-control border border-line bg-mist px-2.5 py-1.5 text-left text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:bg-moss hover:text-pine disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Free-text Input */}
      <form onSubmit={handleSubmit} className="mt-3.5 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          maxLength={600}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask how GridPulse works, how alerts become work orders, or how to try the demo…"
          aria-label="Ask PulseBot about GridPulse"
          className="field flex-1 text-[13.5px]"
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          className="btn btn-primary shrink-0 disabled:opacity-50"
        >
          {isStreaming ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Answering…</span>
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              <span>Ask PulseBot</span>
            </>
          )}
        </button>
      </form>

      {/* Answer / Stream Region */}
      {current && (
        <div
          aria-live="polite"
          className="mt-4 space-y-3 rounded-control border border-line bg-mist p-4"
        >
          <p className="text-[12px] font-medium text-ink-faint">
            Q: <span className="text-pine">{current.question}</span>
          </p>

          {current.error ? (
            <div className="flex items-start gap-2.5 text-[13px] text-ink">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
              <div className="flex-1">
                <p className="text-ink-muted">{current.error}</p>
                <button
                  type="button"
                  onClick={() => void askQuestion(current.question)}
                  className="btn btn-secondary btn-sm mt-2 inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <>
              {current.streaming && (
                <div className="flex items-center gap-2 text-[12px] text-ink-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-teal" />
                  <span>{current.statusText || 'Searching project guide…'}</span>
                </div>
              )}

              {current.response?.refused && (
                <div className="inline-flex items-center gap-1.5 rounded-chip border border-line-strong bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                  <ShieldAlert className="h-3 w-3 text-amber" />
                  <span>Public guide boundary — no private operational data accessed</span>
                </div>
              )}

              {(current.response?.summary || current.streamedText) ? (
                <p className="text-[13.5px] leading-relaxed text-ink">
                  {current.response?.summary || current.streamedText}
                </p>
              ) : (
                <div className="space-y-2 py-1" aria-hidden="true">
                  <div className="h-3.5 w-[90%] animate-pulse rounded-chip bg-moss-deep" />
                  <div className="h-3.5 w-[72%] animate-pulse rounded-chip bg-moss-deep" />
                </div>
              )}

              {current.response && current.response.bullets.length > 0 && (
                <ul className="space-y-1 text-[12.5px] text-ink-muted">
                  {current.response.bullets.map((b, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-teal" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}

              {current.response && current.response.links.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {current.response.links.map((l, idx) => (
                    <button
                      key={`${l.route}-${idx}`}
                      type="button"
                      onClick={() => handleLink(l)}
                      className="inline-flex items-center gap-1 rounded-control border border-line-strong bg-paper px-2.5 py-1 text-[12px] font-medium text-teal transition-colors hover:bg-moss hover:text-pine"
                    >
                      <span>{l.label}</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              )}

              {current.response && current.response.followups.length > 0 && !current.streaming && (
                <div className="border-t border-line pt-2.5">
                  <p className="mb-1.5 text-[11px] font-medium text-ink-faint">Follow-up topics</p>
                  <div className="flex flex-wrap gap-1.5">
                    {current.response.followups.map((f, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => void askQuestion(f)}
                        className="rounded-control border border-line bg-paper px-2.5 py-1 text-left text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:text-pine"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  if (variant === 'compact') {
    return <div className="mt-5">{innerCard}</div>;
  }

  return (
    <section id="ask-pulsebot" className="border-b border-line bg-mist py-12 md:py-16">
      <div className="mx-auto max-w-[1160px] px-5 md:px-8">{innerCard}</div>
    </section>
  );
}
