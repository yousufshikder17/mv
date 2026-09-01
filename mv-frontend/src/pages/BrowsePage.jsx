import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { getBrowse } from '../services/watchlistService.js'
import Hero from '../components/marketing/Hero.jsx'
import Pitch from '../components/marketing/Pitch.jsx'
import ResultGrid from '../components/discover/ResultGrid.jsx'
import { BROWSE_SOURCE, BROWSE_COPY } from '../lib/media.js'
import styles from './BrowsePage.module.css'

// Nine covers, three columns.
const ART = 9

/**
 * One media type's page, public (M3).
 *
 * The same page home is, narrowed to one kind of thing: hero, a row of what
 * is popular, then the pitch. One component serves all five — the feed, the
 * copy and the credit differ, the structure does not. Five near-identical
 * page files would be five heroes to keep in sync and five places to forget
 * an attribution.
 *
 * The art wall is built from the feed's own covers, so it costs no extra
 * request, is never stale, and cannot show a film on the books page.
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
  // Three ways a wall gets filled, in order of how much say we have:
  //   art      - fully curated, the whole wall (Films)
  //   artLead  - a few pinned, the live feed behind them (Music)
  //   neither  - the feed's own covers
  // A hero is a statement of taste; a feed is whatever came out this month.
  const feedArt = items.filter((i) => i.posterUrl).map((i) => i.posterUrl)
  const art = copy.art ?? [...(copy.artLead ?? []), ...feedArt].slice(0, ART)

  return (
    <main className={styles.page}>
      <Hero
        eyebrow={label}
        headline={
          <>
            {copy.headline[0]}<br />
            <em>{copy.headline[1]}</em> {copy.headline[2]}<br />
            <em>{copy.headline[3]}</em>
          </>
        }
        sub={copy.sub}
        art={art}
        actions={
          <>
            {isAuthenticated ? (
              <Link to="/watchlist" className="btn-accent">Open your vault →</Link>
            ) : (
              <Link to="/register" className="btn-accent">Start for free →</Link>
            )}
            <Link to={`/search?type=${type}`} className="btn-ghost">Search {label.toLowerCase()}</Link>
          </>
        }
      />

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
            <Link to={`/search?type=${type}`} className={styles.link}>
              Search {label.toLowerCase()} instead →
            </Link>
          </p>
        )}

        <ResultGrid items={items} />
      </section>

      <Pitch
        type={type}
        label={label}
        features={copy.features}
        cta={copy.cta}
        footerNote={`${label} on mv — tracked, rated, and watched for a price drop.`}
      />
    </main>
  )
}
