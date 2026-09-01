import { useState, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Navbar         from './components/layout/Navbar.jsx'
import ProtectedRoute from './components/layout/ProtectedRoute.jsx'
import Toast          from './components/ui/Toast.jsx'
import LandingPage    from './pages/LandingPage.jsx'
import ItemPage       from './pages/ItemPage.jsx'
import DealsPage      from './pages/DealsPage.jsx'
import SearchPage     from './pages/SearchPage.jsx'
import BrowsePage     from './pages/BrowsePage.jsx'
import LoginPage      from './pages/LoginPage.jsx'
import RegisterPage   from './pages/RegisterPage.jsx'
import WatchlistPage  from './pages/WatchlistPage.jsx'
import ProfilePage    from './pages/ProfilePage.jsx'
import ListsPage      from './pages/ListsPage.jsx'
import ListDetailPage from './pages/ListDetailPage.jsx'
import FeedPage       from './pages/FeedPage.jsx'
import { useToast }   from './hooks/useToast.js'
import { BROWSE_NAV } from './lib/media.js'

// Pages that hide the Navbar
const BARE_ROUTES = ['/login', '/register']

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('mv_theme') ?? 'dark')
  const { toast, showToast } = useToast()
  const { pathname } = useLocation()

  // Apply theme to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mv_theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  const showNav = !BARE_ROUTES.includes(pathname)

  return (
    <>
      {showNav && (
        <Navbar onThemeToggle={toggleTheme} theme={theme} />
      )}

      <Routes>
        <Route path="/"         element={<LandingPage />} />
        {/* Public item page - no ProtectedRoute. Reading is free; keeping
            needs an account (M3). */}
        <Route path="/media/:type/:externalId" element={<ItemPage showToast={showToast} />} />
        {/* Public type pages. One component, five feeds — the only thing
            that differs is which source fills the row. */}
        {BROWSE_NAV.map((n) => (
          <Route
            key={n.path}
            path={`/${n.path}`}
            element={<BrowsePage type={n.type} label={n.label} />}
          />
        ))}
        {/* Public. The query lives in the URL so a search can be shared,
            bookmarked and reached with the back button. */}
        <Route path="/search" element={<SearchPage />} />
        {/* Public. A deal is a link - browsing needs no account, and only
            voting writes a row (M7). */}
        <Route path="/deals" element={<DealsPage showToast={showToast} />} />
        {/* Public when its owner says so - a list is meant to be handed to
            someone, which is most of the point of making one. */}
        <Route path="/lists/:listId" element={<ListDetailPage showToast={showToast} />} />
        {/* Public. A profile is a page about someone's taste - reading it
            needs no account, and its owner can make it private (M8). */}
        <Route path="/u/:userId" element={<ProfilePage showToast={showToast} />} />
        <Route path="/login"    element={<LoginPage    showToast={showToast} />} />
        <Route path="/register" element={<RegisterPage showToast={showToast} />} />
        {/* Gated because it is built from YOUR follow list, not because
            reading is gated - every item it links to is public. */}
        <Route
          path="/feed"
          element={
            <ProtectedRoute>
              <FeedPage />
            </ProtectedRoute>
          }
        />
        {/* Public: published lists from anyone, plus your own when signed
            in. Reading a list needs no account; making one does. */}
        <Route path="/lists" element={<ListsPage showToast={showToast} />} />
        <Route
          path="/watchlist"
          element={
            <ProtectedRoute>
              <WatchlistPage showToast={showToast} />
            </ProtectedRoute>
          }
        />
        {/* 404 fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Global toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </>
  )
}

function NotFound() {
  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
    }}>
      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>
        404
      </p>
      <h1 style={{ fontFamily: 'var(--ff-display)', fontSize: 48, letterSpacing: '-.03em', fontWeight: 400, margin: 0 }}>
        Page not found
      </h1>
      <a href="/" className="btn-ghost" style={{ marginTop: 8 }}>← Back to home</a>
    </main>
  )
}
