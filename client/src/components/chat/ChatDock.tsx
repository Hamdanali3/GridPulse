import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../lib/auth';
import {
  clearSessionMessages,
  fallbackBootstrapForUser,
  fetchAssistantBootstrap,
  loadSessionMessages,
  saveSessionMessages,
  streamSessionChat,
  type ChatTurnHistory,
  type SessionChatMessage,
} from '../../lib/assistant';
import AssistantMessageCard from './AssistantMessageCard';

const ROLE_SUBTITLE: Record<string, string> = {
  admin: 'Admin · Chief-of-Staff',
  engineer: 'Engineer · Field Co-Pilot',
  viewer: 'Viewer · Read-Only Reporter',
};

const MIN_WIDTH = 380;
const MAX_WIDTH = 740;
const DEFAULT_WIDTH = 470;

export default function ChatDock() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('gp_pulsebot_width'));
      if (Number.isFinite(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH) return saved;
    } catch {
      // ignore
    }
    return DEFAULT_WIDTH;
  });

  const [messages, setMessages] = useState<SessionChatMessage[]>(() =>
    user ? loadSessionMessages(user.id) : [],
  );
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef(false);

  const bootstrap = useQuery({
    queryKey: ['assistant', 'bootstrap', user?.id, user?.role],
    queryFn: () => fetchAssistantBootstrap(user!),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });

  // Reload session-isolated messages whenever user changes
  useEffect(() => {
    if (!user) {
      setMessages([]);
      return;
    }
    setMessages(loadSessionMessages(user.id));
  }, [user]);

  // Persist completed messages per user session
  useEffect(() => {
    if (!user) return;
    saveSessionMessages(user.id, messages);
  }, [user, messages]);

  // Auto-scroll chat feed when messages update
  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // Focus input when opened; support Escape to close and Alt+P to toggle
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Horizontal drag-to-resize on desktop
  const startResize = useCallback((startEvent: React.MouseEvent) => {
    startEvent.preventDefault();
    resizingRef.current = true;
    const startX = startEvent.clientX;
    const startWidth = panelWidth;

    const onMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = startX - moveEvent.clientX;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
      setPanelWidth(next);
      setWide(next >= 620);
      try {
        localStorage.setItem('gp_pulsebot_width', String(next));
      } catch {
        // ignore
      }
    };

    const onUp = () => {
      resizingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  const toggleWide = () => {
    const nextWidth = wide ? DEFAULT_WIDTH : 680;
    setWide(!wide);
    setPanelWidth(nextWidth);
    try {
      localStorage.setItem('gp_pulsebot_width', String(nextWidth));
    } catch {
      // ignore
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  const sendPrompt = useCallback(
    async (rawPrompt: string) => {
      if (!user || isStreaming) return;
      const trimmed = rawPrompt.trim();
      if (!trimmed) return;

      const history: ChatTurnHistory[] = messages
        .filter((m) => !m.error && (m.content || m.response?.summary))
        .slice(-8)
        .map((m) => ({
          role: m.role,
          content: m.role === 'assistant' ? (m.response?.summary ?? m.content) : m.content,
        }));

      const userMsgId = `u-${Date.now()}`;
      const botMsgId = `a-${Date.now() + 1}`;
      const nowIso = new Date().toISOString();

      const userMsg: SessionChatMessage = {
        id: userMsgId,
        role: 'user',
        content: trimmed,
        createdAt: nowIso,
      };
      const botPlaceholder: SessionChatMessage = {
        id: botMsgId,
        role: 'assistant',
        content: '',
        createdAt: nowIso,
        streaming: true,
        statusText: 'Checking session & planning queries…',
      };

      setInput('');
      setIsStreaming(true);
      setMessages((prev) => [...prev, userMsg, botPlaceholder]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await streamSessionChat({
          message: trimmed,
          history,
          signal: controller.signal,
          onStatus: (statusMessage) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === botMsgId ? { ...m, statusText: statusMessage } : m)),
            );
          },
          onDelta: (deltaText) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === botMsgId ? { ...m, content: m.content + deltaText } : m)),
            );
          },
        });

        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMsgId
              ? {
                  ...m,
                  streaming: false,
                  statusText: undefined,
                  content: result.response.summary,
                  response: result.response,
                  toolsUsed: result.toolsUsed,
                  latencyMs: result.latencyMs,
                }
              : m,
          ),
        );
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMsgId
                ? {
                    ...m,
                    streaming: false,
                    statusText: undefined,
                    content: m.content || 'Generation stopped.',
                  }
                : m,
            ),
          );
        } else {
          const friendly =
            err instanceof Error && err.message
              ? err.message
              : 'PulseBot could not reach the assistant service right now.';
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMsgId
                ? {
                    ...m,
                    streaming: false,
                    statusText: undefined,
                    error: friendly,
                    retryPrompt: trimmed,
                  }
                : m,
            ),
          );
        }
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
      }
    },
    [user, isStreaming, messages],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendPrompt(input);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendPrompt(input);
    }
  };

  const handleClear = () => {
    if (!user) return;
    stopStreaming();
    clearSessionMessages(user.id);
    setMessages([]);
  };

  const handleRetry = (retryQuestion: string) => {
    // Remove trailing errored pair before re-sending
    setMessages((prev) => {
      const copy = [...prev];
      if (copy.length > 0 && copy[copy.length - 1]?.error) {
        copy.pop();
        if (copy.length > 0 && copy[copy.length - 1]?.role === 'user') {
          copy.pop();
        }
      }
      return copy;
    });
    setTimeout(() => {
      void sendPrompt(retryQuestion);
    }, 10);
  };

  if (!user) return null;

  const boot = bootstrap.data ?? fallbackBootstrapForUser(user);

  return (
    <>
      {/* Floating launcher button */}
      {!open && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open PulseBot AI Copilot (Alt+P)"
          title="Open PulseBot AI Copilot (Alt+P)"
          className="fixed bottom-16 right-4 z-40 inline-flex items-center gap-2 rounded-control border border-line-strong bg-pine px-3.5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-pine-soft md:bottom-5 md:right-6"
        >
          <Sparkles className="h-4 w-4 text-amber" />
          <span>PulseBot</span>
          <span className="rounded-chip bg-white/12 px-1.5 py-0.5 text-[10.5px] font-normal capitalize text-white/85">
            {user.role}
          </span>
        </button>
      )}

      {/* Dock panel */}
      {open && (
        <aside
          role="dialog"
          aria-modal="false"
          aria-label="PulseBot Operations Copilot"
          style={{ ['--pulsebot-w' as string]: `${panelWidth}px` }}
          className={clsx(
            'fixed inset-x-2 bottom-16 top-14 z-50 flex flex-col overflow-hidden rounded-panel border border-line-strong bg-mist',
            'md:inset-y-4 md:left-auto md:right-5 md:w-[var(--pulsebot-w)]',
          )}
        >
          {/* Desktop left-edge drag resize handle */}
          <div
            onMouseDown={startResize}
            title="Drag to resize panel"
            aria-hidden="true"
            className="absolute inset-y-0 left-0 z-10 hidden w-1.5 cursor-ew-resize transition-colors hover:bg-teal/40 md:block"
          />

          {/* Header */}
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-paper px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-pine text-amber">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[14px] font-semibold text-pine">PulseBot</h2>
                  <span className="rounded-chip border border-line bg-mist px-1.5 py-0.5 text-[10.5px] font-medium text-ink-muted">
                    {ROLE_SUBTITLE[user.role] ?? user.role}
                  </span>
                </div>
                <p className="truncate text-[11px] text-ink-faint">
                  Read-only GridPulse data · {boot.timezone}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  title="Clear chat"
                  aria-label="Clear chat"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-control border border-line bg-mist text-ink-muted transition-colors hover:border-line-strong hover:text-pine"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={toggleWide}
                title={wide ? 'Compact width' : 'Expand width'}
                aria-label={wide ? 'Compact width' : 'Expand width'}
                className="hidden h-7 w-7 items-center justify-center rounded-control border border-line bg-mist text-ink-muted transition-colors hover:border-line-strong hover:text-pine md:inline-flex"
              >
                {wide ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setTimeout(() => triggerRef.current?.focus(), 20);
                }}
                title="Close PulseBot (Esc)"
                aria-label="Close PulseBot"
                className="inline-flex h-7 w-7 items-center justify-center rounded-control border border-line bg-mist text-ink-muted transition-colors hover:border-line-strong hover:text-pine"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Messages / Starter State */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3.5">
            {messages.length === 0 ? (
              <div className="space-y-3.5">
                <div className="rounded-panel border border-line bg-paper p-3.5">
                  <p className="text-[13px] leading-relaxed text-ink">{boot.welcome}</p>
                  <p className="mt-2 text-[11.5px] text-ink-faint">
                    Answers come strictly from live GridPulse records and include verified links to inspect or act in the control room.
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-[11.5px] font-medium text-ink-faint">
                    Suggested questions for {user.role}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {boot.starters.map((starter, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={isStreaming}
                        onClick={() => void sendPrompt(starter)}
                        className="rounded-control border border-line bg-paper px-3 py-2 text-left text-[12.5px] text-ink transition-colors hover:border-line-strong hover:bg-moss"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <AssistantMessageCard
                  key={msg.id}
                  message={msg}
                  disabled={isStreaming}
                  onFollowup={(q) => void sendPrompt(q)}
                  onRetry={handleRetry}
                  onNavigate={() => {
                    // On mobile screens, close dock on deep-link navigation so the destination page is immediately visible
                    if (window.innerWidth < 768) {
                      setOpen(false);
                    }
                  }}
                />
              ))
            )}
          </div>

          {/* Composer */}
          <form onSubmit={handleSubmit} className="shrink-0 border-t border-line bg-paper p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={2}
                maxLength={1500}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about generation, sites, alerts, or work orders…"
                aria-label="Message PulseBot"
                className="field min-h-[54px] flex-1 resize-none py-2 text-[13px] leading-snug"
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stopStreaming}
                  title="Stop generation"
                  aria-label="Stop generation"
                  className="btn btn-secondary h-[54px] shrink-0 px-3"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  title="Send message"
                  aria-label="Send message"
                  className="btn btn-primary h-[54px] shrink-0 px-3.5 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-faint">
              <span>Enter to send · Shift+Enter for newline</span>
              {input.length > 1100 && <span className="tabular">{input.length}/1500</span>}
            </div>
          </form>
        </aside>
      )}
    </>
  );
}
