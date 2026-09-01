import { useState, useEffect, useRef } from 'react'
import { searchMovies } from '../services/watchlistService.js'

const EMPTY = []

/**
 * Debounced media search, shared by the topbar and the search page.
 *
 * One hook rather than two copies: the debounce, the abort and the
 * "an abort is not a failure" distinction are the fiddly parts, and having
 * them in two places is how the two search boxes end up behaving differently.
 *
 * 350ms because these endpoints sit in front of somebody else's quota. Every
 * keystroke firing a request is exactly what the public rate limiter would
 * otherwise have to absorb.
 *
 * `loading` is derived from whether the last settled search matches what is
 * being asked for now, rather than stored — one less piece of state to get
 * out of step, and results stay on screen while the next ones load instead of
 * blanking on every keystroke.
 */
export function useMediaSearch(query, type = '', { delay = 350 } = {}) {
  const [settled, setSettled] = useState({ q: '', type: '', results: EMPTY, failed: false })
  const abortRef = useRef(null)

  const q = query.trim()

  useEffect(() => {
    if (!q) return

    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await searchMovies(q, type || undefined, { signal: controller.signal })
        setSettled({ q, type, results: res.data?.data ?? EMPTY, failed: false })
      } catch (err) {
        // An abort is normal — it means the user kept typing. Anything else is
        // a real failure, and silence made a rate limit or a TMDB outage look
        // identical to "no results", which is the wrong thing to tell someone.
        if (err.code !== 'ERR_CANCELED') setSettled({ q, type, results: EMPTY, failed: true })
      }
    }, delay)

    return () => clearTimeout(timer)
  }, [q, type, delay])

  const current = settled.q === q && settled.type === type

  return {
    // Stale results stay visible while the next search runs; a typeahead that
    // empties itself between keystrokes flickers on every character.
    results: q ? settled.results : EMPTY,
    loading: Boolean(q) && !current,
    failed: current && settled.failed,
  }
}
