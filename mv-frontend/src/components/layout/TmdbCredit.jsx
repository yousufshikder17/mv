import { useState } from 'react'
import styles from './TmdbCredit.module.css'

/**
 * TMDB attribution. Required by their API terms on the free (non-commercial)
 * licence: the logo, styled less prominently than our own branding, plus the
 * non-endorsement notice.
 *
 * Drop the official logo at mv-frontend/public/tmdb.svg — see the TMDB brand
 * assets page. Until it exists we fall back to a text credit so the notice is
 * never simply missing.
 */
export default function TmdbCredit({ className = '' }) {
  const [logoOk, setLogoOk] = useState(true)

  return (
    <div className={`${styles.credit} ${className}`} id="tmdb-credit">
      <a
        href="https://www.themoviedb.org"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
        aria-label="The Movie Database"
      >
        {logoOk ? (
          <img
            src="/tmdb.svg"
            alt="TMDB"
            className={styles.logo}
            onError={() => setLogoOk(false)}
          />
        ) : (
          <span className={styles.wordmark}>TMDB</span>
        )}
      </a>
      <p className={styles.notice}>
        This product uses TMDB and the TMDB APIs but is not endorsed, certified,
        or otherwise approved by TMDB.
      </p>
    </div>
  )
}
