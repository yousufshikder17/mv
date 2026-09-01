import { useSearchParams } from 'react-router-dom'
import { useMediaSearch } from '../hooks/useMediaSearch.js'
import ResultGrid from '../components/discover/ResultGrid.jsx'
import { TYPE_TABS } from '../lib/media.js'
import styles from './SearchPage.module.css'

/**
 * Full search results, public (M3).
 *
 * The query lives in the URL rather than in state so a search can be shared,
 * bookmarked and reached by the back button — which is most of the reason to
 * have a page rather than only the topbar dropdown.
 */
export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const type = params.get('type') ?? ''

  const { results, loading, failed } = useMediaSearch(query, type)

  const setType = (next) => {
    const p = new URLSearchParams(params)
    if (next) p.set('type', next); else p.delete('type')
    setParams(p, { replace: true })
  }

  const label = TYPE_TABS.find(([v]) => v === type)?.[1] ?? 'All'

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Search</p>
        <h1 className={styles.h1}>
          {query ? <>Results for <em>{query}</em></> : `Browse ${label.toLowerCase()}`}
        </h1>
      </header>

      <div className={styles.tabs}>
        {TYPE_TABS.map(([value, text]) => (
          <button
            key={text}
            type="button"
            className={`${styles.tab} ${type === value ? styles.tabOn : ''}`}
            onClick={() => setType(value)}
            id={`search-type-${text.toLowerCase()}`}
          >
            {text}
          </button>
        ))}
      </div>

      {!query && (
        // Honest: there is no browse feed behind most of these types yet, so
        // the page says what it needs rather than pretending to be a catalogue.
        <p className={styles.note}>Type in the search box above to find something.</p>
      )}

      {query && (
        <p className={styles.count}>
          {loading ? 'Searching…' : `${results.length} result${results.length === 1 ? '' : 's'}`}
        </p>
      )}

      {query && !loading && failed && (
        <p className={styles.note}>
          Search is unavailable right now. If you have been searching a lot,
          give it a minute and try again.
        </p>
      )}

      {query && !loading && !failed && results.length === 0 && (
        <p className={styles.note}>Nothing matching that{type ? ` in ${label.toLowerCase()}` : ''}.</p>
      )}

      <ResultGrid items={results} />
    </main>
  )
}
