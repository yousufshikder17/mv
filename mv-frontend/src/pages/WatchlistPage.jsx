import { useState, useEffect, useCallback } from 'react'
import { getWatchlist, updateWatchItem, removeFromWatch } from '../services/watchlistService.js'
import WatchlistCard from '../components/watchlist/WatchlistCard.jsx'
import WatchlistRow  from '../components/watchlist/WatchlistRow.jsx'
import MovieDrawer   from '../components/watchlist/MovieDrawer.jsx'
import AddMovieModal from '../components/watchlist/AddMovieModal.jsx'
import TmdbCredit    from '../components/layout/TmdbCredit.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { ClapperIcon, SearchIcon } from '../components/ui/Icon.jsx'
import { statusLabel, TYPE_LABEL } from '../lib/media.js'
import styles from './WatchlistPage.module.css'

const VIEWS   = ['grid', 'list']
const DENSITY = ['compact', 'default', 'comfy']

export default function WatchlistPage({ showToast }) {
  const { user } = useAuth()

  const [items,       setItems]       = useState([])  // watchlist rows
  const [loading,     setLoading]     = useState(true)
  const [view,        setView]        = useState('grid')
  const [density,     setDensity]     = useState('default')
  const [search,      setSearch]      = useState('')
  const [activeFilter, setActiveFilter] = useState('ALL')  // 'ALL' or a tracking status
  const [typeFilter,   setTypeFilter]   = useState('ALL')  // 'ALL' or a media type

  // Drawer
  const [drawerOpen,  setDrawerOpen]  = useState(false)
  const [drawerItem,  setDrawerItem]  = useState(null)
  const [drawerMovie, setDrawerMovie] = useState(null)

  // Add modal
  const [addOpen, setAddOpen] = useState(false)

  // ── Fetch watchlist from DB ──────────────────────────────────
  const fetchWatchlist = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getWatchlist()
      // res.data.data.watchlist — shape from watchListController.js
      setItems(res.data?.data?.watchlist ?? [])
    } catch {
      showToast('Could not load your watchlist.', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { fetchWatchlist() }, [fetchWatchlist])

  // ── Helpers to extract movie data from watchlist item ────────
  // The watchlist item currently only has movieId; the movie join
  // data would need a JOIN query on the backend. We store the movie
  // object on the item if your DB returns it joined, otherwise show
  // what we have (id + status).
  const getMovie = (item) => item.movie ?? { id: item.movieId, title: item.title ?? item.movieId }

  // ── Client-side filter/search ────────────────────────────────
  const filtered = items.filter((item) => {
    const movie = getMovie(item)
    const matchesSearch = !search ||
      movie?.title?.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = activeFilter === 'ALL' || item.status === activeFilter
    const matchesType   = typeFilter === 'ALL' || (movie?.type ?? 'film') === typeFilter
    return matchesSearch && matchesFilter && matchesType
  })

  // ── Stats for hero ───────────────────────────────────────────
  //
  // All of these are reads over rows already loaded — no extra request, and
  // no new source. M1 is what made DROPPED and REVISITING expressible, so
  // "% revisited" is a number that exists for the first time.
  const total      = items.length
  const countOf    = (status) => items.filter((i) => i.status === status).length
  const completed  = countOf('COMPLETED') + countOf('COLLECTED')
  const inProgress = countOf('IN_PROGRESS')
  const dropped    = countOf('DROPPED')
  const revisiting = countOf('REVISITING')

  // Guarded: 0/0 is NaN, which renders as "NaN%" on an empty vault.
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0)

  const rated     = items.filter((i) => i.rating != null)
  const avgRating = rated.length
    ? (rated.reduce((s, i) => s + i.rating, 0) / rated.length).toFixed(1)
    : '—'

  // ── Drawer handlers ──────────────────────────────────────────
  const openDrawer = (item, movie) => {
    setDrawerItem(item)
    setDrawerMovie(movie ?? getMovie(item))
    setDrawerOpen(true)
  }
  const closeDrawer = () => { setDrawerOpen(false); setDrawerItem(null); setDrawerMovie(null) }

  const handleUpdateRating = async (id, rating) => {
    try {
      await updateWatchItem(id, { rating })
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, rating } : i))
      if (drawerItem?.id === id) setDrawerItem((d) => ({ ...d, rating }))
    } catch { showToast('Could not update rating.', 'error') }
  }

  const handleUpdateStatus = async (id, status) => {
    try {
      await updateWatchItem(id, { status })
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, status } : i))
      if (drawerItem?.id === id) setDrawerItem((d) => ({ ...d, status }))
    } catch { showToast('Could not update status.', 'error') }
  }

  /**
   * Progress: which episode / page / hour you are on.
   *
   * Optimistic, like rating and status above - the value came from a control
   * the user just moved, so echoing it back after a round trip only makes the
   * UI feel slow. A failure reverts by refetching.
   */
  const handleUpdateProgress = async (id, patch) => {
    const before = items.find((i) => i.id === id)
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...patch } : i))
    if (drawerItem?.id === id) setDrawerItem((d) => ({ ...d, ...patch }))
    try {
      await updateWatchItem(id, patch)
    } catch {
      showToast('Could not update progress.', 'error')
      setItems((prev) => prev.map((i) => i.id === id ? before : i))
      if (drawerItem?.id === id) setDrawerItem(before)
    }
  }

  const handleRemove = async (id) => {
    try {
      await removeFromWatch(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
      showToast('Removed from watchlist.', 'default')
    } catch { showToast('Could not remove item.', 'error') }
  }

  const handleToggleWatched = (item) => {
    const next = item.status === 'COMPLETED' ? 'PLANNED' : 'COMPLETED'
    handleUpdateStatus(item.id, next)
  }

  return (
    <div className={styles.page} id="watchlist-page">
      {/* Everything above the footer fills at least one screen, so the
          attribution sits just below the fold rather than intruding on the
          first view of a short list. */}
      <div className={styles.main}>
      {/* ── Hero / Stats ─────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Your vault</p>
          <h1 className={styles.heroTitle}>
            {user?.name ? `${user.name}'s` : 'Your'}{' '}
            <em>watchlist</em>
          </h1>
          <div className={styles.stats}>
            {[
              [total,                  'Tracked'],
              [`${pct(completed)}%`,   'Completed'],
              [inProgress,             'In progress'],
              [`${pct(dropped)}%`,     'Dropped'],
              [`${pct(revisiting)}%`,  'Revisited'],
              [avgRating,              'Avg. Rating'],
            ].map(([v, l]) => (
              <div key={l} className={styles.stat}>
                <span className={styles.statVal}>{v}</span>
                <span className={styles.statLbl}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {/* Search */}
          <div className={styles.searchWrap}>
            <SearchIcon size={15} className={styles.searchIcon} />
            <input
              id="watchlist-search"
              className={styles.searchInput}
              placeholder="Search your vault…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Status filter tabs */}
          <div className={styles.filterTabs} role="tablist">
            {['ALL', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DROPPED', 'REVISITING'].map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={activeFilter === f}
                className={`${styles.filterTab} ${activeFilter === f ? styles.filterTabOn : ''}`}
                onClick={() => setActiveFilter(f)}
                id={`filter-${f.toLowerCase()}`}
              >
                {/* Generic labels here on purpose: this filter spans types, so
                    "Watching" would be wrong the moment a book is in the list. */}
                {f === 'ALL' ? 'All' : statusLabel(null, f)}
              </button>
            ))}
          </div>

          {/* Media type filter. Only shown once more than one type is tracked —
              a films-only vault has nothing to filter. */}
          {new Set(items.map((i) => getMovie(i)?.type ?? 'film')).size > 1 && (
            <div className={styles.filterTabs} role="tablist">
              {['ALL', 'film', 'tv'].map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={typeFilter === t}
                  className={`${styles.filterTab} ${typeFilter === t ? styles.filterTabOn : ''}`}
                  onClick={() => setTypeFilter(t)}
                  id={`type-filter-${t.toLowerCase()}`}
                >
                  {t === 'ALL' ? 'All types' : TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.toolbarRight}>
          {/* Density */}
          <select
            className={styles.densitySelect}
            value={density}
            onChange={(e) => setDensity(e.target.value)}
            id="density-select"
            aria-label="Display density"
          >
            {DENSITY.map((d) => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
          </select>

          {/* View toggle */}
          <div className={styles.viewToggle} role="group" aria-label="View mode">
            {VIEWS.map((v) => (
              <button
                key={v}
                className={`${styles.viewBtn} ${view === v ? styles.viewBtnOn : ''}`}
                onClick={() => setView(v)}
                title={`${v} view`}
                id={`view-${v}`}
              >
                {v === 'grid' ? '⊞' : '☰'}
              </button>
            ))}
          </div>

          {/* Add movie */}
          <button
            className="btn-primary"
            onClick={() => setAddOpen(true)}
            id="add-movie-open-btn"
            style={{ padding: '8px 16px', fontSize: '13.5px' }}
          >
            + Add
          </button>
        </div>
      </div>

      {/* ── Count ────────────────────────────────────────────── */}
      <div className={styles.count}>
        <span className={styles.countNum}>{filtered.length}</span>
        <span className={styles.countLbl}>film{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Feed ─────────────────────────────────────────────── */}
      <div className={styles.feed}>
        {loading ? (
          <div className={styles.loadingState}>
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <ClapperIcon size={52} className={styles.emptyIcon} />
            <p className={styles.emptyMsg}>
              {search ? `No films matching "${search}"` : 'Your vault is empty — add your first title!'}
            </p>
            {!search && (
              <button className="btn-primary" onClick={() => setAddOpen(true)} id="empty-add-btn">
                + Add a film
              </button>
            )}
            {/* Parked. TrendingStrip + GET /movies/trending stay in the tree —
                discovery is moving to a public home page, where this belongs
                instead of inside the gated vault.
            {!search && <TrendingStrip onAdded={fetchWatchlist} showToast={showToast} />}
            */}
          </div>
        ) : view === 'grid' ? (
          <div className={`${styles.grid} ${styles[density]}`}>
            {filtered.map((item) => (
              <WatchlistCard
                key={item.id}
                item={item}
                movie={getMovie(item)}
                onOpen={openDrawer}
                onToggleWatched={handleToggleWatched}
              />
            ))}
          </div>
        ) : (
          <div className={`${styles.list} ${styles[density]}`}>
            {filtered.map((item) => (
              <WatchlistRow
                key={item.id}
                item={item}
                movie={getMovie(item)}
                onOpen={openDrawer}
                onToggleWatched={handleToggleWatched}
              />
            ))}
          </div>
        )}
      </div>

      </div>

      {/* ── Drawer ───────────────────────────────────────────── */}
      <MovieDrawer
        item={drawerItem}
        movie={drawerMovie}
        open={drawerOpen}
        onClose={closeDrawer}
        onUpdateRating={handleUpdateRating}
        onUpdateStatus={handleUpdateStatus}
        onUpdateProgress={handleUpdateProgress}
        showToast={showToast}
        onRemove={handleRemove}
      />

      {/* ── Add Movie Modal ───────────────────────────────────── */}
      <AddMovieModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={fetchWatchlist}
        showToast={showToast}
      />

      {/* Required TMDB attribution — this page renders their data. */}
      <footer className={styles.attribution}>
        <TmdbCredit />
      </footer>
    </div>
  )
}
