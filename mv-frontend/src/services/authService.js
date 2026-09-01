import api from './api.js'

export const registerUser = (data) => api.post('/auth/register', data)
export const loginUser    = (data) => api.post('/auth/login', data)
export const logoutUser   = ()     => api.post('/auth/logout')

// Reset. Both are unauthenticated - somebody who cannot sign in cannot
// present a token.
export const forgotPassword = (email)            => api.post('/auth/forgot', { email })
export const resetPassword   = (token, password) => api.post('/auth/reset', { token, password })
