import { useState } from 'react'
import { baseURL } from '../../services/api.js'
import styles from './Poster.module.css'
import { ClapperIcon } from './Icon.jsx'

/**
 * Poster — movie poster image with shimmer loader and fallback
 * Props: url, title, aspectRatio ('2/3' | '16/9'), className
 */
export default function Poster({ url, title = '', aspectRatio = '2/3', className = '' }) {
  const [loaded, setLoaded] = useState(false)
  const [error,  setError]  = useState(false)

  // Some covers are served by our own API rather than a provider CDN - album
  // art goes through a resolver, because the Cover Art Archive answers 400
  // for a release group with no artwork. Those arrive as a path, and in
  // development the API is on a different port from this page, so a bare path
  // would resolve against Vite and 404.
  const src = url?.startsWith('/') ? baseURL + url : url

  return (
    <div
      className={`${styles.wrap} ${className}`}
      style={{ aspectRatio }}
    >
      {/* Shimmer skeleton */}
      {!loaded && !error && <div className={styles.shimmer} aria-hidden="true" />}

      {!error && src ? (
        <img
          src={src}
          alt={title}
          className={`${styles.img} ${loaded ? styles.visible : ''}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          loading="lazy"
        />
      ) : (
        /* Fallback placeholder */
        <div className={styles.fallback} aria-label={title || 'No poster'}>
          <ClapperIcon size={30} className={styles.fallbackIcon} />
          {title && <span className={styles.fallbackTitle}>{title.slice(0, 2).toUpperCase()}</span>}
        </div>
      )}
    </div>
  )
}
