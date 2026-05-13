// Strip potentially dangerous HTML from AI responses before markdown rendering.
// We remove script/style/event-handler patterns while leaving plain text intact.
// This is a defence-in-depth measure; react-markdown itself doesn't use innerHTML,
// but sanitizing the raw string before it reaches any renderer is a safer default.

const DANGEROUS_TAGS = /<(script|style|iframe|object|embed|form|base|link|meta)[^>]*>[\s\S]*?<\/\1>/gi;
const SELF_CLOSING_DANGEROUS = /<(script|style|iframe|object|embed|form|base|link|meta)[^>]*\/?>/gi;
const EVENT_HANDLERS = /\s+on\w+\s*=\s*(['"])[\s\S]*?\1/gi;
const JAVASCRIPT_HREFS = /href\s*=\s*(['"])\s*javascript:[^'"]*\1/gi;

export function sanitize(input: string): string {
  if (!input) return '';
  return input
    .replace(DANGEROUS_TAGS, '')
    .replace(SELF_CLOSING_DANGEROUS, '')
    .replace(EVENT_HANDLERS, '')
    .replace(JAVASCRIPT_HREFS, 'href="#"');
}
