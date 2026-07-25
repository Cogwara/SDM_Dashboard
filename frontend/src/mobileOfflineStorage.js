// Local Storage Keys
const PENDING_NOTES_KEY = 'sdm_pending_notes';
const PENDING_WHATSAPP_KEY = 'sdm_pending_whatsapp';
const CACHED_SITES_KEY = 'sdm_cached_sites';
const CACHED_NOTES_KEY = 'sdm_cached_notes';
const LAST_SYNC_KEY = 'sdm_last_sync_time';

export const getPendingNotes = () => {
  try {
    return JSON.parse(localStorage.getItem(PENDING_NOTES_KEY) || '[]');
  } catch {
    return [];
  }
};

export const getPendingWhatsApp = () => {
  try {
    return JSON.parse(localStorage.getItem(PENDING_WHATSAPP_KEY) || '[]');
  } catch {
    return [];
  }
};

export const getCachedSites = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHED_SITES_KEY) || '[]');
  } catch {
    return [];
  }
};

export const saveCachedSites = (sites) => {
  try {
    localStorage.setItem(CACHED_SITES_KEY, JSON.stringify(sites || []));
  } catch (e) {
    console.error('Failed to cache sites locally:', e);
  }
};

export const getLastSyncTime = () => {
  return localStorage.getItem(LAST_SYNC_KEY) || null;
};

export const saveOfflineNote = (noteData) => {
  const pending = getPendingNotes();
  const newPendingNote = {
    ...noteData,
    local_id: 'offline_note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    created_at: new Date().toISOString(),
    status_sync: 'pending'
  };
  pending.push(newPendingNote);
  localStorage.setItem(PENDING_NOTES_KEY, JSON.stringify(pending));
  return newPendingNote;
};

export const saveOfflineWhatsApp = (waData) => {
  const pending = getPendingWhatsApp();
  const newPendingWa = {
    ...waData,
    local_id: 'offline_wa_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    created_at: new Date().toISOString(),
    status_sync: 'pending'
  };
  pending.push(newPendingWa);
  localStorage.setItem(PENDING_WHATSAPP_KEY, JSON.stringify(pending));
  return newPendingWa;
};

export const removePendingNote = (localId) => {
  const pending = getPendingNotes().filter(n => n.local_id !== localId);
  localStorage.setItem(PENDING_NOTES_KEY, JSON.stringify(pending));
};

export const removePendingWhatsApp = (localId) => {
  const pending = getPendingWhatsApp().filter(w => w.local_id !== localId);
  localStorage.setItem(PENDING_WHATSAPP_KEY, JSON.stringify(pending));
};

export const clearPendingQueue = () => {
  localStorage.removeItem(PENDING_NOTES_KEY);
  localStorage.removeItem(PENDING_WHATSAPP_KEY);
};

export const getPendingTotalCount = () => {
  return getPendingNotes().length + getPendingWhatsApp().length;
};
