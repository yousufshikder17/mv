import api from './api.js'

// Profiles and discussion are public reads (M3's rule: the gate is
// persistence, not access). The token rides along when there is one, which is
// how the backend knows to show you your own private profile and hidden items.
export const getProfile      = (userId)        => api.get(`/social/profile/${userId}`)
export const getProfileItems = (userId)        => api.get(`/social/profile/${userId}/items`)
export const followUser      = (userId)        => api.post(`/social/follow/${userId}`)
export const unfollowUser    = (userId)        => api.delete(`/social/follow/${userId}`)
export const getFeed         = ()              => api.get('/social/feed')

export const getReviews   = (mediaItemId)       => api.get(`/social/items/${mediaItemId}/reviews`)
export const saveReview   = (mediaItemId, data) => api.put(`/social/items/${mediaItemId}/review`, data)
export const deleteReview = (reviewId)          => api.delete(`/social/reviews/${reviewId}`)
export const voteReview   = (reviewId, helpful) => api.post(`/social/reviews/${reviewId}/vote`, { helpful })

export const getComments   = (mediaItemId)       => api.get(`/social/items/${mediaItemId}/comments`)
export const addComment    = (mediaItemId, data) => api.post(`/social/items/${mediaItemId}/comments`, data)
export const deleteComment = (commentId)         => api.delete(`/social/comments/${commentId}`)

export const updatePrivacy = (data) => api.patch('/account/privacy', data)
export const exportAccount = ()     => api.get('/account/export')
