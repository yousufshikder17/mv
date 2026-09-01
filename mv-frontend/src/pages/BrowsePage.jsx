import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getBrowse } from '../services/watchlistService.js'
import ResultGrid from '../components/discover/ResultGrid.jsx'
import TmdbCredit from '../components/layout/TmdbCredit.jsx'
import { BROWSE_SOURCE } from '../lib/media.js'
import styles from './BrowsePage.module.css'

/**
 * One media type's browse page, public (M3).
 *
 * One component for all five: the only thing that differs is which feed fills
 * it and who to credit. Five near-identical page files would be five places
 * to forget an attribution.
 */
export default function BrowsePage({ type, label }) {
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

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Browse</p>
        <h1 className={styles.h1}>{label}</h1>
        {/* Says where the row came from. A browse page that does not name its
            source is asking to be mistaken for our own ranking. */}
        <p className={styles.source}>{BROWSE_SOURCE[type]}</p>
      </header>

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
    </main>
  )
}
