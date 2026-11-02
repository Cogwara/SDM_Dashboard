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

export const DEFAULT_MOBILE_SERVER_URL = 'https://ice-powerseller-clerk-where.trycloudflare.com';
export const FALLBACK_TUNNEL_URL = 'https://obligations-ecommerce-gospel-nhs.trycloudflare.com';

const KNOWN_STALE_TUNNELS = [
  'warm-tennis-touch-kansas.trycloudflare.com',
  'graduate-summaries-joy-tenant.trycloudflare.com',
];

const isStaleCloudflareTunnel = (url) => {
  if (!url || !url.includes('.trycloudflare.com')) return false;
  return KNOWN_STALE_TUNNELS.some((stale) => url.includes(stale));
};

const formatServerBaseUrl = (rawInput) => {
  const raw = rawInput.trim().replace(/\/+$/, '');
  if (raw.endsWith('/api/v1')) {
    return raw;
  }
  if (/^https?:\/\//i.test(raw)) {
    return `${raw}/api/v1`;
  }
  const cleanH = cleanHost(raw);
  if (cleanH.includes('.trycloudflare.com') || cleanH.includes('.vercel.app') || (cleanH.includes('.') && !/^\d+\.\d+\.\d+\.\d+$/.test(cleanH.split(':')[0]))) {
    return `https://${cleanH}/api/v1`;
  }
  const formattedHost = cleanH.includes(':') ? cleanH : `${cleanH}:8001`;
  return `http://${formattedHost}/api/v1`;
};

const getBaseUrl = () => {
  const nativeApp = checkIsCapacitorNative();
  const currentHost = typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost';
  const isVercel = currentHost.endsWith('.vercel.app');

  let savedIp = localStorage.getItem('fct_sdm_server_ip');
  if (savedIp && isStaleCloudflareTunnel(savedIp)) {
    savedIp = null;
    localStorage.removeItem('fct_sdm_server_ip');
  }

  if (typeof window !== 'undefined') {
    // Always honor any custom IP / web address configured by the user
    if (savedIp && savedIp.trim()) {
      return formatServerBaseUrl(savedIp);
    }

    // Default for Capacitor APK or Vercel when no custom IP is set
    if (nativeApp || isVercel) {
      return `${DEFAULT_MOBILE_SERVER_URL}/api/v1`;
    }

    return `/api/v1`;
  }

  return `/api/v1`;
};

export const getMediaUrl = (fileUrl) => {
  if (!fileUrl) return '';
  if (typeof fileUrl !== 'string') return '';
  if (fileUrl.startsWith('data:') || fileUrl.startsWith('blob:')) return fileUrl;
  if (typeof window === 'undefined') return fileUrl;

  let mediaPath = fileUrl.trim();
  if (mediaPath.includes('/media/')) {
    mediaPath = '/media/' + mediaPath.split('/media/')[1];
  } else if (mediaPath.startsWith('media/')) {
    mediaPath = '/' + mediaPath;
  } else if (
    mediaPath.startsWith('attachments/') ||
    mediaPath.startsWith('avatars/') ||
    mediaPath.startsWith('downloads/')
  ) {
    mediaPath = '/media/' + mediaPath;
  } else if (!mediaPath.startsWith('/')) {
    mediaPath = '/media/' + mediaPath;
  }

  const nativeApp = checkIsCapacitorNative();
  const currentHost = window.location.hostname || 'localhost';
  const isVercel = currentHost.endsWith('.vercel.app');

  let savedIp = localStorage.getItem('fct_sdm_server_ip');
  if (savedIp && isStaleCloudflareTunnel(savedIp)) {
    savedIp = null;
    localStorage.removeItem('fct_sdm_server_ip');
  }

  if (savedIp && savedIp.trim()) {
    const base = formatServerBaseUrl(savedIp).replace(/\/api\/v1$/, '');
    return `${base}${mediaPath}`;
  }

  if (!nativeApp && window.location.protocol.startsWith('http')) {
    if (isVercel) {
      return `${window.location.origin}${mediaPath}`;
    }
    return `${window.location.origin}${mediaPath}`;
  }

  return `${DEFAULT_MOBILE_SERVER_URL}${mediaPath}`;
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
    let base = getBaseUrl();
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      const isVercelHost = typeof window !== 'undefined' && (window.location.hostname || '').endsWith('.vercel.app');
      if (base.includes('.vercel.app') || (isVercelHost && base === '/api/v1')) {
        base = `${DEFAULT_MOBILE_SERVER_URL}/api/v1`;
      }
      if (config.headers) {
        delete config.headers['Content-Type'];
      }
    }
    config.baseURL = base;
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
  if (ip && ip.trim()) {
    const trimmed = ip.trim();
    if (isStaleCloudflareTunnel(trimmed)) {
      localStorage.setItem('fct_sdm_server_ip', DEFAULT_MOBILE_SERVER_URL);
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

export const fetchMapSites = async (params = {}) => {
  try {
    const res = await api.get('/sites/map_sites/', { params });
    if (Array.isArray(res.data)) {
      return res.data;
    }
    if (res.data && res.data.results) {
      return res.data.results;
    }
    return res.data || [];
  } catch (err) {
    const fallback = await fetchSites(params);
    return fallback.results || fallback || [];
  }
};

export const lookupSite = async (siteId) => {
  const res = await api.get('/sites/lookup/', { params: { site_id: siteId } });
  return res.data;
};

export const fetchFilterOptions = async (params = {}) => {
  const res = await api.get('/sites/filter_options/', { params });
  return res.data;
};

export const geocodeLocation = async (query, stateCode = '') => {
  if (!query || !query.trim()) return [];
  const cleanQ = query.trim();

  // 1. Try backend geocode endpoint
  try {
    const res = await api.get('/sites/geocode/', {
      params: { q: cleanQ, state: stateCode },
      timeout: 8000
    });
    if (res.data && Array.isArray(res.data.results) && res.data.results.length > 0) {
      return res.data.results;
    }
  } catch (err) {
    console.warn('Backend geocode unavailable or timed out, trying direct OSM fallback...', err);
  }

  // 2. Direct browser fallback to OpenStreetMap Nominatim
  try {
    const viewbox = (!stateCode || stateCode.toUpperCase().includes('FCT') || stateCode.toUpperCase().includes('ABUJA'))
      ? '&viewbox=6.75,9.40,7.80,8.25'
      : '';
    const encoded = encodeURIComponent(cleanQ);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&countrycodes=ng${viewbox}&limit=6&addressdetails=1`;
    const response = await axios.get(url, {
      headers: { 'Accept': 'application/json' },
      timeout: 5000
    });
    if (Array.isArray(response.data)) {
      return response.data.map(item => ({
        type: 'street_or_area',
        title: item.name || (item.display_name ? item.display_name.split(',')[0] : cleanQ),
        display_name: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        category: item.type || item.class || 'place'
      })).filter(x => !isNaN(x.lat) && !isNaN(x.lng));
    }
  } catch (fallbackErr) {
    console.error('Nominatim geocode fallback failed:', fallbackErr);
  }

  return [];
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
    return res.status === 200 && res.data && typeof res.data === 'object' && ('total_sites' in res.data);
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
    timeout: 300000
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

// WSD Master Dataset API Helpers
export const fetchWSDStatus = async () => {
  const res = await api.get('/wsd/status/');
  return res.data;
};

export const uploadWSDFile = async (formData) => {
  const res = await api.post('/wsd/upload/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000
  });
  return res.data;
};

export const resetBaseWSD = async (uploaderName) => {
  const res = await api.post('/wsd/reset_base/', { uploaded_by: uploaderName });
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
    timeout: 300000
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



