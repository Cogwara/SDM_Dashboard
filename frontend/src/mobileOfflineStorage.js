// Local Storage Keys
const PENDING_NOTES_KEY = 'sdm_pending_notes';
const PENDING_WHATSAPP_KEY = 'sdm_pending_whatsapp';
const PENDING_FSE_AUDITS_KEY = 'sdm_pending_fse_audits';
const CACHED_SITES_KEY = 'sdm_cached_sites';
const CACHED_NOTES_KEY = 'sdm_cached_notes';
const LAST_SYNC_KEY = 'sdm_last_sync_time';

export const getPendingNotes = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_NOTES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getPendingWhatsApp = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_WHATSAPP_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getPendingFseAudits = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_FSE_AUDITS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getCachedSites = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHED_SITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveCachedSites = (sites) => {
  try {
    const list = Array.isArray(sites) ? sites : [];
    const compact = list.slice(0, 1500).map((s) => ({
      id: s.id,
      ihs_site_id: s.ihs_site_id || s.site_id,
      mtn_id: s.mtn_id,
      operational_status: s.operational_status || s.site_status || (s.is_down ? 'Down' : 'Operational'),
      is_down: Boolean(s.is_down || s.operational_status === 'Down' || s.site_status === 'Down'),
      is_critical: Boolean(s.is_critical || s.priority === 'P1'),
      priority: s.priority || s.site_priority || 'P2',
      site_address: s.site_address,
      cluster_name: s.cluster_name || s.cluster,
      hvc_cluster: s.hvc_cluster,
      lga: s.lga,
      state: s.state,
      region: s.region,
      tower_co: s.tower_co || s.raw_data?.['Tower Co'] || 'IHS',
      smc: s.smc || s.raw_data?.['SMC'] || 'IHS',
      sdm_name: s.sdm_name || s.sdm || s.raw_data?.['SDM NAME'],
      sdm_phone: s.sdm_phone,
      smc_fse_name: s.smc_fse_name || s.fse || s.raw_data?.['FSE NAME'],
      smc_fse_phone: s.smc_fse_phone || s.fse_phone || s.raw_data?.['FSE CONTACT NO.'],
      efs_name: s.efs_name,
      efs_phone: s.efs_phone,
      rto_name: s.rto_name || s.rto,
      rto_phone: s.rto_phone,
      mtn_rdm_name: s.mtn_rdm_name || s.rdm,
      power_solution: s.power_solution || s.power_solution_type || s.raw_data?.['Power Solution'],
      dg_capacity: s.dg_capacity || s.dg_rating || s.raw_data?.['DG CAP'],
      latitude: s.latitude,
      longitude: s.longitude,
      notes_count: s.notes_count || s.open_notes_count || 0
    }));
    localStorage.setItem(CACHED_SITES_KEY, JSON.stringify(compact));
  } catch (e) {
    console.warn('Failed to cache sites locally:', e);
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
