import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import NotificationBell from '../notifications/NotificationBell.jsx'
import styles from './Navbar.module.css'

export default function Navbar({ onThemeToggle, theme }) {
  const { isAuthenticated, logout, user } = useAuth()
  const { pathname } = useLocation()

  return (
    <header className={styles.hdr}>
      <div className={styles.hdrL}>
        {/* Logo */}
        <Link to="/" className={styles.logo} id="nav-logo">
          <span className={styles.logoMark}>◆</span>
          <span className={styles.logoWord}>mv</span>
        </Link>

        {/* Nav links */}
        <nav className={styles.hdrNav} aria-label="Main navigation">
          <Link
            to="/"
            id="nav-home"
            className={`${styles.navItem} ${pathname === '/' ? styles.active : ''}`}
          >
            Home
          </Link>
          {isAuthenticated && (
            <Link
              to="/watchlist"
              id="nav-watchlist"
              className={`${styles.navItem} ${pathname === '/watchlist' ? styles.active : ''}`}
            >
              Watchlist
            </Link>
          )}
        </nav>
      </div>

      <div className={styles.hdrR}>
        {/* Theme toggle */}
        <button
          id="nav-theme-toggle"
          className="icon-btn"
          onClick={onThemeToggle}
          aria-label="Toggle theme"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀' : '◑'}
        </button>

        {isAuthenticated && <NotificationBell />}
        {isAuthenticated ? (
          <>
            <span className={styles.userGreeting} id="nav-user-greeting">
              {user?.name ?? user?.email ?? 'Account'}
            </span>
            <button
              id="nav-logout-btn"
              className="btn-ghost"
              style={{ padding: '7px 14px', fontSize: '13px' }}
              onClick={logout}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link id="nav-login-link" to="/login" className="btn-ghost" style={{ padding: '7px 14px', fontSize: '13px' }}>
              Sign in
            </Link>
            <Link id="nav-register-link" to="/register" className="btn-primary" style={{ padding: '7px 14px', fontSize: '13px' }}>
              Start free
            </Link>
          </>
        )}
      </div>
    </header>
  )
}
