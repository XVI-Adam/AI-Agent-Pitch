import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessage } from '../components/ChatMessage';
import type { Message } from '../types/chat';

const makeMsg = (overrides?: Partial<Message>): Message => ({
  id: 'msg-1',
  role: 'user',
  content: 'Hello world',
  timestamp: new Date('2025-01-01T12:00:00').getTime(),
  ...overrides,
});

describe('ChatMessage', () => {
  it('renders a user message correctly', () => {
    render(<ChatMessage message={makeMsg({ role: 'user', content: 'Hi there!' })} index={0} />);
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('renders an assistant message with markdown bold', () => {
    render(
      <ChatMessage
        message={makeMsg({ role: 'assistant', content: '**bold text** here' })}
        index={1}
      />
    );
    const bold = screen.getByRole('strong');
    expect(bold).toHaveTextContent('bold text');
  });

  it('renders an assistant message with a code block', () => {
    render(
      <ChatMessage
        message={makeMsg({ role: 'assistant', content: '```js\nconsole.log("hi");\n```' })}
        index={0}
      />
    );
    // Pre/code block should be in the document
    const pre = document.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toContain('console.log');
  });

  it('shows the skeleton when assistant has no content yet and is streaming', () => {
    render(
      <ChatMessage
        message={makeMsg({ role: 'assistant', content: '', streaming: true })}
        index={0}
      />
    );
    // Skeleton is aria-hidden so check for the element directly
    const skeleton = document.querySelector('.skeleton');
    expect(skeleton).not.toBeNull();
  });

  it('handles empty content without crashing', () => {
    expect(() =>
      render(<ChatMessage message={makeMsg({ content: '' })} index={0} />)
    ).not.toThrow();
  });

  it('shows Dispatch label for assistant messages', () => {
    render(
      <ChatMessage message={makeMsg({ role: 'assistant', content: 'Hi' })} index={0} />
    );
    expect(screen.getByText('Dispatch')).toBeInTheDocument();
  });

  it('displays the message index formatted as a number', () => {
    render(<ChatMessage message={makeMsg()} index={4} />);
    // index 4 → "005"
    expect(screen.getByText(/005/)).toBeInTheDocument();
  });
});
