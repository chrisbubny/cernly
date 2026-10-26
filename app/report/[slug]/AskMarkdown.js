'use client';
/**
 * AskMarkdown.js
 *
 * Shared Markdown renderer for all Ask Cernly chat interfaces.
 * Used by AskCernlyDrawer (ReportClient) and InlineChatPanel (GuidedFix).
 *
 * Supports:
 *   - Fenced code blocks (``` ... ```) with horizontal scroll
 *   - Headings (# ## ###)
 *   - Unordered lists (- or *)
 *   - Ordered lists (1. 2. ...)
 *   - Inline bold (**text**)
 *   - Inline italic (*text* or _text_)
 *   - Inline code (`code`)
 *   - Links ([text](url)) — opens in new tab
 *   - Paragraph spacing
 *
 * Does NOT render raw HTML — all content is composed as React elements.
 * Safe for use with AI-generated text.
 *
 * Props:
 *   content  {string}   Markdown text to render
 *   dark     {boolean}  When true, uses dark-surface palette (GuidedFix inline panel)
 *                       When false/omitted, uses light-surface palette (drawer)
 */
export default function AskMarkdown({ content, dark = false }) {
  if (!content) return null;

  const pal = dark ? DARK : LIGHT;
  const nodes = parseBlocks(content, pal);
  return <>{nodes}</>;
}

// ── Palettes ──────────────────────────────────────────────────────────────────

const LIGHT = {
  heading:    '#151621',
  codeBg:     '#e4e6f2',
  codeText:   '#151621',
  codeFont:   '"JetBrains Mono", ui-monospace, monospace',
  inlineCode: '#4a1fb8',
  text:       'inherit',
  borderH1:   '#e4e6f2',
};

const DARK = {
  heading:    '#E8EFF7',
  codeBg:     'rgba(255,255,255,.07)',
  codeText:   '#E8EFF7',
  codeFont:   '"JetBrains Mono", ui-monospace, monospace',
  inlineCode: '#A78BFA',
  text:       'inherit',
  borderH1:   'rgba(255,255,255,.12)',
};

// ── Inline renderer ───────────────────────────────────────────────────────────

/**
 * Splits a text string into React nodes, replacing **bold**, *italic*, _italic_,
 * `code`, and [text](url) patterns with styled elements.
 */
function renderInline(text, pal, keyPrefix = '') {
  // Split on all inline patterns at once
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern);
  if (parts.length === 1) return text;

  return parts.map((p, i) => {
    const key = `${keyPrefix}-${i}`;

    // Inline code
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      return (
        <code key={key} style={{
          background: pal.codeBg,
          borderRadius: 4,
          padding: '1px 5px',
          fontSize: '0.9em',
          fontFamily: pal.codeFont,
          color: pal.inlineCode,
          wordBreak: 'break-all',
        }}>{p.slice(1, -1)}</code>
      );
    }

    // Bold
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      return <strong key={key}>{p.slice(2, -2)}</strong>;
    }

    // Italic (*text* or _text_)
    if ((p.startsWith('*') && p.endsWith('*') && p.length > 2 && !p.startsWith('**')) ||
        (p.startsWith('_') && p.endsWith('_') && p.length > 2)) {
      return <em key={key}>{p.slice(1, -1)}</em>;
    }

    // Link [text](url)
    const linkMatch = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a key={key} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
          style={{ color: pal.inlineCode, textDecoration: 'underline' }}>
          {linkMatch[1]}
        </a>
      );
    }

    return p;
  });
}

// ── Block parser ──────────────────────────────────────────────────────────────

function parseBlocks(text, pal) {
  const lines = text.split('\n');
  const nodes = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ─────────────────────────────────────────────────────
    if (line.trimStart().startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre key={`code-${i}`} style={{
          background: pal.codeBg,
          borderRadius: 7,
          padding: '8px 11px',
          margin: '6px 0',
          color: pal.codeText,
          whiteSpace: 'pre',
          wordBreak: 'normal',
          overflowX: 'auto',
          fontSize: '0.88em',
          fontFamily: pal.codeFont,
          lineHeight: 1.55,
          maxWidth: '100%',
        }}>
          {codeLines.join('\n')}
        </pre>
      );
      i++; // skip closing ```
      continue;
    }

    // ── Heading (# ## ###) ────────────────────────────────────────────────────
    const hm = line.match(/^(#{1,3}) +(.+)/);
    if (hm) {
      const lvl = hm[1].length;
      nodes.push(
        <div key={`h-${i}`} style={{
          fontWeight: 700,
          fontSize: lvl === 1 ? '1.05em' : '0.97em',
          marginTop: nodes.length > 0 ? 10 : 2,
          marginBottom: 3,
          lineHeight: 1.35,
          color: pal.heading,
          borderBottom: lvl === 1 ? `1px solid ${pal.borderH1}` : 'none',
          paddingBottom: lvl === 1 ? 4 : 0,
        }}>
          {renderInline(hm[2], pal, `h-${i}`)}
        </div>
      );
      i++; continue;
    }

    // ── Unordered list (- or *) ───────────────────────────────────────────────
    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} style={{
          paddingLeft: 17, margin: '4px 0', listStyleType: 'disc',
        }}>
          {items.map((item, j) => (
            <li key={j} style={{ marginBottom: 3, paddingLeft: 1, lineHeight: 1.55 }}>
              {renderInline(item, pal, `ul-${i}-${j}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ── Ordered list (1. 2. …) ────────────────────────────────────────────────
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} style={{
          paddingLeft: 18, margin: '4px 0',
        }}>
          {items.map((item, j) => (
            <li key={j} style={{ marginBottom: 3, lineHeight: 1.55 }}>
              {renderInline(item, pal, `ol-${i}-${j}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // ── Empty line (paragraph gap) ────────────────────────────────────────────
    if (!line.trim()) {
      if (nodes.length > 0) {
        nodes.push(<div key={`sp-${i}`} style={{ height: 6 }} />);
      }
      i++; continue;
    }

    // ── Regular paragraph line ────────────────────────────────────────────────
    nodes.push(
      <div key={`p-${i}`} style={{ lineHeight: 1.6 }}>
        {renderInline(line, pal, `p-${i}`)}
      </div>
    );
    i++;
  }

  return nodes;
}
