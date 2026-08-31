import styles from './TmdbCredit.module.css'

/**
 * RAWG attribution.
 *
 * Their terms are stricter than TMDB's footer-level requirement: RAWG must be
 * credited as the source "and add an active hyperlink from EVERY page where
 * the data of RAWG is used" - public or signed-in, no exceptions. So this
 * renders wherever a game appears, not just in a footer.
 *
 * Reuses TmdbCredit's stylesheet: both are the same thing in the same place,
 * and a second near-identical file would only drift.
 */
export default function RawgCredit({ className = '' }) {
  return (
    <div className={`${styles.credit} ${className}`} id="rawg-credit">
      <a
        href="https://rawg.io/"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
        aria-label="RAWG"
      >
        <span className={styles.wordmark}>RAWG</span>
      </a>
      <p className={styles.notice}>
        Game data and images provided by RAWG.
      </p>
    </div>
  )
}
