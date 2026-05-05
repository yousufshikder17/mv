import { useState, useEffect, useCallback } from 'react'

/**
 * useToast — manages a single toast notification
 * Also listens for the global 'mv:toast' event fired by the Axios interceptor.
 */
export function useToast() {
  const [toast, setToast] = useState(null) // { message, type }

  const showToast = useCallback((message, type = 'default') => {
    setToast({ message, type })
    const timer = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [])

  // Listen for the 429 event fired by api.js interceptor
  useEffect(() => {
    const handler = (e) => showToast(e.detail.message, e.detail.type)
    window.addEventListener('mv:toast', handler)
    return () => window.removeEventListener('mv:toast', handler)
  }, [showToast])

  return { toast, showToast }
}
