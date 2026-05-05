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

// ── Response interceptor: handle 429 Rate Limit globally ────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 429) {
      // Dispatch a custom event so Toast can pick it up instead of a raw alert
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
