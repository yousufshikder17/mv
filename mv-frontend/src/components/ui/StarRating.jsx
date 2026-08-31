import styles from './StarRating.module.css'

/**
 * StarRating - 1..max in half steps.
 *
 * Halves exist because the rating column is numeric(3,1): storing decimals the
 * interface cannot produce would make the precision decorative. Each star has
 * two hit zones, left for the half and right for the whole, which is how every
 * other tracker does it and therefore what people expect.
 *
 * Props:
 *   value    - current rating, or null for unrated
 *   max      - scale max (default 10)
 *   onChange - (rating: number) => void; omit for read-only
 *   size     - 'sm' | 'md' | 'lg'
 */
export default function StarRating({ value, max = 10, onChange, size = 'md' }) {
  const stars = Array.from({ length: max }, (_, i) => i + 1)
  const readOnly = !onChange

  const pick = (star, event) => {
    if (readOnly) return
    const { left, width } = event.currentTarget.getBoundingClientRect()
    const half = event.clientX - left < width / 2
    const next = half ? star - 0.5 : star
    // Clicking the current value again clears it. NULL means unrated, and
    // without this there is no way back to it once a star is pressed.
    onChange(next === value ? null : next)
  }

  return (
    <div
      className={`${styles.stars} ${styles[size]} ${readOnly ? styles.readonly : ''}`}
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={`Rating: ${value ?? 'not rated'} out of ${max}`}
    >
      {stars.map((star) => {
        // How much of this star is filled: all, half, or none.
        const pct = value == null ? 0 : Math.max(0, Math.min(1, value - star + 1)) * 100
        return (
          <button
            key={star}
            type="button"
            className={styles.star}
            onClick={(e) => pick(star, e)}
            tabIndex={readOnly ? -1 : 0}
            aria-label={`Rate ${star} out of ${max}`}
            disabled={readOnly}
            id={`star-${star}`}
          >
            <span className={styles.empty} aria-hidden="true">★</span>
            <span className={styles.fill} style={{ width: `${pct}%` }} aria-hidden="true">★</span>
          </button>
        )
      })}
      {value != null && (
        <span className={styles.label}>{value}/{max}</span>
      )}
    </div>
  )
}
