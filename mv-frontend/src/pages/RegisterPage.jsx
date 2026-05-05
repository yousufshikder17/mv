import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { registerUser } from '../services/authService.js'
import { useAuth } from '../hooks/useAuth.js'
import styles from './AuthPage.module.css'

export default function RegisterPage({ showToast }) {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [form,    setForm]    = useState({ name: '', email: '', password: '' })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const onChange = (e) => {
    setError('')
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  const validate = () => {
    if (!form.name.trim())  return 'Name is required.'
    if (!form.email.trim()) return 'Email is required.'
    if (form.password.length < 8) return 'Password must be at least 8 characters.'
    return null
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }

    setLoading(true)
    try {
      const res = await registerUser(form)
      login(res.data.user, res.data.token)
      showToast('Account created! Welcome to mv.', 'success')
      navigate('/watchlist')
    } catch (err) {
      setError(err.response?.data?.error ?? 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles.page} id="register-page">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.card}>
        {/* Brand */}
        <div className={styles.brand}>
          <span className={styles.brandMark}>◆</span>
          <span className={styles.brandName}>mv</span>
        </div>

        <h1 className={styles.heading}>Create your vault</h1>
        <p className={styles.sub}>Free forever. Start tracking in seconds.</p>

        <form onSubmit={onSubmit} className={styles.form} noValidate id="register-form">
          {/* Name */}
          <div className="form-field">
            <label className="form-label" htmlFor="reg-name">Full name</label>
            <input
              id="reg-name"
              name="name"
              type="text"
              className={`form-input ${error && !form.name ? 'error' : ''}`}
              placeholder="Your name"
              value={form.name}
              onChange={onChange}
              autoComplete="name"
              required
            />
          </div>

          {/* Email */}
          <div className="form-field">
            <label className="form-label" htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              name="email"
              type="email"
              className={`form-input ${error && !form.email ? 'error' : ''}`}
              placeholder="you@example.com"
              value={form.email}
              onChange={onChange}
              autoComplete="email"
              required
            />
          </div>

          {/* Password */}
          <div className="form-field">
            <label className="form-label" htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              name="password"
              type="password"
              className={`form-input ${error && form.password.length < 8 ? 'error' : ''}`}
              placeholder="Min. 8 characters"
              value={form.password}
              onChange={onChange}
              autoComplete="new-password"
              required
            />
          </div>

          {/* Error */}
          {error && (
            <p className="form-error" id="register-error" role="alert">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn-accent"
            style={{ width: '100%', padding: '12px', fontSize: '15px', marginTop: '4px' }}
            disabled={loading}
            id="register-submit-btn"
          >
            {loading ? 'Creating account…' : 'Create vault →'}
          </button>
        </form>

        <p className={styles.switchLink}>
          Already have an account?{' '}
          <Link to="/login" id="register-to-login">Sign in</Link>
        </p>
      </div>
    </main>
  )
}
