// Poster — original placeholder artwork generated from film palettes.
// Never reproduces real movie posters; uses geometric "shape" archetypes
// keyed off the film's data so each poster looks distinct and authored.

function Poster({ film, shape = 'rect', size = 'md' }) {
  const [bg, fg] = film.palette;
  const ar = shape === 'square' ? '1 / 1' : shape === 'wide' ? '16 / 9' : '2 / 3';
  const radius = shape === 'rounded' ? 14 : shape === 'circle-mask' ? 999 : 4;

  // Each "archetype" lays out abstract shapes referencing the film's vibe.
  // Pure CSS/SVG, never imagery of real films.
  const renderArt = () => {
    const t = film.shape;
    if (t === 'mono') {
      return (
        <svg viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice"
             style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <rect width="200" height="300" fill={bg} />
          <circle cx="100" cy="135" r="62" fill="none" stroke={fg} strokeWidth="1.2" opacity=".55" />
          <circle cx="100" cy="135" r="38" fill="none" stroke={fg} strokeWidth="1.2" opacity=".75" />
          <circle cx="100" cy="135" r="14" fill={fg} opacity=".9" />
          <line x1="20" y1="240" x2="180" y2="240" stroke={fg} strokeWidth=".6" opacity=".4" />
        </svg>
      );
    }
    if (t === 'split') {
      return (
        <svg viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice"
             style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <rect width="200" height="300" fill={bg} />
          <polygon points="0,0 200,0 0,300" fill={fg} opacity=".18" />
          <polygon points="200,0 200,300 0,300" fill={fg} opacity=".06" />
          <line x1="0" y1="0" x2="200" y2="300" stroke={fg} strokeWidth="1" opacity=".7" />
          <circle cx="60" cy="80" r="3" fill={fg} />
          <circle cx="140" cy="220" r="3" fill={fg} />
        </svg>
      );
    }
    if (t === 'circle') {
      return (
        <svg viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice"
             style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <rect width="200" height="300" fill={bg} />
          <circle cx="100" cy="160" r="78" fill={fg} opacity=".88" />
          <circle cx="100" cy="160" r="78" fill={bg} opacity=".0" />
          <path d="M22 160 Q 100 110 178 160" fill="none" stroke={bg} strokeWidth="1.5" opacity=".35" />
        </svg>
      );
    }
    if (t === 'stripe') {
      return (
        <svg viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice"
             style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <rect width="200" height="300" fill={bg} />
          {[...Array(7)].map((_, i) => (
            <rect key={i} x="0" y={30 + i * 36} width="200" height="14" fill={fg}
                  opacity={0.15 + (i % 3) * 0.18} />
          ))}
          <rect x="60" y="120" width="80" height="60" fill={bg} stroke={fg} strokeWidth="1" />
        </svg>
      );
    }
    if (t === 'block') {
      return (
        <svg viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice"
             style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <rect width="200" height="300" fill={bg} />
          <rect x="20" y="40" width="74" height="74" fill={fg} opacity=".85" />
          <rect x="106" y="40" width="74" height="74" fill={fg} opacity=".35" />
          <rect x="20" y="126" width="160" height="40" fill={fg} opacity=".5" />
          <rect x="20" y="178" width="74" height="86" fill={fg} opacity=".25" />
          <rect x="106" y="178" width="74" height="86" fill={fg} opacity=".7" />
        </svg>
      );
    }
    return <div style={{ position: 'absolute', inset: 0, background: bg }} />;
  };

  // Title block overlaid on poster art
  const titleSize = size === 'sm' ? 11 : size === 'lg' ? 22 : 14;

  return (
    <div className="poster" style={{
      position: 'relative', aspectRatio: ar, borderRadius: radius,
      overflow: 'hidden', background: bg, color: fg,
      boxShadow: '0 1px 0 rgba(255,255,255,.04) inset, 0 8px 24px -8px rgba(0,0,0,.5), 0 0 0 .5px rgba(0,0,0,.4)',
    }}>
      {renderArt()}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: size === 'sm' ? '8px 10px' : size === 'lg' ? '18px 20px 16px' : '12px 14px 10px',
        background: `linear-gradient(to top, ${bg}f0 0%, ${bg}b0 60%, transparent 100%)`,
      }}>
        <div style={{
          fontFamily: 'var(--ff-display)', fontSize: titleSize, lineHeight: 1.05,
          fontWeight: 500, letterSpacing: '-0.01em', color: fg, textWrap: 'balance',
        }}>{film.title}</div>
        <div style={{
          fontFamily: 'var(--ff-mono)', fontSize: size === 'sm' ? 8.5 : 9.5,
          opacity: .6, marginTop: 4, letterSpacing: '.06em', textTransform: 'uppercase',
        }}>{film.year} · {film.director}</div>
      </div>
    </div>
  );
}

window.Poster = Poster;
