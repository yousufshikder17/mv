import { useState } from 'react'
import styles from './Poster.module.css'
import { ClapperIcon } from './Icon.jsx'

/**
 * Poster — movie poster image with shimmer loader and fallback
 * Props: url, title, aspectRatio ('2/3' | '16/9'), className
 */
export default function Poster({ url, title = '', aspectRatio = '2/3', className = '' }) {
  const [loaded, setLoaded] = useState(false)
  const [error,  setError]  = useState(false)

  return (
    <div
      className={`${styles.wrap} ${className}`}
      style={{ aspectRatio }}
    >
      {/* Shimmer skeleton */}
      {!loaded && !error && <div className={styles.shimmer} aria-hidden="true" />}

      {!error && url ? (
        <img
          src={url}
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
