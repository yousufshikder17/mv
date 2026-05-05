import api from './api.js'

export const getWatchlist    = ()           => api.get('/watchlist')
export const addToWatchlist  = (data)       => api.post('/watchlist', data)
export const updateWatchItem = (id, data)   => api.put(`/watchlist/${id}`, data)
export const removeFromWatch = (id)         => api.delete(`/watchlist/${id}`)

// Movies catalogue — search/browse movies stored in your DB
export const searchMovies    = (query)      => api.get('/movies/search', { params: { q: query } })
export const getAllMovies     = ()           => api.get('/movies')
export const getMovieById    = (id)         => api.get(`/movies/${id}`)
