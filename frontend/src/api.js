import axios from 'axios';

const cleanHost = (input) => {
  if (!input) return '';
  return input.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
};

const checkIsCapacitorNative = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window.Capacitor?.isNativePlatform?.() && window.Capacitor?.getPlatform?.() !== 'web') ||
    (window.Capacitor?.getPlatform?.() === 'android' || window.Capacitor?.getPlatform?.() === 'ios') ||
    window.location.protocol === 'capacitor:' || 
    window.location.protocol === 'file:'
  );
};

const DEFAULT_MOBILE_SERVER_URL = 'https://during-duke-susan-binary.trycloudflare.com';

const getBaseUrl = () => {
  let savedIp = localStorage.getItem('fct_sdm_server_ip');
  if (savedIp && savedIp.includes('brighton-hours-strengthen-grown.trycloudflare.com')) {
    savedIp = null;
    localStorage.removeItem('fct_sdm_server_ip');
  }
  const nativeApp = checkIsCapacitorNative();
  
  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname || 'localhost';

    // If running inside Capacitor APK on mobile device, default to Cloudflare Tunnel URL
    if (nativeApp) {
      const rawHost = (savedIp && savedIp.trim()) ? savedIp.trim() : DEFAULT_MOBILE_SERVER_URL;
      const cleanH = cleanHost(rawHost);
      if (cleanH.includes('.trycloudflare.com') || rawHost.startsWith('https://')) {
        const formatted = rawHost.startsWith('http') ? rawHost : `https://${rawHost}`;
        return `${formatted.replace(/\/$/, '')}/api/v1`;
      }
      const formattedHost = cleanH.includes(':') ? cleanH : `${cleanH}:8001`;
      return `http://${formattedHost}/api/v1`;
    }

    // In web browser
    if (savedIp && savedIp.trim() && savedIp.trim() !== currentHost && savedIp.trim() !== 'localhost') {
      const rawHost = savedIp.trim();
      const cleanH = cleanHost(rawHost);
      if (cleanH.includes('.trycloudflare.com') || rawHost.startsWith('https://')) {
        const formatted = rawHost.startsWith('http') ? rawHost : `https://${rawHost}`;
        return `${formatted.replace(/\/$/, '')}/api/v1`;
      }
      const formattedHost = cleanH.includes(':') ? cleanH : `${cleanH}:8001`;
      return `http://${formattedHost}/api/v1`;
    }

    return `/api/v1`;
  }

  return `/api/v1`;
};

export const getMediaUrl = (fileUrl) => {
  if (!fileUrl) return '';
  if (typeof window === 'undefined') return fileUrl;

  let mediaPath = fileUrl;
  if (fileUrl.includes('/media/')) {
    mediaPath = '/media/' + fileUrl.split('/media/')[1];
  } else if (!mediaPath.startsWith('/')) {
    mediaPath = '/' + mediaPath;
  }

  const nativeApp = checkIsCapacitorNative();
  const savedIp = localStorage.getItem('fct_sdm_server_ip');

  if (!nativeApp && (!savedIp || !savedIp.includes('.trycloudflare.com'))) {
    return `${window.location.origin}${mediaPath}`;
  }

  const rawHost = (savedIp && savedIp.trim()) ? savedIp.trim() : DEFAULT_MOBILE_SERVER_URL;
  const cleanH = cleanHost(rawHost);
  if (cleanH.includes('.trycloudflare.com') || rawHost.startsWith('https://')) {
    const formatted = rawHost.startsWith('http') ? rawHost : `https://${rawHost}`;
    return `${formatted.replace(/\/$/, '')}${mediaPath}`;
  }
  const formattedHost = cleanH.includes(':') ? cleanH : `${cleanH}:8001`;
  return `http://${formattedHost}${mediaPath}`;
};

export const API_BASE_URL = getBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes
  headers: {
    'Content-Type': 'application/json',
  },
});

// Dynamically evaluate baseURL before every request to eliminate stale IP connection issues
api.interceptors.request.use(
  (config) => {
    config.baseURL = getBaseUrl();
    const token = localStorage.getItem('fct_sdm_token');
    if (token && token !== 'undefined' && token !== 'null') {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Automatic 401 Recovery Interceptor: Clear expired/invalid token and retry seamlessly
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response && error.response.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      localStorage.removeItem('fct_sdm_token');
      if (originalRequest.headers) {
        delete originalRequest.headers.Authorization;
      }
      return api(originalRequest);
    }
    return Promise.reject(error);
  }
);

// Update base URL dynamically when server IP changes
export const setCustomServerIp = (ip) => {
  const currentHost = typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost';
  const nativeApp = checkIsCapacitorNative();

  if (ip && ip.trim()) {
    const trimmed = ip.trim();
    if (!nativeApp && (trimmed === '192.168.1.120' || trimmed === 'localhost' || trimmed === '127.0.0.1' || trimmed === currentHost)) {
      localStorage.removeItem('fct_sdm_server_ip');
    } else {
      localStorage.setItem('fct_sdm_server_ip', trimmed);
    }
  } else {
    localStorage.removeItem('fct_sdm_server_ip');
  }
  const newUrl = getBaseUrl();
  api.defaults.baseURL = newUrl;
  return newUrl;
};


// Authentication & SDM Profile
export const loginSDM = async (username, password) => {
  const res = await api.post('/auth/login/', { username, password });
  return res.data;
};

export const fetchUserProfile = async (params = {}) => {
  const res = await api.get('/auth/profile/', { params });
  return res.data;
};

export const updateUserProfile = async (profileData) => {
  const isFormData = profileData instanceof FormData;
  const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
  const res = await api.post('/auth/profile/', profileData, config);
  return res.data;
};

export const fetchSDMList = async () => {
  const res = await api.get('/auth/sdms/');
  return res.data;
};

export const registerSDM = async (sdmData) => {
  const res = await api.post('/auth/register_sdm/', sdmData);
  return res.data;
};

export const syncFSEAccounts = async () => {
  const res = await api.post('/auth/sync_fse_accounts/');
  return res.data;
};

export const assignStateToSDM = async (name, stateOrStates = '', phone = '', siteIds = null, role = 'sdm') => {
  const payload = { 
    name, 
    sdm_name: name,
    rdm_name: name,
    phone, 
    sdm_phone: phone, 
    role: role || 'sdm', 
    target_type: role || 'sdm' 
  };
  if (siteIds) {
    payload.site_ids = siteIds;
  }
  if (Array.isArray(stateOrStates)) {
    payload.states = stateOrStates;
  } else if (stateOrStates) {
    payload.state = stateOrStates;
  }
  const res = await api.post('/auth/assign_state/', payload);
  return res.data;
};

export const fetchAvailableStates = async () => {
  const res = await api.get('/auth/states/');
  return res.data;
};

export const bulkSiteLookup = async (siteIds) => {
  const res = await api.post('/sites/bulk_lookup/', { site_ids: siteIds });
  return res.data;
};

export const identifyHubSites = async (siteIds, state = 'FCT') => {
  const res = await api.post('/sites/identify_hubs/', { site_ids: siteIds, state });
  return res.data;
};

export const fetchTNLLinks = async (params = {}) => {
  const res = await api.get('/tnl_links/', { params });
  return res.data;
};

export const fetchTNLLinkStats = async (params = {}) => {
  const res = await api.get('/tnl_links/stats/', { params });
  return res.data;
};

export const fetchTNLLinkImpact = async (linkId) => {
  const res = await api.get(`/tnl_links/${linkId}/impact/`);
  return res.data;
};

// IHS Fiber Links
export const fetchIHSFiberLinks = async (params = {}) => {
  const res = await api.get('/ihs_fiber_links/', { params });
  return res.data;
};

export const fetchIHSFiberLinkStats = async (params = {}) => {
  const res = await api.get('/ihs_fiber_links/stats/', { params });
  return res.data;
};

// Huawei Fiber Links
export const fetchHuaweiFiberLinks = async (params = {}) => {
  const res = await api.get('/huawei_fiber_links/', { params });
  return res.data;
};

export const fetchHuaweiFiberLinkStats = async (params = {}) => {
  const res = await api.get('/huawei_fiber_links/stats/', { params });
  return res.data;
};

// Fiber Outage Notes
export const fetchFiberOutageNotes = async (params = {}) => {
  const res = await api.get('/fiber_outages/', { params });
  return res.data;
};

export const fetchFiberOutageStats = async (params = {}) => {
  const res = await api.get('/fiber_outages/stats/', { params });
  return res.data;
};

export const createFiberOutageNote = async (data) => {
  const res = await api.post('/fiber_outages/', data);
  return res.data;
};

export const updateFiberOutageNote = async (id, data) => {
  const res = await api.patch(`/fiber_outages/${id}/`, data);
  return res.data;
};

export const deleteFiberOutageNote = async (id) => {
  const res = await api.delete(`/fiber_outages/${id}/`);
  return res.data;
};

// Dashboard Stats
export const fetchDashboardStats = async (params = {}) => {
  const res = await api.get('/dashboard/stats/', { params });
  return res.data;
};

// Sites
export const fetchSites = async (params = {}) => {
  const res = await api.get('/sites/', { params });
  return res.data;
};

export const lookupSite = async (siteId) => {
  const res = await api.get('/sites/lookup/', { params: { site_id: siteId } });
  return res.data;
};

export const fetchFilterOptions = async (params = {}) => {
  const res = await api.get('/sites/filter_options/', { params });
  return res.data;
};

// Notes
export const fetchNotes = async (params = {}) => {
  const res = await api.get('/notes/', { params });
  return res.data;
};

export const createNote = async (noteData) => {
  const isFormData = noteData instanceof FormData;
  const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
  const res = await api.post('/notes/', noteData, config);
  return res.data;
};

export const updateNote = async (noteId, noteData) => {
  const isFormData = noteData instanceof FormData;
  const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
  const res = await api.put(`/notes/${noteId}/`, noteData, config);
  return res.data;
};

export const resolveNote = async (noteId, payload = {}) => {
  const res = await api.post(`/notes/${noteId}/resolve/`, payload);
  return res.data;
};

export const deleteNote = async (noteId, params = {}) => {
  const res = await api.delete(`/notes/${noteId}/`, { params });
  return res.data;
};

export const uploadNotePhotos = async (noteId, formData) => {
  const res = await api.post(`/notes/${noteId}/upload_photo/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const exportNotesExcel = async (params = {}) => {
  const res = await api.get('/notes/export_excel/', {
    params,
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `SDM_Operational_Notes_${new Date().toISOString().slice(0, 10)}.xlsx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// WhatsApp
export const fetchWhatsAppMessages = async (params = {}) => {
  const res = await api.get('/whatsapp/messages/', { params });
  return res.data;
};

export const importWhatsAppChat = async (rawChat, senderName = 'WhatsApp Group') => {
  const res = await api.post('/whatsapp/import/', { raw_chat: rawChat, sender_name: senderName });
  return res.data;
};

// AI Engine
export const queryAIAssistant = async (prompt, siteId = '', functionName = 'chat') => {
  const res = await api.post('/ai/query/', { query: prompt, site_id: siteId, function: functionName });
  return res.data;
};

// Reports Analytics
export const fetchReportsAnalytics = async (params = {}) => {
  const res = await api.get('/reports/analytics/', { params });
  return res.data;
};

// Notifications
export const fetchNotifications = async (params = {}) => {
  const res = await api.get('/notifications/', { params });
  return res.data;
};

export const markAllNotificationsRead = async (params = {}) => {
  const res = await api.post('/notifications/mark_all_read/', null, { params });
  return res.data;
};

// Health Check & WhatsApp Direct Creation
export const checkServerHealth = async () => {
  try {
    const res = await api.get('/dashboard/stats/', { timeout: 8000 });
    return res.status === 200;
  } catch (err) {
    console.warn('Server health check error:', err);
    return false;
  }
};

export const createWhatsAppMessage = async (waData) => {
  const res = await api.post('/whatsapp/messages/', waData);
  return res.data;
};

// Daily Availability API Helpers
export const fetchAvailabilityStats = async (params = {}) => {
  const res = await api.get('/availability/stats/', { params });
  return res.data;
};

export const fetchAvailabilityRecords = async (params = {}) => {
  const res = await api.get('/availability/records/', { params });
  return res.data;
};

export const fetchAvailabilityArchives = async () => {
  const res = await api.get('/availability/archives/');
  return res.data;
};

export const uploadAvailabilityFile = async (formData) => {
  const res = await api.post('/availability/upload/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  });
  return res.data;
};

export const resetBaseAvailability = async (uploaderName) => {
  const res = await api.post('/availability/reset_base/', { uploaded_by: uploaderName });
  return res.data;
};

export const exportAvailabilityExcel = async (params = {}) => {
  const res = await api.get('/availability/export/', {
    params,
    responseType: 'blob'
  });
  return res.data;
};

// Site to FSE Lookup Helpers
export const lookupSiteFSE = async (payload) => {
  const res = await api.post('/sites/lookup_fse/', payload);
  return res.data;
};

export const exportSiteFSEExcel = async (payload) => {
  const res = await api.post('/sites/lookup_fse/export_excel/', payload, {
    responseType: 'blob'
  });
  return res.data;
};

// Hourly Availability API Helpers
export const fetchHourlyAvailabilityStats = async (params = {}) => {
  const res = await api.get('/hourly_availability/stats/', { params });
  return res.data;
};

export const fetchHourlyAvailabilityRecords = async (params = {}) => {
  const res = await api.get('/hourly_availability/records/', { params });
  return res.data;
};

export const uploadHourlyAvailabilityFile = async (formData) => {
  const res = await api.post('/hourly_availability/upload/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000
  });
  return res.data;
};

export const resetHourlyBaseAvailability = async (uploaderName) => {
  const res = await api.post('/hourly_availability/reset_base/', { uploaded_by: uploaderName });
  return res.data;
};

// 4G LTE KML Cell Sectors API Helpers
export const fetchSiteCellSectors = async (siteId) => {
  const res = await api.get(`/sites/${encodeURIComponent(siteId)}/sectors/`);
  return res.data;
};

export const fetchCellSectors = async (params = {}) => {
  const res = await api.get('/sectors/', { params });
  return res.data;
};

export const fetchKmlStats = async () => {
  const res = await api.get('/kml/stats/');
  return res.data;
};

export const importKmlFile = async (formData) => {
  const res = await api.post('/kml/import/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  });
  return res.data;
};



