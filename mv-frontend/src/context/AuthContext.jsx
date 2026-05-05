import { createContext, useState, useEffect, useCallback } from 'react'
import { logoutUser } from '../services/authService.js'

export const AuthContext = createContext(null)

const TOKEN_KEY = 'mv_token'
const USER_KEY  = 'mv_user'

export function AuthProvider({ children }) {
  const [token, setToken]   = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user,  setUser]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null }
  })
  const [loading, setLoading] = useState(false)

  const isAuthenticated = Boolean(token)

  // Called after a successful /auth/login or /auth/register response
  const login = useCallback((userData, jwt) => {
    localStorage.setItem(TOKEN_KEY, jwt)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))
    setToken(jwt)
    setUser(userData)
  }, [])

  const logout = useCallback(async () => {
    try { await logoutUser() } catch { /* ignore */ }
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  // Sync across tabs — if the user logs out in another tab, clear state here
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === TOKEN_KEY && !e.newValue) {
        setToken(null)
        setUser(null)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, loading, setLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
