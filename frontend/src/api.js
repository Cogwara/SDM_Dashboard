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

const getBaseUrl = () => {
  const savedIp = localStorage.getItem('fct_sdm_server_ip');
  const nativeApp = checkIsCapacitorNative();
  
  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname || 'localhost';
    const currentPort = window.location.port;

    // In web browser, clear stale default mobile IP fallback if stored
    if (!nativeApp && savedIp && (savedIp.trim() === '192.168.1.2' || savedIp.trim() === 'localhost' || savedIp.trim() === '127.0.0.1' || savedIp.trim() === currentHost)) {
      localStorage.removeItem('fct_sdm_server_ip');
    } else if (savedIp && savedIp.trim()) {
      let host = cleanHost(savedIp);
      if (!host.includes(':')) {
        host = `${host}:8000`;
      }
      return `http://${host}/api/v1`;
    }

    // If running inside Capacitor APK on mobile device, default to 192.168.1.2:8000
    if (nativeApp) {
      const mobileHost = (savedIp && savedIp.trim()) ? cleanHost(savedIp) : '192.168.1.2';
      const formattedHost = mobileHost.includes(':') ? mobileHost : `${mobileHost}:8000`;
      return `http://${formattedHost}/api/v1`;
    }

    // Vite dev server runs on 5173, backend Django runs on 8000
    if (currentPort === '5173') {
      return `http://${currentHost}:8000/api/v1`;
    }

    // Nginx / Docker container (port 80 or 443) proxies /api/
    if (!currentPort || currentPort === '80' || currentPort === '443') {
      return `/api/v1`;
    }

    return `http://${currentHost}:8000/api/v1`;
  }

  return `http://localhost:8000/api/v1`;
};

export const API_BASE_URL = getBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 25000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Update base URL dynamically when server IP changes
export const setCustomServerIp = (ip) => {
  const currentHost = typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost';
  const nativeApp = checkIsCapacitorNative();

  if (ip && ip.trim()) {
    const trimmed = ip.trim();
    if (!nativeApp && (trimmed === '192.168.1.2' || trimmed === 'localhost' || trimmed === '127.0.0.1' || trimmed === currentHost)) {
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

export const fetchSDMList = async () => {
  const res = await api.get('/auth/sdms/');
  return res.data;
};

export const registerSDM = async (sdmData) => {
  const res = await api.post('/auth/register_sdm/', sdmData);
  return res.data;
};

export const assignStateToSDM = async (sdmName, stateName = '', sdmPhone = '', siteIds = null) => {
  const payload = { sdm_name: sdmName, sdm_phone: sdmPhone };
  if (siteIds) {
    payload.site_ids = siteIds;
  }
  if (stateName) {
    payload.state = stateName;
  }
  const res = await api.post('/auth/assign_state/', payload);
  return res.data;
};

export const fetchAvailableStates = async () => {
  const res = await api.get('/auth/states/');
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
    const res = await api.get('/dashboard/stats/', { timeout: 3000 });
    return res.status === 200;
  } catch {
    return false;
  }
};

export const createWhatsAppMessage = async (waData) => {
  const res = await api.post('/whatsapp/messages/', waData);
  return res.data;
};

