import styles from './TmdbCredit.module.css'

/**
 * IsThereAnyDeal attribution.
 *
 * Every price on the deals page is theirs, as is the box art on live search
 * results, and the historical lows the quality score is computed against.
 * Their terms ask for caching and reasonable use rather than a specific badge,
 * but crediting the source of the data a page is built from is the same rule
 * applied to TMDB and RAWG.
 *
 * Shares TmdbCredit's stylesheet - three near-identical files would only
 * drift apart.
 */
export default function ItadCredit({ className = '' }) {
  return (
    <div className={`${styles.credit} ${className}`} id="itad-credit">
      <a
        href="https://isthereanydeal.com"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
        aria-label="IsThereAnyDeal"
      >
        <span className={styles.wordmark}>IsThereAnyDeal</span>
      </a>
      <p className={styles.notice}>
        Prices, store links and historical lows provided by IsThereAnyDeal.
      </p>
    </div>
  )
}
