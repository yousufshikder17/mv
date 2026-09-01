import api from './api.js'

// Reading a public list needs no account (M3: the gate is persistence, not
// access). Everything that writes does.
export const getMyLists     = ()             => api.get('/lists')
export const getList        = (id)           => api.get(`/lists/${id}`)
export const createList     = (data)         => api.post('/lists', data)
export const updateList     = (id, data)     => api.patch(`/lists/${id}`, data)
export const deleteList     = (id)           => api.delete(`/lists/${id}`)

export const addListItem    = (id, data)     => api.post(`/lists/${id}/items`, data)
export const updateListItem = (id, itemId, data) => api.patch(`/lists/${id}/items/${itemId}`, data)
export const removeListItem = (id, itemId)   => api.delete(`/lists/${id}/items/${itemId}`)

// Someone else's public lists, for their profile page.
export const getProfileLists = (userId)      => api.get(`/social/profile/${userId}/lists`)
