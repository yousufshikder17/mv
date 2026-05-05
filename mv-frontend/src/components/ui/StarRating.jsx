import styles from './StarRating.module.css'

/**
 * StarRating
 * Props:
 *   value  — current rating 1–10 (or null)
 *   max    — scale max (default 10)
 *   onChange — (rating: number) => void  (omit for read-only)
 *   size   — 'sm' | 'md' | 'lg'
 */
export default function StarRating({ value, max = 10, onChange, size = 'md' }) {
  const stars = Array.from({ length: max }, (_, i) => i + 1)
  const readOnly = !onChange

  return (
    <div
      className={`${styles.stars} ${styles[size]} ${readOnly ? styles.readonly : ''}`}
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={`Rating: ${value ?? 'not rated'} out of ${max}`}
    >
      {stars.map((star) => (
        <button
          key={star}
          type="button"
          className={`${styles.star} ${value != null && star <= value ? styles.filled : ''}`}
          onClick={() => !readOnly && onChange(star)}
          tabIndex={readOnly ? -1 : 0}
          aria-label={`Rate ${star} out of ${max}`}
          disabled={readOnly}
          id={`star-${star}`}
        >
          ★
        </button>
      ))}
      {value != null && (
        <span className={styles.label}>{value}/{max}</span>
      )}
    </div>
  )
}
