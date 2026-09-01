import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMediaSearch } from '../../hooks/useMediaSearch.js'
import { SearchIcon } from '../ui/Icon.jsx'
import Poster from '../ui/Poster.jsx'
import { TYPE_LABEL } from '../../lib/media.js'
import styles from './NavSearch.module.css'

// Enough to recognise what you were looking for, few enough to stay a
// dropdown rather than a page. The full set is one Enter away.
const PEEK = 6

/**
 * Global search in the topbar — every media type, no account (M3).
 *
 * A typeahead, not the whole search experience: it answers "is the thing I
 * mean in here?" and hands anything longer to /search, which has the type
 * filters and room to show them.
 */
export default function NavSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  const { results, loading, failed } = useMediaSearch(query)
  const shown = results.slice(0, PEEK)

  // Close when the click lands anywhere else. Pointerdown rather than click so
  // the dropdown is gone before a stray selection registers behind it.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const go = (r) => {
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
    navigate(`/media/${r.type}/${r.externalId}`)
  }

  const seeAll = () => {
    if (!query.trim()) return
    setOpen(false)
    navigate(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  // Arrow keys and Enter, because a search box you can only use with a mouse
  // is a search box half the people cannot use.
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, shown.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, -1)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (cursor >= 0 && shown[cursor]) go(shown[cursor])
      else seeAll()
    }
  }

  const showPanel = open && query.trim().length > 0

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.field} role="combobox" aria-expanded={showPanel} aria-haspopup="listbox" aria-owns="nav-search-results">
        <SearchIcon size={15} className={styles.icon} />
        <input
          ref={inputRef}
          id="nav-search"
          className={styles.input}
          type="search"
          placeholder="Search films, TV, games, books, music"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setCursor(-1) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          aria-controls="nav-search-results"
          aria-label="Search all media"
        />
      </div>

      {showPanel && (
        <div className={styles.panel} id="nav-search-results" role="listbox">
          {loading && shown.length === 0 && <p className={styles.note}>Searching…</p>}

          {!loading && failed && (
            <p className={styles.note}>
              Search is unavailable right now. If you have been searching a lot,
              give it a minute.
            </p>
          )}

          {!loading && !failed && shown.length === 0 && (
            <p className={styles.note}>Nothing matching that.</p>
          )}

          {shown.map((r, i) => (
            <button
              key={`${r.type}-${r.externalId}`}
              type="button"
              role="option"
              aria-selected={i === cursor}
              className={`${styles.row} ${i === cursor ? styles.rowOn : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => go(r)}
            >
              <span className={styles.thumb}><Poster url={r.posterUrl} title={r.title} /></span>
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{r.title}</span>
                <span className={styles.rowSub}>
                  <span className={styles.badge}>{TYPE_LABEL[r.type] ?? r.type}</span>
                  {r.releaseYear ? ` · ${r.releaseYear}` : ''}
                </span>
              </span>
            </button>
          ))}

          {results.length > 0 && (
            <button type="button" className={styles.seeAll} onClick={seeAll}>
              See all {results.length} results
            </button>
          )}
        </div>
      )}
    </div>
  )
}
