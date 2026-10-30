const STATUS = {
  draft: { glyph: '…', label: 'Draft' },
  pending_demo: { glyph: '…', label: 'Demo: awaiting confirmation' },
  completed_demo: { glyph: '✓', label: 'Demo: completed' },
  demo_pending: { glyph: '…', label: 'Demo: pending' },
  demo_active: { glyph: '✓', label: 'Demo: active' },
  failed: { glyph: '!', label: 'Failed' },
  cancelled: { glyph: '✕', label: 'Cancelled' },
};

// Status is always text plus a symbol, never colour alone.
export default function StatusBadge({ status }) {
  const s = STATUS[status] ?? { glyph: '?', label: status };
  return (
    <span className={`badge ${status}`}>
      <span aria-hidden="true" className="glyph">{s.glyph}</span>
      {s.label}
    </span>
  );
}
