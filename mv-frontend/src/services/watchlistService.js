import api from './api.js'

export const getWatchlist    = ()           => api.get('/watchlist')
export const addToWatchlist  = (data)       => api.post('/watchlist', data)
export const updateWatchItem = (id, data)   => api.put(`/watchlist/${id}`, data)
export const removeFromWatch = (id)         => api.delete(`/watchlist/${id}`)

// Movies — search hits TMDB via our backend proxy (the token never reaches
// the browser). importMovie resolves a TMDB id to a row in our own catalogue
// and hands back our uuid, which is what /watchlist accepts.
// type is 'film' | 'tv', or omitted for both interleaved.
export const searchMovies    = (query, type, config) => api.get('/movies/search', { params: { q: query, type }, ...config })
export const importMovie     = (tmdbId, type = 'film') => api.post('/movies/import', { tmdbId, type })
export const getSeasonRatings = (itemId)             => api.get(`/watchlist/${itemId}/seasons`)
export const setSeasonRating  = (itemId, n, data)    => api.put(`/watchlist/${itemId}/seasons/${n}`, data)
export const getSeasonEpisodes = (mediaId, n)        => api.get(`/movies/${mediaId}/seasons/${n}`)
export const getTrending     = ()           => api.get('/movies/trending')
// Public - no account needed. Reads straight from TMDB and creates no
// catalogue row, so browsing does not cache content we then have to expire.
export const getPublicDetails = (type, externalId) => api.get(`/movies/details/${type}/${externalId}`)
export const getAllMovies    = ()           => api.get('/movies')
export const getMovieById    = (id)         => api.get(`/movies/${id}`)
