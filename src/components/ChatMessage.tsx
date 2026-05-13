import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '../types/chat';
import { sanitize } from '../utils/sanitize';
import { LoadingSkeleton } from './LoadingSkeleton';

interface ChatMessageProps {
  message: Message;
  index: number;
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function ChatMessage({ message, index }: ChatMessageProps) {
  const { role, content, timestamp, streaming } = message;
  const isUser = role === 'user';

  // Show skeleton while the assistant placeholder has no tokens yet.
  const showSkeleton = !isUser && streaming && content.length === 0;

  const safeContent = useMemo(() => sanitize(content), [content]);

  return (
    <article
      className="message"
      data-role={role}
      aria-live={!isUser ? 'polite' : undefined}
      aria-atomic={!isUser ? 'false' : undefined}
    >
      <div className="message__byline">
        <span className="message__role">
          {isUser ? 'You' : 'Dispatch'}
          <span className="message__time">
            №{String(index + 1).padStart(3, '0')} · {fmtTime(timestamp)}
          </span>
        </span>
      </div>

      <div className="message__body">
        {showSkeleton ? (
          <LoadingSkeleton />
        ) : isUser ? (
          <span>{content}</span>
        ) : (
          <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{safeContent}</ReactMarkdown>
            {streaming && <span className="caret" aria-hidden="true" />}
          </div>
        )}
      </div>
    </article>
  );
}
