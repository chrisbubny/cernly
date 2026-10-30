'use client';
import { useState } from 'react';

// How many items to show before the expand link
const INITIAL_SHOW = 3;

// Detect item display type from the check/audit ID so we can show appropriate
// contextual guidance (e.g., meaningful vs. decorative image note).
function detectItemType(checkId, auditId) {
  const id = (checkId || auditId || '').toLowerCase();
  if (
    id === 'images_missing_alt' ||
    id === 'image-alt' ||
    id === 'image-size-responsive' ||
    id.includes('image') && id.includes('alt')
  ) return 'image';
  if (
    id.includes('render-blocking') ||
    id.includes('unused-javascript') ||
    id.includes('unused-css') ||
    id.includes('resource')
  ) return 'resource';
  return 'element';
}

// Show only the meaningful tail of a URL to keep rows readable.
function shortUrl(url) {
  if (!url) return '';
  try {
    const parts = new URL(url, 'https://x').pathname.split('/').filter(Boolean);
    return parts.slice(-2).join('/') || url;
  } catch {
    return url.split('/').slice(-2).join('/') || url;
  }
}

// ─── Public component ────────────────────────────────────────────────────────
// Props:
//   items          — array of { url?, label?, selector?, snippet?, wastedMs? }
//   totalDetected  — total count from the scanner (may be > items.length)
//   checkId        — a11y analyzer check id (e.g. "images_missing_alt")
//   auditId        — Lighthouse audit id (e.g. "image-alt")
//   onFixElement   — optional (item) => void; shows "Ask about this" per item
export default function AffectedElements({ items, totalDetected, checkId, auditId, onFixElement }) {
  const [expanded, setExpanded] = useState(false);
  if (!items?.length) return null;

  const itemType = detectItemType(checkId, auditId);
  const isImage    = itemType === 'image';
  const isResource = itemType === 'resource';

  const typeSingular = isImage ? 'image' : isResource ? 'resource' : 'element';
  const typePlural   = isImage ? 'images' : isResource ? 'resources' : 'elements';

  const capturedCount = items.length;
  const detectedCount = totalDetected ?? capturedCount;
  const shown = expanded ? items : items.slice(0, INITIAL_SHOW);
  const hiddenCount = capturedCount - INITIAL_SHOW;

  return (
    <div style={{ marginBottom: 10 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 7 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#83899c', letterSpacing: '.07em' }}>
          AFFECTED {typePlural.toUpperCase()}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#7948f6',
          background: '#f7f4ff', borderRadius: 6, padding: '2px 8px' }}>
          {detectedCount} {detectedCount === 1 ? typeSingular : typePlural}
        </span>
      </div>

      {/* Item rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shown.map((item, i) => (
          <ItemRow
            key={i}
            item={item}
            itemType={itemType}
            onFix={onFixElement ? () => onFixElement(item) : null}
          />
        ))}
      </div>

      {/* Expand / collapse */}
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ marginTop: 6, background: 'none', border: 'none', padding: 0,
            fontSize: 11, color: '#7948f6', fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit' }}
        >
          {expanded
            ? 'Show fewer'
            : `Show ${hiddenCount} more ${hiddenCount === 1 ? typeSingular : typePlural}`}
        </button>
      )}

      {/* Truncation notice — scanner capped the list */}
      {detectedCount > capturedCount && (
        <p style={{ fontSize: 11, color: '#83899c', margin: '5px 0 0', lineHeight: 1.5 }}>
          Showing {capturedCount} of {detectedCount} detected. Run a re-scan to capture the full list.
        </p>
      )}

      {/* Contextual guidance for images */}
      {isImage && (
        <div style={{ marginTop: 9, background: '#fffbf0',
          border: '1px solid #fde68a', borderRadius: 8, padding: '9px 12px' }}>
          <p style={{ fontSize: 11, color: '#92400e', margin: 0, lineHeight: 1.6 }}>
            <strong>Meaningful images</strong> need alt text that describes what the image
            communicates in context (not just the filename).{' '}
            <strong>Purely decorative images</strong> — spacers, borders, backgrounds — should use{' '}
            <code style={{ fontFamily: 'monospace', background: '#fef3c7',
              padding: '0 3px', borderRadius: 3, fontSize: 10 }}>{'alt=""'}</code>{' '}
            so screen readers skip them entirely.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Single item row ─────────────────────────────────────────────────────────
function ItemRow({ item, itemType, onFix }) {
  const [snippetOpen, setSnippetOpen] = useState(false);

  const rawFilename = item.url
    ? item.url.split('/').pop().split('?')[0] || item.url
    : null;
  const label = item.label || rawFilename || item.selector || 'Unknown element';
  const hasUrl = item.url && !item.url.startsWith('data:');
  // Show URL path when the label is already the filename (avoid repeating it)
  const showUrlLine = hasUrl && label !== rawFilename;
  const hasSelector = !!item.selector;
  const hasSnippet  = !!item.snippet;
  const wastedMs    = item.wastedMs ?? null;

  return (
    <div style={{ background: '#f8f9fd', borderRadius: 9,
      padding: '9px 11px', border: '1px solid #e9eaf2' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Primary label */}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#151621',
            wordBreak: 'break-word', lineHeight: 1.4 }}>
            {label}
          </div>

          {/* URL path (when label is not already the filename) */}
          {showUrlLine && (
            <div style={{ fontSize: 11, color: '#83899c', marginTop: 2,
              wordBreak: 'break-all', lineHeight: 1.35 }}>
              {shortUrl(item.url)}
            </div>
          )}

          {/* CSS selector */}
          {hasSelector && (
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#6366f1',
              marginTop: 3, wordBreak: 'break-all', lineHeight: 1.4 }}>
              {item.selector}
            </div>
          )}

          {/* Wasted time (resource items) */}
          {wastedMs != null && (
            <div style={{ fontSize: 11, color: '#ef6473', fontWeight: 700, marginTop: 2 }}>
              {wastedMs >= 1000 ? `${(wastedMs / 1000).toFixed(1)}s` : `${wastedMs}ms`} wasted
            </div>
          )}

          {/* HTML snippet toggle */}
          {hasSnippet && (
            <button
              onClick={() => setSnippetOpen(s => !s)}
              style={{ marginTop: 5, background: 'none', border: 'none', padding: 0,
                fontSize: 10, color: '#7948f6', fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit' }}
            >
              {snippetOpen ? 'Hide HTML ↑' : 'Show HTML ↓'}
            </button>
          )}

          {snippetOpen && item.snippet && (
            <pre style={{ margin: '5px 0 0', padding: '7px 9px',
              background: '#1e1e2e', color: '#cdd6f4',
              borderRadius: 6, fontSize: 10, overflowX: 'auto',
              lineHeight: 1.55, maxWidth: '100%', whiteSpace: 'pre-wrap',
              wordBreak: 'break-all' }}>
              {item.snippet}
            </pre>
          )}
        </div>

        {/* Per-element Ask button */}
        {onFix && (
          <button
            onClick={onFix}
            style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#7948f6',
              background: '#f7f4ff', border: '1px solid #e8e2ff',
              borderRadius: 7, padding: '4px 8px', cursor: 'pointer',
              fontFamily: 'inherit', whiteSpace: 'nowrap', marginTop: 1 }}
          >
            Ask about this
          </button>
        )}
      </div>
    </div>
  );
}
