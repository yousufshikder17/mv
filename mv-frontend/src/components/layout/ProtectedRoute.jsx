import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'

export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  // Carry the intended destination so login can return there. Without it,
  // being bounced from an item page lands you on the watchlist having
  // forgotten what you were trying to add.
  return isAuthenticated
    ? children
    : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
}
