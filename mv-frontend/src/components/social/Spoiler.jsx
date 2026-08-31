import { useState } from 'react'
import styles from './Spoiler.module.css'

/**
 * Blur until clicked (SPEC 9).
 *
 * The text is already in the DOM — the backend deliberately returns
 * spoiler-flagged bodies so they stay editable. This is a display decision,
 * not a security boundary, and it is not pretending otherwise.
 *
 * A button rather than a div: revealing is an action, and someone reading
 * with a keyboard or a screen reader has to be able to take it.
 */
export default function Spoiler({ children }) {
  const [shown, setShown] = useState(false)

  if (shown) return children

  return (
    <button
      type="button"
      className={styles.veil}
      onClick={() => setShown(true)}
      aria-label="Reveal spoiler"
    >
      <span className={styles.hidden} aria-hidden="true">{children}</span>
      <span className={styles.label}>Spoiler — click to reveal</span>
    </button>
  )
}
