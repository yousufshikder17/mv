import api from './api.js'

export const getWatchlist    = ()           => api.get('/watchlist')
export const addToWatchlist  = (data)       => api.post('/watchlist', data)
export const updateWatchItem = (id, data)   => api.put(`/watchlist/${id}`, data)
export const removeFromWatch = (id)         => api.delete(`/watchlist/${id}`)

// Movies — search hits TMDB via our backend proxy (the token never reaches
// the browser). importMovie resolves a TMDB id to a row in our own catalogue
// and hands back our uuid, which is what /watchlist accepts.
export const searchMovies    = (query, config) => api.get('/movies/search', { params: { q: query }, ...config })
export const importMovie     = (tmdbId)     => api.post('/movies/import', { tmdbId })
export const getAllMovies    = ()           => api.get('/movies')
export const getMovieById    = (id)         => api.get(`/movies/${id}`)
