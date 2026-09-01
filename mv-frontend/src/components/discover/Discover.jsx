import { Link } from 'react-router-dom'
import ResultGrid from './ResultGrid.jsx'
import styles from './Discover.module.css'

/**
 * The home discovery row, public (M3).
 *
 * One row, deliberately. Search moved to the topbar and trending films moved
 * to /films, which is where a film chart belongs — leaving this page to do
 * the one thing no type page can: show all five kinds of thing at once.
 *
 * Items are passed in rather than fetched here: the hero above uses the same
 * covers for its art wall, and fetching twice for one row would be two calls
 * where one does.
 *
 * Cards link to the item page rather than adding anything — the login prompt
 * belongs at the moment of saving, not on arrival.
 */
export default function Discover({ items }) {
  if (!items.length) return null

  return (
    <section className={styles.wrap} id="discover">
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Browse</p>
        <h2 className={styles.heading}>Everything, in one place.</h2>
        <p className={styles.sub}>
          Films, shows, games, books and music — no account needed to look around.{' '}
          <Link to="/search" className={styles.link}>Search everything →</Link>
        </p>

        <ResultGrid items={items} />
      </div>
    </section>
  )
}
