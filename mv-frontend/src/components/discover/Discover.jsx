import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getTrending, getVariety } from '../../services/watchlistService.js'
import ResultGrid from './ResultGrid.jsx'
import styles from './Discover.module.css'

// Matches ROW_SIZE on the server, which caps the variety row at the same
// number. Two rows of unequal length read as a bug rather than a choice.
const ROW_SIZE = 15

/**
 * Public discovery, no account (M3).
 *
 * Search used to live here; it moved to the topbar, where it is reachable
 * from every page instead of only this one. What is left answers "what is
 * worth looking at" rather than "where is the thing I already have in mind".
 *
 * Two rows, and the difference between them is deliberate:
 *
 *   Variety  — everything we hold, across all five media types. Our own
 *              catalogue, because TMDB is the only source with a trending
 *              feed and a provider-built mix would be films again in a hat.
 *              This is where a recommender goes once there are users to learn
 *              from; until then it is honest breadth, not fake personalisation.
 *   Trending — TMDB's weekly chart, which is films and says so.
 *
 * Cards link to the item page rather than adding anything — the login prompt
 * belongs at the moment of saving, not on arrival.
 */
export default function Discover() {
  const [trending, setTrending] = useState([])
  const [variety, setVariety] = useState([])

  useEffect(() => {
    // Silent failures: a discovery strip that did not load is not worth a
    // toast, and each row stands on its own if the other is empty.
    getTrending().then((res) => setTrending((res.data?.data ?? []).slice(0, ROW_SIZE))).catch(() => {})
    getVariety().then((res) => setVariety(res.data?.data ?? [])).catch(() => {})
  }, [])

  if (!trending.length && !variety.length) return null

  return (
    <section className={styles.wrap} id="discover">
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Browse</p>
        <h2 className={styles.heading}>Everything, in one place.</h2>
        <p className={styles.sub}>
          No account needed to look around.{' '}
          <Link to="/search" className={styles.link}>Search everything →</Link>
        </p>

        {variety.length > 0 && (
          <div className={styles.row}>
            <h3 className={styles.rowTitle}>
              Across the vault
              <span className={styles.rowNote}>films, TV, games, books and music</span>
            </h3>
            <ResultGrid items={variety} />
          </div>
        )}

        {trending.length > 0 && (
          <div className={styles.row}>
            {/* Named for what it actually is. TMDB's endpoint is
                /trending/movie/week — calling it "trending" unqualified would
                imply the other four types were in the running. */}
            <h3 className={styles.rowTitle}>
              Trending films
              <span className={styles.rowNote}>this week, from TMDB</span>
            </h3>
            <ResultGrid items={trending} />
          </div>
        )}
      </div>
    </section>
  )
}
