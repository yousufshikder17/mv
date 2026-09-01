import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { getBrowse } from '../services/watchlistService.js'
import ResultGrid from '../components/discover/ResultGrid.jsx'
import TmdbCredit from '../components/layout/TmdbCredit.jsx'
import { BROWSE_SOURCE, BROWSE_COPY } from '../lib/media.js'
import styles from './BrowsePage.module.css'

// Nine covers, three columns. Enough to read as a wall rather than a row.
const ART = 9

/**
 * One media type's page, public (M3).
 *
 * One component for all five: the feed, the copy and the credit differ, the
 * structure does not. Five near-identical page files would be five places to
 * forget an attribution and five heroes to keep in sync.
 *
 * The art wall is built from the feed's own covers rather than a hardcoded
 * list. It costs no extra request, it is never stale, and it cannot show a
 * film on the books page.
 */
export default function BrowsePage({ type, label }) {
  const { isAuthenticated } = useAuth()

  // Stored with the type it belongs to, so switching pages shows nothing
  // rather than the previous type's row while the next one loads. Deriving it
  // this way also means no state has to be reset on the way in.
  const [loaded, setLoaded] = useState({ type: null, items: [] })

  useEffect(() => {
    let alive = true

    getBrowse(type)
      .then((res) => { if (alive) setLoaded({ type, items: res.data?.data ?? [] }) })
      .catch(() => { if (alive) setLoaded({ type, items: [] }) })

    return () => { alive = false }
  }, [type])

  const ready = loaded.type === type
  const items = ready ? loaded.items : []
  const loading = !ready

  useEffect(() => {
    document.title = `${label} — mv`
    return () => { document.title = 'mv — Personal media ledger' }
  }, [label])

  const copy = BROWSE_COPY[type]
  const art = items.filter((i) => i.posterUrl).slice(0, ART)

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />

        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>{label}</p>
          <h1 className={styles.headline}>
            {copy.headline[0]}<br />
            <em>{copy.headline[1]}</em> {copy.headline[2]}<br />
            <em>{copy.headline[3]}</em>
          </h1>
          <p className={styles.sub}>{copy.sub}</p>

          <div className={styles.cta}>
            {isAuthenticated ? (
              <Link to="/watchlist" className="btn-accent">Open your vault →</Link>
            ) : (
              <Link to="/register" className="btn-accent">Start for free →</Link>
            )}
            <Link to="/search" className="btn-ghost">Search {label.toLowerCase()}</Link>
          </div>
        </div>

        {/* Decorative. The grid itself below is the accessible copy of this. */}
        <div className={styles.heroArt} aria-hidden="true">
          {art.map((item, i) => (
            <div key={item.externalId} className={styles.artCell} style={{ animationDelay: `${i * 0.12}s` }}>
              <img src={item.posterUrl} alt="" loading={i < 6 ? 'eager' : 'lazy'} decoding="async" draggable="false" />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.rowSection}>
        <h2 className={styles.rowTitle}>
          Popular right now
          {/* Names its source. A borrowed chart shown without one reads as
              our own ranking, which it is not. */}
          <span className={styles.rowNote}>{BROWSE_SOURCE[type]}</span>
        </h2>

        {loading && <p className={styles.note}>Loading…</p>}

        {!loading && items.length === 0 && (
          <p className={styles.note}>
            This feed is unavailable right now.{' '}
            <Link to="/search" className={styles.link}>Search {label.toLowerCase()} instead →</Link>
          </p>
        )}

        <ResultGrid items={items} />

        {/* TMDB requires attribution wherever their data is rendered. RAWG's
            equivalent link is carried by ResultGrid itself. */}
        {(type === 'film' || type === 'tv') && items.length > 0 && (
          <footer className={styles.credit}><TmdbCredit /></footer>
        )}
      </section>
    </main>
  )
}
