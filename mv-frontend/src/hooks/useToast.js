import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * useToast — manages a single toast notification
 * Also listens for the global 'mv:toast' event fired by the Axios interceptor.
 */
export function useToast() {
  const [toast, setToast] = useState(null) // { message, type }
  const timerRef = useRef(null)

  const showToast = useCallback((message, type = 'default') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ message, type })
    timerRef.current = setTimeout(() => {
      setToast(null)
      timerRef.current = null
    }, 3500)
  }, [])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  // Listen for the 429 event fired by api.js interceptor
  useEffect(() => {
    const handler = (e) => showToast(e.detail.message, e.detail.type)
    window.addEventListener('mv:toast', handler)
    return () => window.removeEventListener('mv:toast', handler)
  }, [showToast])

  return { toast, showToast }
}
