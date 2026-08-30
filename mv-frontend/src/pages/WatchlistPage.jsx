import { useState, useEffect, useCallback } from 'react'
import { getWatchlist, updateWatchItem, removeFromWatch } from '../services/watchlistService.js'
import WatchlistCard from '../components/watchlist/WatchlistCard.jsx'
import WatchlistRow  from '../components/watchlist/WatchlistRow.jsx'
import MovieDrawer   from '../components/watchlist/MovieDrawer.jsx'
import AddMovieModal from '../components/watchlist/AddMovieModal.jsx'
import TmdbCredit    from '../components/layout/TmdbCredit.jsx'
import { useAuth } from '../hooks/useAuth.js'
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
  const [activeFilter, setActiveFilter] = useState('all')  // all | planned | watching | completed | dropped

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
    const matchesFilter = activeFilter === 'all' || item.status?.toLowerCase() === activeFilter
    return matchesSearch && matchesFilter
  })

  // ── Stats for hero ───────────────────────────────────────────
  const total     = items.length
  const watched   = items.filter((i) => i.status === 'COMPLETED').length
  const watching  = items.filter((i) => i.status === 'WATCHING').length
  const avgRating = items.filter((i) => i.rating != null).length
    ? (items.reduce((s, i) => s + (i.rating ?? 0), 0) / items.filter((i) => i.rating != null).length).toFixed(1)
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
              [total,     'Films'],
              [watched,   'Watched'],
              [watching,  'Watching'],
              [avgRating, 'Avg. Rating'],
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
            <span className={styles.searchIcon}>🔍</span>
            <input
              id="watchlist-search"
              className={styles.searchInput}
              placeholder="Search films…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Status filter tabs */}
          <div className={styles.filterTabs} role="tablist">
            {['all', 'planned', 'watching', 'completed', 'dropped'].map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={activeFilter === f}
                className={`${styles.filterTab} ${activeFilter === f ? styles.filterTabOn : ''}`}
                onClick={() => setActiveFilter(f)}
                id={`filter-${f}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
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
            + Add film
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
            <p className={styles.emptyIcon}>🎬</p>
            <p className={styles.emptyMsg}>
              {search ? `No films matching "${search}"` : 'Your vault is empty — add your first film!'}
            </p>
            {!search && (
              <button className="btn-primary" onClick={() => setAddOpen(true)} id="empty-add-btn">
                + Add a film
              </button>
            )}
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

      {/* ── Drawer ───────────────────────────────────────────── */}
      <MovieDrawer
        item={drawerItem}
        movie={drawerMovie}
        open={drawerOpen}
        onClose={closeDrawer}
        onUpdateRating={handleUpdateRating}
        onUpdateStatus={handleUpdateStatus}
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
