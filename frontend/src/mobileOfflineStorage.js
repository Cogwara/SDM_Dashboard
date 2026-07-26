// Local Storage Keys
const PENDING_NOTES_KEY = 'sdm_pending_notes';
const PENDING_WHATSAPP_KEY = 'sdm_pending_whatsapp';
const PENDING_FSE_AUDITS_KEY = 'sdm_pending_fse_audits';
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

export const getPendingFseAudits = () => {
  try {
    return JSON.parse(localStorage.getItem(PENDING_FSE_AUDITS_KEY) || '[]');
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

export const clearCachedSites = () => {
  try {
    localStorage.removeItem(CACHED_SITES_KEY);
  } catch (e) {
    console.error('Failed to clear cached sites:', e);
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
    created_at: noteData.created_at || new Date().toISOString(),
    status_sync: 'pending'
  };
  pending.push(newPendingNote);

  try {
    localStorage.setItem(PENDING_NOTES_KEY, JSON.stringify(pending));
  } catch (err) {
    console.warn('LocalStorage quota exceeded in saveOfflineNote, attempting recovery...', err);
    // Recovery Step 1: Clear large cached sites to free up space (cached sites are re-fetched when online)
    try {
      localStorage.removeItem(CACHED_SITES_KEY);
      localStorage.setItem(PENDING_NOTES_KEY, JSON.stringify(pending));
    } catch (err2) {
      console.warn('LocalStorage quota still exceeded, trimming payload...', err2);
      // Recovery Step 2: Keep latest 10 notes if queue is full
      const trimmedPending = pending.slice(-10);
      try {
        localStorage.setItem(PENDING_NOTES_KEY, JSON.stringify(trimmedPending));
      } catch (err3) {
        console.error('Failed to save offline note to storage:', err3);
      }
    }
  }
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

  try {
    localStorage.setItem(PENDING_WHATSAPP_KEY, JSON.stringify(pending));
  } catch (err) {
    console.warn('Quota error saving WhatsApp intel, clearing site cache...', err);
    localStorage.removeItem(CACHED_SITES_KEY);
    try {
      localStorage.setItem(PENDING_WHATSAPP_KEY, JSON.stringify(pending));
    } catch (err2) {
      console.error('Failed to save offline WhatsApp:', err2);
    }
  }
  return newPendingWa;
};

export const saveOfflineFseAudit = (auditData) => {
  const pending = getPendingFseAudits();
  const newPendingAudit = {
    ...auditData,
    local_id: 'offline_fse_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    created_at: new Date().toISOString(),
    status_sync: 'pending'
  };
  pending.push(newPendingAudit);

  try {
    localStorage.setItem(PENDING_FSE_AUDITS_KEY, JSON.stringify(pending));
  } catch (err) {
    console.warn('Quota error saving FSE audit, clearing site cache...', err);
    localStorage.removeItem(CACHED_SITES_KEY);
    try {
      localStorage.setItem(PENDING_FSE_AUDITS_KEY, JSON.stringify(pending));
    } catch (err2) {
      console.error('Failed to save offline FSE audit:', err2);
    }
  }
  return newPendingAudit;
};

export const removePendingNote = (localId) => {
  const pending = getPendingNotes().filter(n => n.local_id !== localId);
  localStorage.setItem(PENDING_NOTES_KEY, JSON.stringify(pending));
};

export const removePendingWhatsApp = (localId) => {
  const pending = getPendingWhatsApp().filter(w => w.local_id !== localId);
  localStorage.setItem(PENDING_WHATSAPP_KEY, JSON.stringify(pending));
};

export const removePendingFseAudit = (localId) => {
  const pending = getPendingFseAudits().filter(a => a.local_id !== localId);
  localStorage.setItem(PENDING_FSE_AUDITS_KEY, JSON.stringify(pending));
};

export const clearPendingQueue = () => {
  localStorage.removeItem(PENDING_NOTES_KEY);
  localStorage.removeItem(PENDING_WHATSAPP_KEY);
  localStorage.removeItem(PENDING_FSE_AUDITS_KEY);
};

export const getPendingTotalCount = () => {
  return getPendingNotes().length + getPendingWhatsApp().length + getPendingFseAudits().length;
};
