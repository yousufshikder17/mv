import axios from 'axios'

// Hardcoding localhost meant a deployed frontend called the developer's own
// machine and failed every request. VITE_API_URL is baked in at build time;
// the localhost default keeps `npm run dev` working with no .env.
//
// An empty string is meaningful: when the backend serves the built SPA from
// its own origin (see spa.js), relative URLs are correct and any absolute one
// would be wrong.
// The production default is a RELATIVE base, because the backend serves this
// bundle from its own origin. Falling back to localhost there would bake the
// developer's machine into the deployed build - and it would only surface as
// every request failing in a browser that is not this one.
//
// Dev still needs the absolute URL: Vite serves on 5173, the API on 5001.
const baseURL = import.meta.env.VITE_API_URL
  ?? (import.meta.env.DEV ? 'http://localhost:5001' : '')

export { baseURL }

const api = axios.create({
  baseURL,
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
