import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:5001',
  withCredentials: true, // send cookies for cookie-based JWT
  headers: {
    'Content-Type': 'application/json',
  },
})

// ── Request interceptor: attach Bearer token from localStorage ──
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('mv_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor: handle global error codes ─────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status

    if (status === 401) {
      // Only an EXPIRED SESSION should bounce anyone to the login page.
      //
      // Since M3, public pages call authenticated endpoints on purpose - an
      // anonymous visitor pressing "Add to watchlist" gets a 401, and that is
      // the signal to prompt, not to eject them from the page they were
      // reading. Redirecting unconditionally logged out a browse session that
      // was never logged in.
      const hadSession = Boolean(localStorage.getItem('mv_token'))
      localStorage.removeItem('mv_token')
      localStorage.removeItem('mv_user')
      if (hadSession && window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    } else if (status === 429) {
      window.dispatchEvent(
        new CustomEvent('mv:toast', {
          detail: { message: '⚠️ Too many requests — please slow down.', type: 'error' },
        })
      )
    }

    return Promise.reject(error)
  }
)

export default api
