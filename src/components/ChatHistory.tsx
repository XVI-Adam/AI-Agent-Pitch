import { useRef, useLayoutEffect, useEffect, useMemo } from 'react';
import type { Message } from '../types/chat';
import type { StreamingChatError } from '../hooks/useStreamingChat';
import { ChatMessage } from './ChatMessage';
import { LoadingSkeleton } from './LoadingSkeleton';

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl';

interface EmptyStateProps {
  onPick: (prompt: string) => void;
}

function EmptyState({ onPick }: EmptyStateProps) {
  const prompts = [
    "What's Adam's strongest technical skill?",
    'Tell me about BodyCraft and how it was built',
    'Why would Adam be a good frontend engineer?',
    'What AI projects has Adam shipped?',
  ];
  return (
    <div className="empty">
      <span className="empty__kicker">Candidate brief · Adam Martinez · NYC</span>
      <h2 className="empty__head">
        Ask anything about Adam. <em>Grounded in real experience.</em>
      </h2>
      <p className="empty__body">
        This AI knows Adam&apos;s projects, stack, and background. Press
        <span className="kbd-inline"> {MOD_LABEL}+Enter</span> to send,
        <span className="kbd-inline"> {MOD_LABEL}+K</span> to reset.
      </p>
      <div className="empty__prompts">
        {prompts.map((p) => (
          <button key={p} type="button" onClick={() => onPick(p)}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ErrorNoticeProps {
  error: StreamingChatError | null;
  onRetry: () => void;
  onDismiss: () => void;
}

function ErrorNotice({ error, onRetry, onDismiss }: ErrorNoticeProps) {
  if (!error) return null;
  const label =
    error.kind === 'validation' ? 'Input' : error.kind === 'timeout' ? 'Timeout' : 'API error';
  return (
    <div className="notice" role="alert">
      <span className="notice__tag">{label}</span>
      <span className="notice__text">{error.message}</span>
      {error.kind !== 'validation' ? (
        <button className="notice__retry" type="button" onClick={onRetry}>
          Retry
        </button>
      ) : (
        <button className="notice__retry" type="button" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}

interface ChatHistoryProps {
  messages: Message[];
  isLoading: boolean;
  currentStreamedMessage: string;
  error: StreamingChatError | null;
  onRetry: () => void;
  onDismissError: () => void;
  onPickPrompt: (prompt: string) => void;
}

export function ChatHistory({
  messages,
  isLoading,
  currentStreamedMessage,
  error,
  onRetry,
  onDismissError,
  onPickPrompt,
}: ChatHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef(true);

  // Track whether user is parked near the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickyRef.current = distance < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-scroll to bottom when new content arrives if user is near the bottom.
  const scrollDeps = useMemo(
    () => [
      messages.length,
      messages[messages.length - 1]?.content.length ?? 0,
      !!error,
    ],
    [messages, error]
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickyRef.current) return;
    el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, scrollDeps);

  // Show standalone skeleton when loading and no assistant message has tokens yet.
  const lastMsg = messages[messages.length - 1];
  const showStandaloneSkeleton =
    isLoading && !currentStreamedMessage && (!lastMsg || lastMsg.role !== 'assistant');

  return (
    <div className="scroll" ref={scrollRef}>
      <div className="conversation">
        {messages.length === 0 && !isLoading ? (
          <EmptyState onPick={onPickPrompt} />
        ) : (
          messages.map((m, i) => (
            <ChatMessage key={m.id} message={m} index={i} />
          ))
        )}
        {showStandaloneSkeleton && (
          <div className="message" data-role="assistant">
            <div className="message__byline">
              <span className="message__role">Dispatch</span>
            </div>
            <div className="message__body">
              <LoadingSkeleton />
            </div>
          </div>
        )}
        <ErrorNotice error={error} onRetry={onRetry} onDismiss={onDismissError} />
      </div>
    </div>
  );
}
