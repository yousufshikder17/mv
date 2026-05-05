import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loginUser } from '../services/authService.js'
import { useAuth } from '../hooks/useAuth.js'
import styles from './AuthPage.module.css'

export default function LoginPage({ showToast }) {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [form,    setForm]    = useState({ email: '', password: '' })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const onChange = (e) => {
    setError('')
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!form.email || !form.password) {
      setError('Please fill in all fields.')
      return
    }
    setLoading(true)
    try {
      const res = await loginUser(form)
      login(res.data.user, res.data.token)
      showToast('Welcome back!', 'success')
      navigate('/watchlist')
    } catch (err) {
      setError(err.response?.data?.error ?? 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles.page} id="login-page">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.card}>
        {/* Brand */}
        <div className={styles.brand}>
          <span className={styles.brandMark}>◆</span>
          <span className={styles.brandName}>mv</span>
        </div>

        <h1 className={styles.heading}>Sign in to your vault</h1>
        <p className={styles.sub}>Welcome back — your films are waiting.</p>

        <form onSubmit={onSubmit} className={styles.form} noValidate id="login-form">
          {/* Email */}
          <div className="form-field">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              className={`form-input ${error ? 'error' : ''}`}
              placeholder="you@example.com"
              value={form.email}
              onChange={onChange}
              autoComplete="email"
              required
            />
          </div>

          {/* Password */}
          <div className="form-field">
            <label className="form-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              className={`form-input ${error ? 'error' : ''}`}
              placeholder="••••••••"
              value={form.password}
              onChange={onChange}
              autoComplete="current-password"
              required
            />
          </div>

          {/* Error */}
          {error && (
            <p className="form-error" id="login-error" role="alert">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: '15px', marginTop: '4px' }}
            disabled={loading}
            id="login-submit-btn"
          >
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>

        <p className={styles.switchLink}>
          Don't have an account?{' '}
          <Link to="/register" id="login-to-register">Create one free</Link>
        </p>
      </div>
    </main>
  )
}
