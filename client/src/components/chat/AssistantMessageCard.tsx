import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Copy,
  Info,
  Loader2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  buildDeepLinkPath,
  type DeepLink,
  type SessionChatMessage,
} from '../../lib/assistant';
import { AssistantVisualBlock, KpiGrid } from './AssistantVisuals';

interface Props {
  message: SessionChatMessage;
  disabled?: boolean;
  onFollowup: (question: string) => void;
  onRetry: (question: string) => void;
  onNavigate?: () => void;
}

export default function AssistantMessageCard({
  message,
  disabled = false,
  onFollowup,
  onRetry,
  onNavigate,
}: Props) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-control border border-line-strong bg-pine px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white">
          {message.content}
        </div>
      </div>
    );
  }

  const res = message.response;
  const summaryText = res?.summary || message.content;

  const handleLinkClick = (link: DeepLink) => {
    const target = buildDeepLinkPath(link);
    navigate(target);
    onNavigate?.();
  };

  const handleCopy = async () => {
    if (!summaryText) return;
    const kpiLines =
      res?.kpis?.length
        ? '\n\n' +
          res.kpis
            .map((k) => `• ${k.label}: ${k.value}${k.unit ? ` ${k.unit}` : ''}${k.delta ? ` (${k.delta})` : ''}`)
            .join('\n')
        : '';
    try {
      await navigator.clipboard.writeText(`${summaryText}${kpiLines}`);
      setCopied(true);
      toast.success('Copied PulseBot summary');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Unable to copy to clipboard');
    }
  };

  if (message.error) {
    return (
      <div
        role="alert"
        className="rounded-control border border-ember/30 bg-ember-soft p-3.5 text-[13px] text-ink"
      >
        <div className="flex items-start gap-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-pine">Unable to complete answer</p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">{message.error}</p>
            {message.retryPrompt && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRetry(message.retryPrompt!)}
                className="btn btn-secondary btn-sm mt-2.5 inline-flex items-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry question
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-panel border border-line bg-paper p-3.5" aria-live="polite">
      {/* Live tool / thinking status indicator */}
      {message.streaming && (
        <div className="flex items-center gap-2 text-[12px] text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-teal" />
          <span>{message.statusText || 'Analyzing GridPulse data…'}</span>
        </div>
      )}

      {/* Summary text (streamed progressively, then finalized) */}
      {summaryText ? (
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13.5px] leading-relaxed text-ink">{summaryText}</p>
          {!message.streaming && (
            <button
              type="button"
              onClick={handleCopy}
              title="Copy summary"
              aria-label="Copy summary"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-line bg-mist text-ink-faint transition-colors hover:border-line-strong hover:text-pine"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-teal" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2 py-1" aria-hidden="true">
          <div className="h-3.5 w-[92%] animate-pulse rounded-chip bg-moss-deep" />
          <div className="h-3.5 w-[76%] animate-pulse rounded-chip bg-moss-deep" />
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="h-14 animate-pulse rounded-control bg-moss" />
            <div className="h-14 animate-pulse rounded-control bg-moss" />
            <div className="h-14 animate-pulse rounded-control bg-moss" />
          </div>
        </div>
      )}

      {/* Structured blocks once server-validated response arrives */}
      {res && (
        <>
          {res.kpis.length > 0 && <KpiGrid kpis={res.kpis} />}

          {res.visuals.length > 0 && (
            <div className="space-y-2.5">
              {res.visuals.map((vis, idx) => (
                <AssistantVisualBlock key={`${vis.type}-${idx}`} visual={vis} />
              ))}
            </div>
          )}

          {res.insights.length > 0 && (
            <div className="space-y-1.5 rounded-control border border-line bg-mist px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                <Sparkles className="h-3 w-3 text-amber" />
                Operational insights
              </p>
              <ul className="space-y-1 text-[12.5px] text-ink-muted">
                {res.insights.map((ins, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-teal" />
                    <span>{ins}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Verified React Router Deep Links */}
          {res.links.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {res.links.map((link, idx) => (
                <button
                  key={`${link.route}-${idx}`}
                  type="button"
                  onClick={() => handleLinkClick(link)}
                  className="inline-flex items-center gap-1.5 rounded-control border border-line-strong bg-teal-soft px-2.5 py-1.5 text-[12px] font-medium text-teal transition-colors hover:bg-moss hover:text-pine"
                >
                  <span>{link.label}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Confidence / Scope note */}
          {res.confidence_notes && (
            <p className="flex items-start gap-1.5 border-t border-line pt-2 text-[11.5px] text-ink-faint">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{res.confidence_notes}</span>
            </p>
          )}

          {/* Suggested role-appropriate follow-ups */}
          {res.followups.length > 0 && !message.streaming && (
            <div className="border-t border-line pt-2.5">
              <p className="mb-1.5 text-[11px] font-medium text-ink-faint">Suggested follow-ups</p>
              <div className="flex flex-wrap gap-1.5">
                {res.followups.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={disabled}
                    onClick={() => onFollowup(q)}
                    className="rounded-control border border-line bg-mist px-2.5 py-1 text-left text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:bg-moss hover:text-pine disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
