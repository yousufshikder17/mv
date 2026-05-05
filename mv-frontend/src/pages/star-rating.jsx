// Star rating — half-star precision, hover preview, click to set, click same to clear.
function StarRating({ value = 0, onChange, size = 14, readOnly = false, showEmpty = true }) {
  const [hover, setHover] = React.useState(0);
  const display = hover || value;

  const onMove = (e, i) => {
    if (readOnly) return;
    const r = e.currentTarget.getBoundingClientRect();
    const half = (e.clientX - r.left) < r.width / 2;
    setHover(i + (half ? 0.5 : 1));
  };
  const onClick = (e, i) => {
    if (readOnly || !onChange) return;
    const r = e.currentTarget.getBoundingClientRect();
    const half = (e.clientX - r.left) < r.width / 2;
    const next = i + (half ? 0.5 : 1);
    onChange(value === next ? 0 : next);
  };

  if (!showEmpty && !value && !hover) return null;

  return (
    <div onMouseLeave={() => setHover(0)}
         style={{ display: 'inline-flex', gap: 1, lineHeight: 0,
                  cursor: readOnly ? 'default' : 'pointer' }}>
      {[0,1,2,3,4].map(i => {
        const fill = Math.max(0, Math.min(1, display - i));
        return (
          <span key={i}
                onMouseMove={(e) => onMove(e, i)}
                onClick={(e) => onClick(e, i)}
                style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}>
            <Star size={size} fill={0} />
            {fill > 0 && (
              <span style={{ position: 'absolute', inset: 0, width: `${fill * 100}%`, overflow: 'hidden' }}>
                <Star size={size} fill={1} />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function Star({ size = 14, fill = 0 }) {
  // Hand-tuned 5-point star path
  const d = 'M10 1.5 L12.4 7.4 L18.7 8 L13.9 12.2 L15.4 18.4 L10 15.1 L4.6 18.4 L6.1 12.2 L1.3 8 L7.6 7.4 Z';
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} style={{ display: 'block' }}>
      <path d={d}
            fill={fill ? 'var(--c-accent)' : 'transparent'}
            stroke={fill ? 'var(--c-accent)' : 'currentColor'}
            strokeWidth="1.4" strokeLinejoin="round" opacity={fill ? 1 : .35} />
    </svg>
  );
}

window.StarRating = StarRating;
