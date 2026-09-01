import TmdbCredit from '../layout/TmdbCredit.jsx'
import RawgCredit from '../layout/RawgCredit.jsx'
import styles from '../layout/TmdbCredit.module.css'

/**
 * Whichever source supplied this page.
 *
 * Attribution obligations differ by provider and are not interchangeable:
 * TMDB requires the logo and a non-endorsement notice, RAWG requires an active
 * hyperlink on every page using their data, MusicBrainz and ListenBrainz are
 * CC0 and ask rather than require. Getting the wrong one on a page is the same
 * as having none.
 *
 * A page with no single source — home, which mixes all five — credits TMDB,
 * whose terms are the strictest of the ones that apply to a poster wall. RAWG
 * is handled separately by ResultGrid, which renders their link whenever a
 * game is actually on screen.
 */
export default function SourceCredit({ type }) {
  if (type === 'game') return <RawgCredit />
  if (type === 'film' || type === 'tv' || type === null) return <TmdbCredit />

  if (type === 'book') {
    return (
      <div className={styles.credit} id="openlibrary-credit">
        <a
          href="https://openlibrary.org"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
          aria-label="Open Library"
        >
          <span className={styles.wordmark}>Open Library</span>
        </a>
        <p className={styles.notice}>
          Book data from Open Library, an Internet Archive project. Prices from
          Google Books.
        </p>
      </div>
    )
  }

  if (type === 'album') {
    return (
      <div className={styles.credit} id="musicbrainz-credit">
        <a
          href="https://musicbrainz.org"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
          aria-label="MusicBrainz"
        >
          <span className={styles.wordmark}>MusicBrainz</span>
        </a>
        <p className={styles.notice}>
          Music data from MusicBrainz and ListenBrainz, released under CC0.
        </p>
      </div>
    )
  }

  return null
}
