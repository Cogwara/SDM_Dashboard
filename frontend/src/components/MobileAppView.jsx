import React, { useState, useEffect } from 'react';
import { 
  Smartphone, Wifi, WifiOff, RefreshCw, FileText, MessageSquare, 
  CheckCircle2, AlertTriangle, Layers, Clock, UploadCloud, Trash2, Camera, ShieldCheck,
  Server, User, LogOut, Lock, Settings, Bot, Search, Send, Sparkles, Filter, ChevronRight, Zap, Shield, MapPin, Radio, Phone, UserCheck, X, Maximize2, BarChart3, Edit3, Palette, Sun, Moon, TrendingUp, Building2, Network, ArrowLeft, Activity, Plus
} from 'lucide-react';
import { 
  getPendingNotes, getPendingWhatsApp, getPendingFseAudits, saveOfflineNote, saveOfflineWhatsApp, saveOfflineFseAudit,
  removePendingNote, removePendingWhatsApp, removePendingFseAudit, clearPendingQueue, getPendingTotalCount,
  getCachedSites, saveCachedSites, clearCachedSites, getLastSyncTime 
} from '../mobileOfflineStorage';
import { 
  checkServerHealth, createNote, updateNote, createWhatsAppMessage, fetchSites, setCustomServerIp,
  fetchNotes, resolveNote, deleteNote, fetchWhatsAppMessages, queryAIAssistant,
  fetchDashboardStats, lookupSite
} from '../api';
import { getSDMStateInfo } from '../utils/userUtils';
import GeoMap from './GeoMap';
import SiteFseInspector from './SiteFseInspector';
import TNLLinksDirectory from './TNLLinksDirectory';
import ReportsAnalytics from './ReportsAnalytics';
import SiteProfile from './SiteProfile';
import SDMUserManagement from './SDMUserManagement';
import ConfirmDeleteModal from './ConfirmDeleteModal';

const fileToBase64 = (file) => {
  return new Promise((resolve) => {
    if (!file || typeof file === 'string') return resolve(file);
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => resolve(e.target.result);
      img.onload = () => {
        try {
          const MAX_DIM = 1000;
          let w = img.width;
          let h = img.height;
          if (w > MAX_DIM || h > MAX_DIM) {
            if (w > h) {
              h = Math.round((h * MAX_DIM) / w);
              w = MAX_DIM;
            } else {
              w = Math.round((w * MAX_DIM) / h);
              h = MAX_DIM;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.75));
        } catch {
          resolve(e.target.result);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

const base64ToFile = (dataurl, filename = 'photo.jpg') => {
  if (!dataurl || typeof dataurl !== 'string' || !dataurl.startsWith('data:')) {
    return null;
  }
  try {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  } catch (e) {
    console.error('Failed to convert base64 to file:', e);
    return null;
  }
};

const watermarkPhoto = async (fileObj, siteId, userSdmName) => {
  return new Promise((resolve) => {
    if (!fileObj || typeof fileObj === 'string') return resolve(fileObj);

    const getLocationPromise = new Promise((resLoc) => {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude.toFixed(5);
            const lon = pos.coords.longitude.toFixed(5);
            resLoc(`GPS: Lat ${lat}°, Lon ${lon}°`);
          },
          () => resLoc('GPS: FCT Location'),
          { timeout: 3000 }
        );
      } else {
        resLoc('GPS: FCT Location');
      }
    });

    const reader = new FileReader();
    reader.onerror = () => resolve(fileObj);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => {
        console.warn('Image load error during watermarking, preserving original file');
        resolve(fileObj);
      };
      img.onload = async () => {
        try {
          const gpsResult = await getLocationPromise;

          const MAX_DIM = 1200;
          let targetWidth = img.width;
          let targetHeight = img.height;
          if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
            if (targetWidth > targetHeight) {
              targetHeight = Math.round((targetHeight * MAX_DIM) / targetWidth);
              targetWidth = MAX_DIM;
            } else {
              targetWidth = Math.round((targetWidth * MAX_DIM) / targetHeight);
              targetHeight = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');

          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          const now = new Date();
          const dateStr = now.toISOString().slice(0, 10) + ' ' + now.toLocaleTimeString();
          const siteStr = siteId ? `SITE ID: ${siteId.toUpperCase()}` : 'SITE ID: N/A';
          const authorStr = userSdmName ? `ENGINEER: ${userSdmName}` : 'ENGINEER: SDM FIELD';
          const locationStr = gpsResult ? gpsResult.replace('GPS: ', 'LOCATION: ') : 'LOCATION: FCT';

          const lines = [
            siteStr,
            `DATE/TIME: ${dateStr}`,
            locationStr,
            authorStr
          ];

          // Compact font size
          const fontSize = Math.max(12, Math.floor(targetHeight * 0.025));
          const lineSpacing = fontSize * 1.35;
          const bannerPadding = 12;
          const bannerHeight = Math.floor(lines.length * lineSpacing + bannerPadding * 2);

          // Semi-transparent dark background overlay at bottom
          ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
          ctx.fillRect(0, targetHeight - bannerHeight, targetWidth, bannerHeight);

          // Top thin red accent border line
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(0, targetHeight - bannerHeight, targetWidth, Math.max(2, Math.floor(fontSize * 0.15)));

          // Set font & bright red text color
          ctx.font = `bold ${fontSize}px monospace, sans-serif`;
          ctx.fillStyle = '#ef4444';

          // Render each item on its own new line
          lines.forEach((lineText, index) => {
            const y = targetHeight - bannerHeight + bannerPadding + (index + 1) * lineSpacing - 4;
            ctx.fillText(lineText, 16, y);
          });

          // Sanitize filename
          const rawName = (fileObj.name || 'photo.jpg').split('/').pop().split('\\').pop();
          const cleanName = rawName.includes('.') ? rawName : `${rawName}.jpg`;

          canvas.toBlob((blob) => {
            if (!blob) return resolve(fileObj);
            const watermarkedFile = new File([blob], `wm_${cleanName}`, { type: 'image/jpeg' });
            resolve(watermarkedFile);
          }, 'image/jpeg', 0.78);
        } catch (err) {
          console.error('Canvas watermark processing error:', err);
          resolve(fileObj);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(fileObj);
  });
};

export default function MobileAppView({ currentUser, onLogout, onSelectSite, currentTheme = 'sky', onThemeChange }) {
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview', 'sites', 'map', 'fse', 'tnl', 'note', 'whatsapp', 'ai', 'reports', 'queue', 'admin', 'profile'
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingNotes, setPendingNotes] = useState(getPendingNotes());
  const [pendingWa, setPendingWa] = useState(getPendingWhatsApp());
  const [pendingAudits, setPendingAudits] = useState(getPendingFseAudits());
  const [cachedSites, setCachedSites] = useState(getCachedSites());
  const [syncStatusMsg, setSyncStatusMsg] = useState(null);

  const handleMobileSelectSite = (siteId) => {
    if (!siteId) return;
    setSelectedSiteId(siteId);
    setActiveSubTab('profile');
    if (onSelectSite) onSelectSite(siteId);
  };

  // Mobile Theme State
  const [theme, setTheme] = useState(() => localStorage.getItem('fct_sdm_theme') || currentTheme || 'sky');
  const [showThemeModal, setShowThemeModal] = useState(false);

  const mobileThemes = [
    { id: 'sky', label: 'Skyblueish Glass (Default)', icon: Sparkles, color: 'text-cyan-400' },
    { id: 'dark', label: 'Obsidian Midnight Dark', icon: Moon, color: 'text-indigo-400' },
    { id: 'emerald', label: 'Tactical Emerald Field', icon: Shield, color: 'text-emerald-400' },
    { id: 'light', label: 'Daylight Executive Light', icon: Sun, color: 'text-amber-400' },
  ];

  const handleApplyTheme = (newTheme) => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('fct_sdm_theme', newTheme);
    if (onThemeChange) onThemeChange(newTheme);
    setShowThemeModal(false);
  };

  // Live Server Data States
  const [dashboardStats, setDashboardStats] = useState(null);
  const [liveNotes, setLiveNotes] = useState([]);
  const [liveWa, setLiveWa] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  // Filters & Search
  const [siteSearch, setSiteSearch] = useState('');
  const [noteCategoryFilter, setNoteCategoryFilter] = useState('All');
  const [notePriorityFilter, setNotePriorityFilter] = useState('All');
  const [waIssueFilter, setWaIssueFilter] = useState('All');
  const [selectedSiteDetail, setSelectedSiteDetail] = useState(null);
  const [lightboxImg, setLightboxImg] = useState(null);

  // AI Assistant Mobile State
  const [aiQuery, setAiQuery] = useState('');
  const [aiMessages, setAiMessages] = useState([
    { sender: 'ai', text: '👋 Hello! I am your FCT SDM Mobile Field Assistant. Ask me about site outage diagnostics, generator faults, fuel calculations, or operational guidelines.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  ]);
  const [aiLoading, setAiLoading] = useState(false);

  const isMobileNative = typeof window !== 'undefined' && Boolean(
    (window.Capacitor?.isNativePlatform?.() && window.Capacitor?.getPlatform?.() !== 'web') ||
    (window.Capacitor?.getPlatform?.() === 'android' || window.Capacitor?.getPlatform?.() === 'ios') ||
    window.location.protocol === 'capacitor:' || 
    window.location.protocol === 'file:'
  );
  const defaultIp = isMobileNative 
    ? '192.168.1.120' 
    : (typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost');

  // Server IP Config state
  const [serverIp, setServerIp] = useState(() => localStorage.getItem('fct_sdm_server_ip') || defaultIp);
  const [showServerConfig, setShowServerConfig] = useState(false);

  // Form states for New Offline Note
  const toLocalISOString = (d) => {
    if (!d) return '';
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return '';
    const tzOffset = dateObj.getTimezoneOffset() * 60000;
    return new Date(dateObj.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const noteCategories = [
    'Power', 'Transmission', 'Generator', 'Battery', 'Fuel', 
    'Microwave', 'RAN', 'Fiber', 'Security', 'SA Alarms', 'Customer', 
    'Preventive Maintenance', 'Corrective Maintenance', 'General'
  ];
  const notePriorities = ['Critical', 'High', 'Medium', 'Low'];
  const noteStatuses = ['Open', 'In Progress', 'Resolved', 'Escalated'];

  const [editingNote, setEditingNote] = useState(null);
  const [noteSiteId, setNoteSiteId] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteIncidentTime, setNoteIncidentTime] = useState(() => toLocalISOString(new Date()));
  const [noteCategory, setNoteCategory] = useState('Generator');
  const [notePriority, setNotePriority] = useState('Medium');
  const [noteStatus, setNoteStatus] = useState('Open');
  const [noteCreatedBy, setNoteCreatedBy] = useState(() => currentUser?.full_name || currentUser?.username || 'State Delivery Manager');
  const [noteDescription, setNoteDescription] = useState('');
  const [noteAppendUpdate, setNoteAppendUpdate] = useState('');
  const [notePhotos, setNotePhotos] = useState([]);
  const [notePhotoPreviews, setNotePhotoPreviews] = useState([]);

  // Form states for New WhatsApp Intel
  const [waSiteId, setWaSiteId] = useState('');
  const [waSender, setWaSender] = useState(currentUser?.full_name || 'Field SDM Engineer');
  const [waMessage, setWaMessage] = useState('');

  // Fetch Live Server Feeds & Stats
  const loadLiveServerFeeds = async () => {
    const reachable = await checkServerHealth();
    setIsOnline(reachable);

    if (reachable && currentUser) {
      setLoadingData(true);
      try {
        const sdmParam = !currentUser.is_superuser ? (currentUser.full_name || currentUser.username) : undefined;
        const [statsRes, notesRes, waRes, sitesRes] = await Promise.allSettled([
          fetchDashboardStats({ sdm: sdmParam }),
          fetchNotes({ sdm: sdmParam, page_size: 25 }),
          fetchWhatsAppMessages({ sdm: sdmParam, page_size: 25 }),
          fetchSites({ sdm: sdmParam, page_size: 25000 })
        ]);

        if (statsRes.status === 'fulfilled') setDashboardStats(statsRes.value);
        if (notesRes.status === 'fulfilled') setLiveNotes(notesRes.value.results || notesRes.value || []);
        if (waRes.status === 'fulfilled') setLiveWa(waRes.value.results || waRes.value || []);
        if (sitesRes.status === 'fulfilled') {
          const list = Array.isArray(sitesRes.value) ? sitesRes.value : sitesRes.value.results || [];
          saveCachedSites(list);
          setCachedSites(list);
        }
      } catch (e) {
        console.error('Failed to load mobile live data:', e);
      } finally {
        setLoadingData(false);
      }
    } else if (!currentUser) {
      clearCachedSites();
      setCachedSites([]);
    }
  };

  useEffect(() => {
    loadLiveServerFeeds();
    const interval = setInterval(loadLiveServerFeeds, 15000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const refreshPendingQueues = () => {
    setPendingNotes(getPendingNotes());
    setPendingWa(getPendingWhatsApp());
    setPendingAudits(getPendingFseAudits());
  };

  // Perform full network sync when in range of server
  const handleSyncNow = async () => {
    const reachable = await checkServerHealth();
    if (!reachable) {
      setSyncStatusMsg({ type: 'error', text: '🔴 Cannot sync: Server network unreachable. Please check PC & phone Wi-Fi connection.' });
      return;
    }

    const currentNotes = getPendingNotes();
    const currentWa = getPendingWhatsApp();

    if (currentNotes.length === 0 && currentWa.length === 0) {
      setSyncStatusMsg({ type: 'info', text: 'ℹ️ Offline queue is empty. 0 pending items waiting to sync.' });
      return;
    }

    setIsSyncing(true);
    setSyncStatusMsg({ type: 'info', text: '⚡ Synchronizing offline SDM notes & WhatsApp intel to server...' });

    let syncedNotesCount = 0;
    let syncedWaCount = 0;
    let failedNotesCount = 0;
    let failedWaCount = 0;
    let errorDetails = [];

    // 1. Sync Pending Notes
    for (const note of currentNotes) {
      try {
        const formData = new FormData();
        const siteStr = (note.site_id_str || note.site_id_input || note.site || '').toString().trim();
        formData.append('site_id_input', siteStr);
        formData.append('site_id_str', siteStr);
        formData.append('title', note.title || 'SDM Note');
        formData.append('category', note.category || 'General');
        formData.append('priority', note.priority || 'Medium');
        formData.append('description', note.description || '');
        formData.append('created_by', note.created_by || currentUser?.full_name || 'Mobile SDM');
        if (note.created_at) {
          formData.append('created_at', note.created_at);
        }

        if (note.photos && Array.isArray(note.photos)) {
          note.photos.forEach((photoItem, idx) => {
            if (photoItem && typeof photoItem === 'string' && photoItem.startsWith('data:')) {
              const fileObj = base64ToFile(photoItem, `offline_photo_${idx + 1}.jpg`);
              if (fileObj) {
                formData.append('photos', fileObj);
              }
            } else if (photoItem && photoItem instanceof File) {
              formData.append('photos', photoItem);
            }
          });
        }

        await createNote(formData);
        removePendingNote(note.local_id);
        syncedNotesCount++;
      } catch (e) {
        failedNotesCount++;
        const errMsg = e.response?.data?.error || e.message || 'Server error';
        errorDetails.push(`Note for ${note.site_id_str || 'Site'}: ${errMsg}`);
        console.error('Failed to sync note:', note, e);
      }
    }

    // 2. Sync Pending WhatsApp Messages
    for (const wa of currentWa) {
      try {
        const siteStr = (wa.site_id_str || wa.site_id_input || '').toString().trim();
        await createWhatsAppMessage({
          site_id_str: siteStr,
          site_id_input: siteStr,
          sender_name: wa.sender_name || currentUser?.full_name || 'Mobile Engineer',
          message_text: wa.message_text
        });
        removePendingWhatsApp(wa.local_id);
        syncedWaCount++;
      } catch (e) {
        failedWaCount++;
        const errMsg = e.response?.data?.error || e.message || 'Server error';
        errorDetails.push(`WhatsApp for ${wa.site_id_str || 'Site'}: ${errMsg}`);
        console.error('Failed to sync WhatsApp message:', wa, e);
      }
    }

    refreshPendingQueues();
    setIsSyncing(false);
    localStorage.setItem('sdm_last_sync_time', new Date().toLocaleTimeString());
    loadLiveServerFeeds();

    const totalFailed = failedNotesCount + failedWaCount;
    if (totalFailed === 0) {
      setSyncStatusMsg({
        type: 'success',
        text: `✅ Network Sync Complete! Successfully uploaded ${syncedNotesCount} SDM note(s) and ${syncedWaCount} WhatsApp intel update(s) to server.`
      });
      alert(`✅ Network Sync Complete!\nUploaded ${syncedNotesCount} note(s) & ${syncedWaCount} WhatsApp intel update(s) to server.`);
    } else {
      const firstErr = errorDetails[0] || 'Check site ID or server status';
      setSyncStatusMsg({
        type: 'warning',
        text: `⚠️ Sync finished: Uploaded ${syncedNotesCount} note(s) & ${syncedWaCount} intel update(s). ${totalFailed} item(s) failed (${firstErr}).`
      });
      alert(`⚠️ Sync Completed with Issues:\nUploaded: ${syncedNotesCount} note(s) & ${syncedWaCount} intel update(s).\n\nFailed items (${totalFailed}):\n- ${errorDetails.join('\n- ')}`);
    }
  };

  // Handle Photo Picker with Automatic Location, Site ID & Timestamp Watermarking
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false);

  const handlePhotoChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsProcessingPhotos(true);
    try {
      const watermarkedFiles = await Promise.all(
        files.map(file => watermarkPhoto(file, noteSiteId, currentUser?.full_name || currentUser?.username))
      );

      setNotePhotos(prev => [...prev, ...watermarkedFiles]);
      const previews = watermarkedFiles.map(file => URL.createObjectURL(file));
      setNotePhotoPreviews(prev => [...prev, ...previews]);
    } catch (err) {
      console.error('Error watermarking photo:', err);
    } finally {
      setIsProcessingPhotos(false);
      try { e.target.value = ''; } catch {}
    }
  };

  // Save Server IP from Mobile UI
  const handleSaveServerIp = (e) => {
    e.preventDefault();
    if (!serverIp.trim()) return;
    setCustomServerIp(serverIp.trim());
    setShowServerConfig(false);
    setSyncStatusMsg({ type: 'info', text: `🔄 Server IP updated to http://${serverIp.trim()}:8001. Re-testing server connection...` });
    loadLiveServerFeeds();
  };

  // Open Edit Note Form
  const handleOpenEditNote = (note) => {
    setEditingNote(note);
    setNoteSiteId(note.site_ihs_id || note.site_id_str || note.site_id_input || '');
    setNoteTitle(note.title || '');
    setNoteCategory(note.category || 'General');
    setNotePriority(note.priority || 'Medium');
    setNoteStatus(note.status || 'Open');
    setNoteCreatedBy(note.created_by || currentUser?.full_name || 'State Delivery Manager');
    setNoteIncidentTime(note.created_at ? toLocalISOString(note.created_at) : toLocalISOString(new Date()));
    setNoteDescription(note.description || '');
    setNoteAppendUpdate('');
    setNotePhotos([]);
    setNotePhotoPreviews([]);
    setActiveSubTab('note');
  };

  const handleResetNoteForm = () => {
    setEditingNote(null);
    setNoteSiteId('');
    setNoteTitle('');
    setNoteCategory('Generator');
    setNotePriority('Medium');
    setNoteStatus('Open');
    setNoteCreatedBy(currentUser?.full_name || 'State Delivery Manager');
    setNoteIncidentTime(toLocalISOString(new Date()));
    setNoteDescription('');
    setNoteAppendUpdate('');
    setNotePhotos([]);
    setNotePhotoPreviews([]);
  };

  // Save or Update Note
  const [isSavingNote, setIsSavingNote] = useState(false);

  const handleSaveNote = async (e) => {
    e.preventDefault();
    if (!noteSiteId || !noteSiteId.trim()) {
      alert('⚠️ Please enter a Target Site ID (e.g. FC2700).');
      return;
    }
    if (!noteTitle || !noteTitle.trim()) {
      alert('⚠️ Please enter a Note Title.');
      return;
    }
    if (!noteDescription || !noteDescription.trim()) {
      alert('⚠️ Please enter a Detailed Operational Description.');
      return;
    }

    const activeUser = currentUser || { full_name: 'Field SDM Engineer', username: 'field_sdm' };
    const authorName = noteCreatedBy.trim() || activeUser.full_name || activeUser.username || 'State Delivery Manager';
    setIsSavingNote(true);

    try {
      let finalDescription = noteDescription.trim();
      if (noteAppendUpdate && noteAppendUpdate.trim()) {
        const timestamp = new Date().toLocaleString();
        const updateHeader = `\n\n--- [UPDATE by ${authorName} @ ${timestamp}] ---\n`;
        finalDescription = finalDescription + updateHeader + noteAppendUpdate.trim();
      }

      const base64Photos = await Promise.all((notePhotos || []).map(f => fileToBase64(f)));
      const cleanPhotos = base64Photos.filter(Boolean);

      const notePayload = {
        site_id_str: noteSiteId.trim().toUpperCase(),
        site_id_input: noteSiteId.trim().toUpperCase(),
        title: noteTitle.trim(),
        category: noteCategory,
        priority: notePriority,
        status: noteStatus,
        description: finalDescription,
        created_by: authorName,
        created_at: noteIncidentTime ? new Date(noteIncidentTime).toISOString() : new Date().toISOString(),
        photos: cleanPhotos
      };

      if (editingNote && editingNote.id) {
        // Editing existing note online
        if (isOnline) {
          const formData = new FormData();
          formData.append('site_id_input', notePayload.site_id_str);
          formData.append('site_id_str', notePayload.site_id_str);
          formData.append('title', notePayload.title);
          formData.append('category', notePayload.category);
          formData.append('priority', notePayload.priority);
          formData.append('status', notePayload.status);
          formData.append('description', notePayload.description);
          formData.append('created_by', notePayload.created_by);
          if (noteIncidentTime) {
            formData.append('created_at', noteIncidentTime);
          }
          notePhotos.forEach(file => {
            formData.append('photos', file);
          });

          await updateNote(editingNote.id, formData);
          setSyncStatusMsg({ type: 'success', text: `🟢 Note updated successfully on server for site ${notePayload.site_id_str}!` });
          alert(`✅ Success! Note for site ${notePayload.site_id_str} updated.`);
          loadLiveServerFeeds();
        } else {
          alert('⚠️ Network offline: Note updates require an online connection.');
        }
      } else {
        // Creating new note
        if (isOnline) {
          try {
            const formData = new FormData();
            formData.append('site_id_input', notePayload.site_id_str);
            formData.append('site_id_str', notePayload.site_id_str);
            formData.append('title', notePayload.title);
            formData.append('category', notePayload.category);
            formData.append('priority', notePayload.priority);
            formData.append('status', notePayload.status);
            formData.append('description', notePayload.description);
            formData.append('created_by', notePayload.created_by);
            if (noteIncidentTime) {
              formData.append('created_at', noteIncidentTime);
            }
            notePhotos.forEach(file => {
              formData.append('photos', file);
            });

            await createNote(formData);
            setSyncStatusMsg({ type: 'success', text: `🟢 Note created & saved directly to server for site ${notePayload.site_id_str}!` });
            alert(`✅ Success! Note for site ${notePayload.site_id_str} saved to server.`);
            loadLiveServerFeeds();
          } catch (e) {
            saveOfflineNote(notePayload);
            refreshPendingQueues();
            const serverErr = e.response?.data?.error || e.message || 'Server network error';
            setSyncStatusMsg({ type: 'warning', text: `📦 Note saved to Offline Queue (${serverErr}). It will auto-sync when server connects.` });
            alert(`📦 Saved to Offline Queue! Note for site ${notePayload.site_id_str} saved locally for auto-sync.`);
          }
        } else {
          saveOfflineNote(notePayload);
          refreshPendingQueues();
          setSyncStatusMsg({ type: 'warning', text: `📦 Offline Mode: Note saved to local device queue for site ${notePayload.site_id_str}!` });
          alert(`📦 Offline Mode: Note for site ${notePayload.site_id_str} saved to local device queue.`);
        }
      }

      handleResetNoteForm();
    } catch (err) {
      alert('Error saving note: ' + err.message);
    } finally {
      setIsSavingNote(false);
    }
  };

  // Save WhatsApp Intel
  const handleSaveWa = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      setSyncStatusMsg({ type: 'error', text: '🔒 Login Required: You must log in to your SDM account before logging intel.' });
      return;
    }
    if (!waSiteId || !waMessage) return;

    const waPayload = {
      site_id_str: waSiteId.toUpperCase(),
      site_id_input: waSiteId.toUpperCase(),
      sender_name: waSender || currentUser?.full_name || currentUser?.username || 'Mobile Engineer',
      message_text: waMessage
    };

    if (isOnline) {
      try {
        await createWhatsAppMessage(waPayload);
        setSyncStatusMsg({ type: 'success', text: `🟢 WhatsApp Intel logged directly to server for site ${waPayload.site_id_str}!` });
        loadLiveServerFeeds();
      } catch (e) {
        saveOfflineWhatsApp(waPayload);
        refreshPendingQueues();
        setSyncStatusMsg({ type: 'warning', text: `📦 Saved to Offline Queue! Intel will sync when server connection stabilizes.` });
      }
    } else {
      saveOfflineWhatsApp(waPayload);
      refreshPendingQueues();
      setSyncStatusMsg({ type: 'warning', text: `📦 Offline Mode: WhatsApp intel saved to local queue for auto-sync.` });
    }

    setWaSiteId('');
    setWaMessage('');
  };

  // Quick Resolve Live Note
  const handleQuickResolveLiveNote = async (note) => {
    try {
      await resolveNote(note.id, { updated_by: currentUser?.full_name, sdm: currentUser?.full_name, is_superuser: currentUser?.is_superuser });
      loadLiveServerFeeds();
    } catch (e) {
      alert('Error resolving note: ' + (e.response?.data?.error || e.message));
    }
  };

  // Delete Live Note Modal State & Handler
  const [mobileNoteToDelete, setMobileNoteToDelete] = useState(null);
  const [isDeletingMobileNote, setIsDeletingMobileNote] = useState(false);

  const handleDeleteLiveNote = (note) => {
    setMobileNoteToDelete(note);
  };

  const handleConfirmDeleteLiveNote = async () => {
    if (!mobileNoteToDelete) return;
    setIsDeletingMobileNote(true);
    try {
      await deleteNote(mobileNoteToDelete.id, { user: currentUser?.full_name, sdm: currentUser?.full_name, is_superuser: currentUser?.is_superuser });
      setMobileNoteToDelete(null);
      loadLiveServerFeeds();
    } catch (e) {
      alert('Error deleting note: ' + (e.response?.data?.error || e.message));
    } finally {
      setIsDeletingMobileNote(false);
    }
  };

  // Send Mobile AI Prompt
  const handleSendAiPrompt = async (presetPrompt) => {
    const q = presetPrompt || aiQuery;
    if (!q.trim()) return;

    const userMsg = { sender: 'user', text: q, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setAiMessages(prev => [...prev, userMsg]);
    if (!presetPrompt) setAiQuery('');
    setAiLoading(true);

    try {
      const res = await queryAIAssistant(q, '', 'chat');
      const aiMsg = { sender: 'ai', text: res.answer || res.response || 'Analysis complete.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
      setAiMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      const errorMsg = { sender: 'ai', text: '⚠️ Connection error: AI assistant requires active connection to server.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
      setAiMessages(prev => [...prev, errorMsg]);
    } finally {
      setAiLoading(false);
    }
  };

  // Handle Site Card Select in Mobile
  const handleOpenSiteDetail = async (siteItem) => {
    try {
      const fullData = await lookupSite(siteItem.ihs_site_id);
      setSelectedSiteDetail(fullData);
    } catch {
      setSelectedSiteDetail(siteItem);
    }
    if (onSelectSite) onSelectSite(siteItem.ihs_site_id);
  };

  const pendingTotal = pendingNotes.length + pendingWa.length;
  const lastSync = getLastSyncTime();

  // Filtered Sites for Mobile Search
  const filteredCachedSites = cachedSites.filter(site => {
    if (!siteSearch.trim()) return true;
    const q = siteSearch.trim().toLowerCase();
    return (
      (site.ihs_site_id || '').toLowerCase().includes(q) ||
      (site.mtn_id || '').toLowerCase().includes(q) ||
      (site.site_address || '').toLowerCase().includes(q) ||
      (site.state || '').toLowerCase().includes(q) ||
      (site.power_solution || '').toLowerCase().includes(q)
    );
  });

  // Filtered Live Notes
  const filteredLiveNotes = liveNotes.filter(n => {
    if (noteCategoryFilter !== 'All' && n.category !== noteCategoryFilter) return false;
    if (notePriorityFilter !== 'All' && n.priority !== notePriorityFilter) return false;
    return true;
  });

  // Filtered Live WhatsApp
  const filteredLiveWa = liveWa.filter(w => {
    if (waIssueFilter === 'Power' && !w.has_power_issue) return false;
    if (waIssueFilter === 'Generator' && !w.has_generator_issue) return false;
    if (waIssueFilter === 'Fuel' && !w.has_fuel_issue) return false;
    if (waIssueFilter === 'Battery' && !w.has_battery_issue) return false;
    if (waIssueFilter === 'Transmission' && !w.has_transmission_issue) return false;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-16 px-2 sm:px-4">
      {/* Mobile Top Header Banner */}
      <div className="glass-card p-5 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/30">
            <Smartphone className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-extrabold text-white">
                {currentUser?.is_superuser ? 'SDM Field Mobile App' : `${getSDMStateInfo(currentUser).code} SDM Field Mobile App`}
              </h2>
              <span className="text-[10px] font-extrabold px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-500/30">
                {isMobileNative ? 'ANDROID APK NATIVE' : 'MOBILE WEB MODE'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Logged in: <strong className="text-white">{currentUser?.full_name || currentUser?.username || 'Field SDM'}</strong> ({currentUser?.role || 'SDM'})
            </p>
          </div>
        </div>

        {/* Status Indicator & Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowThemeModal(true)}
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all"
            title="Change Mobile App Theme"
          >
            <Palette className="w-3.5 h-3.5 text-cyan-400" />
            <span className="capitalize hidden sm:inline">{theme} Theme</span>
          </button>

          <button
            onClick={() => setShowServerConfig(!showServerConfig)}
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700 text-xs font-mono flex items-center gap-1.5 transition-all"
            title="Configure Server Host IP"
          >
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            <span>IP: {serverIp}</span>
          </button>

          <button
            onClick={loadLiveServerFeeds}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-cyan-400 rounded-xl border border-slate-700 transition-all"
            title="Refresh Network Connection & Feeds"
          >
            <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
          </button>

          <div className={`px-3 py-1 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 ${
            isOnline 
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800' 
              : 'bg-amber-950/80 text-amber-300 border-amber-800 animate-pulse'
          }`}>
            {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-amber-400" />}
            <span>{isOnline ? 'SERVER ONLINE' : 'OFFLINE MODE'}</span>
          </div>
        </div>
      </div>

      {/* Server IP Configuration Panel */}
      {showServerConfig && (
        <div className="glass-panel p-4 rounded-2xl border border-cyan-500/40 bg-slate-900/95 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-cyan-300 flex items-center gap-1.5 font-mono">
              <Server className="w-4 h-4 text-cyan-400" /> CONFIGURE BACKEND SERVER IP ADDRESS
            </h4>
            <button type="button" onClick={() => setShowServerConfig(false)} className="text-slate-400 hover:text-white text-xs">&times;</button>
          </div>
          <p className="text-[11px] text-slate-400">
            Enter host server IP address (e.g. <code className="text-cyan-300 font-mono">192.168.1.120</code>). Target API: <code className="text-cyan-300 font-mono">http://{serverIp}:8001/api/v1</code>
          </p>
          <form onSubmit={handleSaveServerIp} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="e.g. 192.168.1.120"
              value={serverIp}
              onChange={(e) => setServerIp(e.target.value)}
              required
              className="flex-1 bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all"
            >
              Update Server IP
            </button>
          </form>
        </div>
      )}

      {/* Sync Status Banner */}
      {syncStatusMsg && (
        <div className={`p-3.5 rounded-xl text-xs border flex items-center justify-between ${
          syncStatusMsg.type === 'success' ? 'bg-emerald-950/60 text-emerald-200 border-emerald-800' :
          syncStatusMsg.type === 'error' ? 'bg-rose-950/60 text-rose-200 border-rose-800' :
          syncStatusMsg.type === 'info' ? 'bg-cyan-950/60 text-cyan-200 border-cyan-800' :
          'bg-amber-950/60 text-amber-200 border-amber-800'
        }`}>
          <span>{syncStatusMsg.text}</span>
          <button onClick={() => setSyncStatusMsg(null)} className="text-slate-400 hover:text-white text-xs font-bold pl-2">&times;</button>
        </div>
      )}

      {/* Mobile KPI Summary Quick Bar */}
      {dashboardStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="glass-card p-3 rounded-xl border border-slate-800 text-center">
            <div className="text-[10px] text-slate-400 font-bold uppercase">Total Sites</div>
            <div className="text-lg font-extrabold text-white font-mono">{dashboardStats.total_sites || 0}</div>
          </div>
          <div className="glass-card p-3 rounded-xl border border-red-500/30 bg-red-950/20 text-center">
            <div className="text-[10px] text-red-300 font-bold uppercase">Sites Down</div>
            <div className="text-lg font-extrabold text-red-400 font-mono">{dashboardStats.sites_down || 0}</div>
          </div>
          <div className="glass-card p-3 rounded-xl border border-amber-500/30 bg-amber-950/20 text-center">
            <div className="text-[10px] text-amber-300 font-bold uppercase">Critical Sites</div>
            <div className="text-lg font-extrabold text-amber-300 font-mono">{dashboardStats.critical_sites || 0}</div>
          </div>
          <div className="glass-card p-3 rounded-xl border border-cyan-500/30 bg-cyan-950/20 text-center">
            <div className="text-[10px] text-cyan-300 font-bold uppercase">Open Incidents</div>
            <div className="text-lg font-extrabold text-cyan-300 font-mono">{dashboardStats.open_incidents || 0}</div>
          </div>
        </div>
      )}

      {/* Mobile Touch Navigation Sub-Tabs */}
      <div className="flex overflow-x-auto p-1.5 bg-slate-900/95 rounded-2xl border border-slate-800 text-xs font-bold gap-1.5 no-scrollbar shadow-lg sticky top-0 z-30 backdrop-blur-md">
        <button
          onClick={() => { setSelectedSiteId(null); setActiveSubTab('overview'); }}
          className={`py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
            activeSubTab === 'overview' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-cyan-400" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => { setSelectedSiteId(null); setActiveSubTab('sites'); }}
          className={`py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
            activeSubTab === 'sites' || activeSubTab === 'profile' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Layers className="w-4 h-4 text-blue-400" />
          <span>Sites ({cachedSites.length})</span>
        </button>

        <button
          onClick={() => { setSelectedSiteId(null); setActiveSubTab('map'); }}
          className={`py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
            activeSubTab === 'map' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <MapPin className="w-4 h-4 text-emerald-400" />
          <span>Live Map</span>
        </button>

        <button
          onClick={() => { setSelectedSiteId(null); setActiveSubTab('fse'); }}
          className={`py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
            activeSubTab === 'fse' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <span>FSE Audit</span>
        </button>

        <button
          onClick={() => { setSelectedSiteId(null); setActiveSubTab('tnl'); }}
          className={`py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
            activeSubTab === 'tnl' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Radio className="w-4 h-4 text-violet-400" />
          <span>TNL Links</span>
        </button>

        <button
          onClick={() => { setSelectedSiteId(null); setActiveSubTab('note'); }}
          className={`py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
            activeSubTab === 'note' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <FileText className="w-4 h-4 text-teal-400" />
          <span>SDM Notes</span>
        </button>

        <button
          onClick={() => { setSelectedSiteId(null); setActiveSubTab('whatsapp'); }}
          className={`py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
            activeSubTab === 'whatsapp' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <span>WhatsApp</span>
        </button>

        <button
          onClick={() => { setSelectedSiteId(null); setActiveSubTab('ai'); }}
          className={`py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
            activeSubTab === 'ai' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Bot className="w-4 h-4 text-purple-400" />
          <span>AI Assistant</span>
        </button>

        <button
          onClick={() => { setSelectedSiteId(null); setActiveSubTab('reports'); }}
          className={`py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
            activeSubTab === 'reports' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-pink-400" />
          <span>Reports</span>
        </button>

        <button
          onClick={() => { setSelectedSiteId(null); setActiveSubTab('queue'); }}
          className={`py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
            activeSubTab === 'queue' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <UploadCloud className="w-4 h-4 text-cyan-400" />
          <span>Queue {pendingTotal > 0 ? `(${pendingTotal})` : ''}</span>
        </button>

        {currentUser?.is_superuser && (
          <button
            onClick={() => { setSelectedSiteId(null); setActiveSubTab('admin'); }}
            className={`py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
              activeSubTab === 'admin' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <UserCheck className="w-4 h-4 text-red-400" />
            <span>Admin</span>
          </button>
        )}
      </div>

      {/* Sub-Tab 0: Overview Summary */}
      {activeSubTab === 'overview' && (
        <div className="space-y-4">
          {/* Quick Action Bar */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => { setSelectedSiteId(null); setActiveSubTab('note'); }}
              className="py-3 px-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-xs rounded-xl shadow-lg flex flex-col items-center justify-center gap-1 transition-all"
            >
              <FileText className="w-4 h-4 text-cyan-200" />
              <span>Log Note</span>
            </button>

            <button
              onClick={() => { setSelectedSiteId(null); setActiveSubTab('fse'); }}
              className="py-3 px-2 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold text-xs rounded-xl border border-amber-500/30 flex flex-col items-center justify-center gap-1 transition-all"
            >
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>FSE Audit</span>
            </button>

            <button
              onClick={() => { setSelectedSiteId(null); setActiveSubTab('whatsapp'); }}
              className="py-3 px-2 bg-slate-900 hover:bg-slate-800 text-emerald-300 font-bold text-xs rounded-xl border border-emerald-500/30 flex flex-col items-center justify-center gap-1 transition-all"
            >
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span>WhatsApp</span>
            </button>
          </div>

          {/* Quick Search & Field Sites List */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-cyan-400" /> Assigned Sites ({cachedSites.length})
              </h3>
              <button
                onClick={() => setActiveSubTab('sites')}
                className="text-[11px] text-cyan-400 hover:underline font-bold flex items-center gap-0.5"
              >
                <span>View All</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search site ID, state, vendor..."
                value={siteSearch}
                onChange={(e) => setSiteSearch(e.target.value)}
                className="w-full bg-slate-950 text-xs text-white pl-9 pr-3 py-2 rounded-xl border border-slate-800 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredCachedSites.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">No sites found matching search.</div>
              ) : (
                filteredCachedSites.slice(0, 8).map(s => (
                  <div
                    key={s.id || s.ihs_site_id}
                    onClick={() => handleMobileSelectSite(s.ihs_site_id)}
                    className="p-3 bg-slate-900/90 hover:bg-slate-800/90 rounded-xl border border-slate-800/80 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99]"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-cyan-300 font-mono text-xs">{s.ihs_site_id}</span>
                        <span className="text-[10px] text-slate-400 font-medium">({s.state || 'FCT'})</span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate max-w-[220px]">{s.site_name || s.vendor_name || 'SDM Field Site'}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 1: Create & View SDM Operational Notes */}
      {activeSubTab === 'note' && (
        <div className="space-y-4">
          {/* Note Form */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                {editingNote ? `Edit Note: ${editingNote.site_ihs_id || noteSiteId}` : 'Create Field SDM Operational Note'}
              </h3>
              <div className="flex items-center gap-2">
                {editingNote && (
                  <button
                    type="button"
                    onClick={handleResetNoteForm}
                    className="text-[10px] px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700"
                  >
                    Cancel Edit
                  </button>
                )}
                <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded">
                  {isOnline ? '🟢 Live Online Save' : '📦 Local Device Queue'}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveNote} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Target Site ID *</label>
                  <input
                    type="text"
                    placeholder="e.g. FC2700..."
                    value={noteSiteId}
                    onChange={(e) => setNoteSiteId(e.target.value.toUpperCase())}
                    required
                    className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Category *</label>
                  <select
                    value={noteCategory}
                    onChange={(e) => setNoteCategory(e.target.value)}
                    className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                  >
                    {noteCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Priority *</label>
                  <select
                    value={notePriority}
                    onChange={(e) => setNotePriority(e.target.value)}
                    className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                  >
                    {notePriorities.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Status *</label>
                  <select
                    value={noteStatus}
                    onChange={(e) => setNoteStatus(e.target.value)}
                    className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                  >
                    {noteStatuses.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Incident Occurrence Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={noteIncidentTime}
                    onChange={(e) => setNoteIncidentTime(e.target.value)}
                    className="w-full bg-slate-900 text-xs text-white font-mono p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Created By / Field Author *</label>
                  <input
                    type="text"
                    value={noteCreatedBy}
                    onChange={(e) => setNoteCreatedBy(e.target.value)}
                    required
                    className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Note Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Generator AVR Replacement Completed"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  required
                  className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Progress Update Entry / New Data Field */}
              {editingNote && (
                <div className="p-3 bg-cyan-950/40 rounded-xl border border-cyan-500/30 space-y-1">
                  <label className="block text-cyan-300 font-semibold text-xs flex items-center justify-between">
                    <span>➕ Append New Progress Update / Field Data</span>
                    <span className="text-[10px] text-cyan-400 font-normal">Appends timestamped entry to RCA history</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. FSE visited site at 18:45; swapped battery bank, power restored..."
                    value={noteAppendUpdate}
                    onChange={(e) => setNoteAppendUpdate(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-400 text-xs"
                  />
                </div>
              )}

              {/* Photo Picker with Camera & Watermarking */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Attach Photo Evidence (Auto-Stamped with Site ID, Date, Time & GPS Location)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Camera Snap Input */}
                  <label className="cursor-pointer px-3 py-2 bg-cyan-600/30 hover:bg-cyan-600/40 text-cyan-200 border border-cyan-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all">
                    <Camera className="w-4 h-4 text-cyan-400" />
                    <span>Snap Camera Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoChange}
                      className="hidden"
                    />
                  </label>

                  {/* Gallery Input */}
                  <label className="cursor-pointer px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all">
                    <UploadCloud className="w-4 h-4 text-slate-400" />
                    <span>Upload Gallery Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {isProcessingPhotos && (
                  <div className="text-xs text-cyan-400 flex items-center gap-1.5 mt-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Stamping Site ID, Timestamp & GPS Location onto photo canvas...</span>
                  </div>
                )}

                {notePhotoPreviews.length > 0 && (
                  <div className="space-y-1.5 mt-3">
                    <div className="text-[11px] font-bold text-cyan-300">
                      Watermarked Photo Previews ({notePhotoPreviews.length}):
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {notePhotoPreviews.map((src, i) => (
                        <div key={i} className="relative group">
                          <img src={src} alt="watermarked preview" className="w-20 h-20 object-cover rounded-xl border-2 border-cyan-500/40 shadow-lg" />
                          <button
                            type="button"
                            onClick={() => {
                              setNotePhotos(prev => prev.filter((_, idx) => idx !== i));
                              setNotePhotoPreviews(prev => prev.filter((_, idx) => idx !== i));
                            }}
                            className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full p-0.5 text-xs shadow hover:bg-rose-500"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Detailed Operational Description *</label>
                <textarea
                  rows="3"
                  placeholder="Describe root cause, action taken, FSE on site, status..."
                  value={noteDescription}
                  onChange={(e) => setNoteDescription(e.target.value)}
                  required={!noteAppendUpdate.trim()}
                  className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSavingNote}
                  className="flex-1 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" />
                  <span>{isSavingNote ? 'Saving Operational Note...' : (editingNote ? 'Update SDM Operational Note' : 'Save SDM Operational Note')}</span>
                </button>

                {editingNote && (
                  <button
                    type="button"
                    onClick={handleResetNoteForm}
                    className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Live Recent Notes Feed */}
          {isOnline && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" /> Live SDM Notes Stream ({filteredLiveNotes.length})
                </h4>
                <div className="flex items-center gap-2 text-xs">
                  <select
                    value={notePriorityFilter}
                    onChange={(e) => setNotePriorityFilter(e.target.value)}
                    className="bg-slate-900 text-slate-300 text-[11px] px-2 py-1 rounded-lg border border-slate-700"
                  >
                    <option value="All">All Priorities</option>
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {filteredLiveNotes.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">No notes matching filter.</div>
                ) : (
                  filteredLiveNotes.map((note) => (
                    <div key={note.id} className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span 
                          onClick={() => handleMobileSelectSite(note.site_ihs_id)}
                          className="font-extrabold text-cyan-300 font-mono cursor-pointer hover:underline"
                        >
                          {note.site_ihs_id}
                        </span>
                        <div className="flex items-center space-x-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            note.priority === 'Critical' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-300'
                          }`}>
                            {note.priority}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            note.status === 'Resolved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {note.status}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs font-bold text-white">{note.title}</div>
                      <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-line">{note.description}</p>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
                        <span>By: {note.created_by} ({new Date(note.created_at).toLocaleDateString()})</span>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleOpenEditNote(note)}
                            className="text-cyan-400 hover:underline font-bold flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" /> Edit
                          </button>
                          {note.status !== 'Resolved' && (
                            <button
                              onClick={() => handleQuickResolveLiveNote(note)}
                              className="text-emerald-400 hover:underline font-bold"
                            >
                              Resolve
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteLiveNote(note)}
                            className="text-rose-400 hover:underline font-bold"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 2: Log WhatsApp Field Intel */}
      {activeSubTab === 'whatsapp' && (
        <div className="space-y-4">
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                Log WhatsApp Field Intel Report
              </h3>
              <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded">
                {isOnline ? '🟢 Live Online Save' : '📦 Local Device Storage'}
              </span>
            </div>

            <form onSubmit={handleSaveWa} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Target Site ID *</label>
                  <input
                    type="text"
                    placeholder="e.g. FC1200..."
                    value={waSiteId}
                    onChange={(e) => setWaSiteId(e.target.value.toUpperCase())}
                    required
                    className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Sender / Engineer Name</label>
                  <input
                    type="text"
                    value={waSender}
                    onChange={(e) => setWaSender(e.target.value)}
                    required
                    className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">WhatsApp Message Content *</label>
                <textarea
                  rows="3"
                  placeholder="Paste WhatsApp update e.g: Engineer arrived site FC1200 at 10:30am. Generator running fine..."
                  value={waMessage}
                  onChange={(e) => setWaMessage(e.target.value)}
                  required
                  className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Log WhatsApp Intel</span>
              </button>
            </form>
          </div>

          {/* Live WhatsApp Stream */}
          {isOnline && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-400" /> Live WhatsApp Field Intel Stream ({filteredLiveWa.length})
                </h4>
                <select
                  value={waIssueFilter}
                  onChange={(e) => setWaIssueFilter(e.target.value)}
                  className="bg-slate-900 text-slate-300 text-[11px] px-2 py-1 rounded-lg border border-slate-700"
                >
                  <option value="All">All Issues</option>
                  <option value="Generator">Generator</option>
                  <option value="Power">Power</option>
                  <option value="Fuel">Fuel</option>
                  <option value="Battery">Battery</option>
                  <option value="Transmission">Transmission</option>
                </select>
              </div>

              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {filteredLiveWa.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">No WhatsApp intel matching filter.</div>
                ) : (
                  filteredLiveWa.map((wa) => (
                    <div key={wa.id} className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-1 font-sans">
                      <div className="flex items-center justify-between text-xs">
                        <span 
                          onClick={() => handleOpenSiteDetail({ ihs_site_id: wa.site_id_str })}
                          className="font-extrabold text-emerald-300 font-mono cursor-pointer hover:underline"
                        >
                          {wa.site_id_str || 'SITE'}
                        </span>
                        <span className="text-[10px] text-slate-400">{wa.sender_name}</span>
                      </div>
                      <p className="text-[11px] text-slate-200 leading-relaxed">{wa.message_text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 3: Mobile AI Assistant */}
      {activeSubTab === 'ai' && (
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-400 animate-pulse" />
              Mobile SDM AI Field Assistant
            </h3>
            <span className="text-[10px] px-2 py-0.5 bg-purple-950/60 text-purple-300 border border-purple-800 rounded">
              AI ENGINE v2.0
            </span>
          </div>

          {/* Preset Prompts */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => handleSendAiPrompt('Show summary of current generator outage causes in FCT')}
              className="px-2.5 py-1 bg-purple-950/40 hover:bg-purple-900/60 text-purple-200 border border-purple-800/60 rounded-lg text-[11px]"
            >
              ⚡ Generator Outages
            </button>
            <button
              onClick={() => handleSendAiPrompt('What are the top critical sites requiring immediate intervention?')}
              className="px-2.5 py-1 bg-purple-950/40 hover:bg-purple-900/60 text-purple-200 border border-purple-800/60 rounded-lg text-[11px]"
            >
              🚨 Critical Sites
            </button>
            <button
              onClick={() => handleSendAiPrompt('Summarize recent WhatsApp updates for diesel refills')}
              className="px-2.5 py-1 bg-purple-950/40 hover:bg-purple-900/60 text-purple-200 border border-purple-800/60 rounded-lg text-[11px]"
            >
              ⛽ Fuel Updates
            </button>
          </div>

          {/* AI Chat Messages Window */}
          <div className="space-y-3 max-h-80 overflow-y-auto p-3 bg-slate-950 rounded-xl border border-slate-800">
            {aiMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-xs ${
                  msg.sender === 'user'
                    ? 'bg-cyan-600 text-white rounded-br-none'
                    : 'bg-slate-900 text-slate-200 border border-purple-500/30 rounded-bl-none'
                }`}>
                  <div className="font-bold text-[10px] text-purple-300 mb-1">
                    {msg.sender === 'user' ? 'You (SDM)' : '🤖 SDM AI Engine'}
                  </div>
                  <div className="whitespace-pre-line leading-relaxed">{msg.text}</div>
                </div>
                <span className="text-[9px] text-slate-500 mt-1 px-1">{msg.time}</span>
              </div>
            ))}

            {aiLoading && (
              <div className="flex items-center space-x-2 text-xs text-purple-400 p-2">
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>AI Assistant thinking & analyzing site data...</span>
              </div>
            )}
          </div>

          {/* Query Input Form */}
          <form onSubmit={(e) => { e.preventDefault(); handleSendAiPrompt(); }} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Ask AI about site issues, DG faults, or guidelines..."
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              className="flex-1 bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-purple-500"
            />
            <button
              type="submit"
              disabled={aiLoading}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ask</span>
            </button>
          </form>
        </div>
      )}

      {/* Sub-Tab 4: SDM Site Finder & Profiles */}
      {activeSubTab === 'sites' && (
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                SDM Sites Directory ({filteredCachedSites.length} Sites)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Search & inspect site specifications assigned to {currentUser?.full_name || 'SDM'}.
              </p>
            </div>
            <button
              type="button"
              onClick={loadLiveServerFeeds}
              className="px-2.5 py-1 text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/30"
            >
              Refresh Sites
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search site ID, address, state, or power solution..."
              value={siteSearch}
              onChange={(e) => setSiteSearch(e.target.value)}
              className="w-full bg-slate-900 text-xs text-white pl-9 pr-4 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {filteredCachedSites.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              No matching sites found in cache. Ensure you are connected to the server network.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
              {filteredCachedSites.slice(0, 60).map((site) => (
                <div 
                  key={site.id} 
                  onClick={() => handleMobileSelectSite(site.ihs_site_id)}
                  className="p-3.5 bg-slate-900/90 hover:bg-slate-800 rounded-xl border border-slate-800 cursor-pointer transition-all space-y-1.5 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-cyan-300 font-mono group-hover:text-cyan-200">{site.ihs_site_id}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      site.is_down ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {site.operational_status || 'Active'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 truncate">{site.site_address || site.cluster_name}</p>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
                    <span>Power: {site.power_solution || 'Grid'}</span>
                    <span>DG: {site.dg_capacity || 'N/A'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 5: Interactive Geo Map */}
      {activeSubTab === 'map' && (
        <div className="space-y-4">
          <div className="glass-panel p-3 rounded-2xl border border-slate-800 min-h-[500px]">
            <GeoMap currentUser={currentUser} onSelectSite={handleMobileSelectSite} />
          </div>
        </div>
      )}

      {/* Sub-Tab 6: FSE Audit & Inspector */}
      {activeSubTab === 'fse' && (
        <div className="space-y-4">
          <SiteFseInspector currentUser={currentUser} onSelectSite={handleMobileSelectSite} />
        </div>
      )}

      {/* Sub-Tab 7: TNL Links Directory */}
      {activeSubTab === 'tnl' && (
        <div className="space-y-4">
          <TNLLinksDirectory currentUser={currentUser} onSelectSite={handleMobileSelectSite} />
        </div>
      )}

      {/* Sub-Tab 8: Reports & Executive Analytics */}
      {activeSubTab === 'reports' && (
        <div className="space-y-4">
          <ReportsAnalytics currentUser={currentUser} onSelectSite={handleMobileSelectSite} />
        </div>
      )}

      {/* Sub-Tab 9: SDM Admin & User Management */}
      {activeSubTab === 'admin' && currentUser?.is_superuser && (
        <div className="space-y-4">
          <SDMUserManagement currentUser={currentUser} />
        </div>
      )}

      {/* Sub-Tab 10: Detailed Site Profile View */}
      {activeSubTab === 'profile' && selectedSiteId && (
        <div className="space-y-4">
          <SiteProfile
            siteId={selectedSiteId}
            currentUser={currentUser}
            onBack={() => setActiveSubTab('sites')}
            onOpenAIWithPrompt={(promptText) => {
              setAiQuery(promptText);
              setActiveSubTab('ai');
            }}
          />
        </div>
      )}

      {/* Sub-Tab 5: Offline Queue & Sync Controls */}
      {activeSubTab === 'queue' && (
        <div className="space-y-4">
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-cyan-400" />
                  Pending Offline Queue ({pendingTotal} Items)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Items created offline waiting for server sync.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={isSyncing}
                  className="px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Sync Now</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearPendingQueue();
                    refreshPendingQueues();
                    setSyncStatusMsg({ type: 'info', text: '🗑️ Pending offline queue cleared.' });
                  }}
                  className="px-3 py-1.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs rounded-xl hover:bg-rose-500/30"
                >
                  Clear Queue
                </button>
              </div>
            </div>

            {pendingTotal === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                No pending items in queue. All your operational notes and WhatsApp intel are synced!
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {/* Pending Notes */}
                {pendingNotes.map((note) => (
                  <div key={note.local_id} className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-extrabold text-cyan-300 font-mono">[NOTE] {note.site_id_str} - {note.title}</div>
                      <div className="text-[11px] text-slate-400">{note.description.slice(0, 60)}...</div>
                    </div>
                    <button
                      onClick={() => {
                        removePendingNote(note.local_id);
                        refreshPendingQueues();
                      }}
                      className="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {/* Pending WhatsApp */}
                {pendingWa.map((wa) => (
                  <div key={wa.local_id} className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-extrabold text-emerald-300 font-mono">[INTEL] {wa.site_id_str} - {wa.sender_name}</div>
                      <div className="text-[11px] text-slate-400">{wa.message_text.slice(0, 60)}...</div>
                    </div>
                    <button
                      onClick={() => {
                        removePendingWhatsApp(wa.local_id);
                        refreshPendingQueues();
                      }}
                      className="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {/* Pending FSE Audits */}
                {pendingAudits.map((audit) => (
                  <div key={audit.local_id} className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-extrabold text-amber-300 font-mono">[FSE AUDIT] {audit.site_id} - {audit.engineer_name}</div>
                      <div className="text-[11px] text-slate-400">DG: {audit.gen_hours || 'N/A'} hrs, Fuel: {audit.fuel_level || 'N/A'}%</div>
                    </div>
                    <button
                      onClick={() => {
                        removePendingFseAudit(audit.local_id);
                        refreshPendingQueues();
                      }}
                      className="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Site Detail Overlay Modal inside Mobile View */}
      {selectedSiteDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="glass-panel max-w-xl w-full p-6 rounded-2xl border border-cyan-500/40 bg-slate-950 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-xs font-mono text-cyan-400 font-extrabold">{selectedSiteDetail.ihs_site_id}</span>
                <h3 className="text-base font-extrabold text-white">{selectedSiteDetail.site_address || selectedSiteDetail.cluster_name}</h3>
              </div>
              <button
                onClick={() => setSelectedSiteDetail(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-900 border border-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Operational Status</span>
                <span className="font-extrabold text-cyan-300">{selectedSiteDetail.operational_status || 'Normal'}</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Power Solution</span>
                <span className="font-bold text-white">{selectedSiteDetail.power_solution || 'Grid'}</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px]">DG Capacity</span>
                <span className="font-bold text-white">{selectedSiteDetail.dg_capacity || 'N/A'}</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px]">State / LGA</span>
                <span className="font-bold text-white">{selectedSiteDetail.state || 'FCT'} / {selectedSiteDetail.lga || 'Abuja'}</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px]">SMC FSE</span>
                <span className="font-bold text-white">{selectedSiteDetail.smc_fse_name || 'N/A'}</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px]">MTN RDM</span>
                <span className="font-bold text-white">{selectedSiteDetail.mtn_rdm_name || 'N/A'}</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setNoteSiteId(selectedSiteDetail.ihs_site_id);
                  setSelectedSiteDetail(null);
                  setActiveSubTab('note');
                }}
                className="px-4 py-2 bg-cyan-600 text-white font-bold text-xs rounded-xl shadow-md"
              >
                Log Note for {selectedSiteDetail.ihs_site_id}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Theme Selector Overlay Modal */}
      {showThemeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-sm w-full p-5 rounded-2xl border border-cyan-500/40 bg-slate-950 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-cyan-400" />
                Select Mobile App Theme
              </h3>
              <button onClick={() => setShowThemeModal(false)} className="text-slate-400 hover:text-white text-xs font-bold">&times;</button>
            </div>

            <div className="space-y-2">
              {mobileThemes.map((t) => {
                const Icon = t.icon;
                const isActive = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleApplyTheme(t.id)}
                    className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all ${
                      isActive ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-md' : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Icon className={`w-4 h-4 ${t.color}`} />
                      <span className="text-xs font-bold">{t.label}</span>
                    </div>
                    {isActive && <span className="text-[10px] px-2 py-0.5 bg-cyan-500/30 text-cyan-300 rounded font-extrabold">ACTIVE</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!mobileNoteToDelete}
        title="Delete SDM Operational Note"
        message="Are you sure you want to delete this SDM Operational Note? This will permanently erase the note and evidence from the server."
        itemDetails={mobileNoteToDelete ? {
          siteId: mobileNoteToDelete.site_ihs_id || mobileNoteToDelete.site_id_str,
          itemTitle: mobileNoteToDelete.title,
          author: mobileNoteToDelete.created_by
        } : null}
        confirmText="Permanently Delete Note"
        onConfirm={handleConfirmDeleteLiveNote}
        onCancel={() => setMobileNoteToDelete(null)}
        isDeleting={isDeletingMobileNote}
      />
    </div>
  );
}
