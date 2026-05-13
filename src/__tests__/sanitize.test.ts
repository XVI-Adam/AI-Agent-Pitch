import { describe, it, expect } from 'vitest';
import { sanitize } from '../utils/sanitize';

describe('sanitize', () => {
  it('passes clean text through unchanged', () => {
    const text = 'Hello, this is **markdown** with `code` and _italics_.';
    expect(sanitize(text)).toBe(text);
  });

  it('strips <script> tags and their contents', () => {
    const input = 'Hello <script>alert("xss")</script> world';
    expect(sanitize(input)).not.toContain('<script>');
    expect(sanitize(input)).not.toContain('alert');
  });

  it('strips self-closing dangerous tags', () => {
    const input = 'Text <script src="evil.js" /> more text';
    expect(sanitize(input)).not.toContain('<script');
  });

  it('strips inline event handlers', () => {
    const input = '<div onclick="evil()">click me</div>';
    expect(sanitize(input)).not.toContain('onclick');
  });

  it('strips javascript: hrefs', () => {
    const input = '<a href="javascript:alert(1)">link</a>';
    const result = sanitize(input);
    expect(result).not.toContain('javascript:');
  });

  it('handles empty string input', () => {
    expect(sanitize('')).toBe('');
  });

  it('preserves normal markdown content', () => {
    const md = '## Heading\n\n- item one\n- item two\n\n```js\nconsole.log("hello");\n```';
    expect(sanitize(md)).toBe(md);
  });
});
