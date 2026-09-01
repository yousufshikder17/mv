import { Link } from 'react-router-dom'
import Poster from '../ui/Poster.jsx'
import RawgCredit from '../layout/RawgCredit.jsx'
import { TYPE_LABEL } from '../../lib/media.js'
import styles from './ResultGrid.module.css'

/**
 * The poster grid, shared by the trending strip and the search page.
 *
 * Extracted so the RAWG obligation is honoured in one place: their terms
 * require an active hyperlink on every page their data appears on, and a
 * second copy of this grid is a second place to forget it.
 */
export default function ResultGrid({ items }) {
  if (!items.length) return null

  return (
    <>
      <div className={styles.grid}>
        {items.map((r) => (
          <Link
            key={`${r.type}-${r.externalId}`}
            to={`/media/${r.type}/${r.externalId}`}
            className={styles.card}
            id={`result-${r.externalId}`}
          >
            <Poster url={r.posterUrl} title={r.title} />
            <p className={styles.cardTitle}>{r.title}</p>
            <p className={styles.cardSub}>
              <span className={styles.badge}>{TYPE_LABEL[r.type] ?? r.type}</span>
              {r.releaseYear ? ` · ${r.releaseYear}` : ''}
            </p>
          </Link>
        ))}
      </div>

      {items.some((r) => r.type === 'game') && <RawgCredit className={styles.credit} />}
    </>
  )
}
