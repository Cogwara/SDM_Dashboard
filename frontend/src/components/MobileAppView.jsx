import React, { useState, useEffect } from 'react';
import { 
  Smartphone, Wifi, WifiOff, RefreshCw, FileText, MessageSquare, 
  CheckCircle2, AlertTriangle, Layers, Clock, UploadCloud, Trash2, Camera, ShieldCheck,
  Server, User, LogOut, Lock, Settings
} from 'lucide-react';
import { 
  getPendingNotes, getPendingWhatsApp, saveOfflineNote, saveOfflineWhatsApp, 
  removePendingNote, removePendingWhatsApp, clearPendingQueue, getPendingTotalCount,
  getCachedSites, saveCachedSites, getLastSyncTime 
} from '../mobileOfflineStorage';
import { checkServerHealth, createNote, createWhatsAppMessage, fetchSites, setCustomServerIp } from '../api';

export default function MobileAppView({ currentUser, onLogout, onSelectSite }) {
  const [activeSubTab, setActiveSubTab] = useState('note'); // 'note', 'whatsapp', 'queue', 'cache'
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingNotes, setPendingNotes] = useState(getPendingNotes());
  const [pendingWa, setPendingWa] = useState(getPendingWhatsApp());
  const [cachedSites, setCachedSites] = useState(getCachedSites());
  const [syncStatusMsg, setSyncStatusMsg] = useState(null);

  const isMobileNative = typeof window !== 'undefined' && Boolean(
    (window.Capacitor?.isNativePlatform?.() && window.Capacitor?.getPlatform?.() !== 'web') ||
    (window.Capacitor?.getPlatform?.() === 'android' || window.Capacitor?.getPlatform?.() === 'ios') ||
    window.location.protocol === 'capacitor:' || 
    window.location.protocol === 'file:'
  );
  const defaultIp = isMobileNative 
    ? '192.168.1.2' 
    : (typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost');

  // Server IP Config state
  const [serverIp, setServerIp] = useState(() => localStorage.getItem('fct_sdm_server_ip') || defaultIp);
  const [showServerConfig, setShowServerConfig] = useState(false);

  // Incident Occurrence Timestamp State
  const toLocalISOString = (d) => {
    if (!d) return '';
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return '';
    const tzOffset = dateObj.getTimezoneOffset() * 60000;
    return new Date(dateObj.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  // Form states for New Offline Note
  const [noteSiteId, setNoteSiteId] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteIncidentTime, setNoteIncidentTime] = useState(() => toLocalISOString(new Date()));
  const [noteCategory, setNoteCategory] = useState('Generator');
  const [notePriority, setNotePriority] = useState('High');
  const [noteDescription, setNoteDescription] = useState('');
  const [notePhotos, setNotePhotos] = useState([]);
  const [notePhotoPreviews, setNotePhotoPreviews] = useState([]);

  // Form states for New WhatsApp Intel
  const [waSiteId, setWaSiteId] = useState('');
  const [waSender, setWaSender] = useState(currentUser?.full_name || 'Field SDM Engineer');
  const [waMessage, setWaMessage] = useState('');

  // Check network & server connection periodically
  const checkConnection = async () => {
    const reachable = await checkServerHealth();
    setIsOnline(reachable);

    // If server is reachable, auto refresh cached sites
    if (reachable) {
      try {
        const sitesData = await fetchSites({ page_size: 1000 });
        const sitesList = Array.isArray(sitesData) ? sitesData : sitesData.results || [];
        if (sitesList.length > 0) {
          saveCachedSites(sitesList);
          setCachedSites(sitesList);
        }
      } catch (e) {
        console.error('Failed to update offline site cache:', e);
      }
    }
  };

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const refreshPendingQueues = () => {
    setPendingNotes(getPendingNotes());
    setPendingWa(getPendingWhatsApp());
  };

  // Perform full network sync when in range of server
  const handleSyncNow = async () => {
    const reachable = await checkServerHealth();
    if (!reachable) {
      setSyncStatusMsg({ type: 'error', text: '🔴 Cannot sync: Server network unreachable. Please connect to the server network.' });
      return;
    }

    setIsSyncing(true);
    setSyncStatusMsg({ type: 'info', text: '⚡ Synchronizing offline SDM notes & WhatsApp intel to server...' });

    let syncedNotesCount = 0;
    let syncedWaCount = 0;

    // 1. Sync Pending Notes
    const currentNotes = getPendingNotes();
    for (const note of currentNotes) {
      try {
        const formData = new FormData();
        formData.append('site_id_str', note.site_id_str);
        formData.append('title', note.title);
        formData.append('category', note.category);
        formData.append('priority', note.priority);
        formData.append('description', note.description);
        formData.append('created_by', note.created_by || currentUser?.full_name || 'Mobile SDM');

        // Attach photos if present
        if (note.photos && note.photos.length > 0) {
          note.photos.forEach((file) => {
            formData.append('uploaded_photos', file);
          });
        }

        await createNote(formData);
        removePendingNote(note.local_id);
        syncedNotesCount++;
      } catch (e) {
        console.error('Failed to sync note:', note, e);
      }
    }

    // 2. Sync Pending WhatsApp Messages
    const currentWa = getPendingWhatsApp();
    for (const wa of currentWa) {
      try {
        await createWhatsAppMessage({
          site_id_str: wa.site_id_str,
          sender_name: wa.sender_name || currentUser?.full_name || 'Mobile Engineer',
          message_text: wa.message_text
        });
        removePendingWhatsApp(wa.local_id);
        syncedWaCount++;
      } catch (e) {
        console.error('Failed to sync WhatsApp message:', wa, e);
      }
    }

    refreshPendingQueues();
    setIsSyncing(false);
    localStorage.setItem('sdm_last_sync_time', new Date().toLocaleTimeString());

    setSyncStatusMsg({
      type: 'success',
      text: `✅ Network Sync Complete! Successfully uploaded ${syncedNotesCount} SDM note(s) and ${syncedWaCount} WhatsApp intel update(s) to server.`
    });
  };

  // Handle Photo Picker
  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setNotePhotos(prev => [...prev, ...files]);
    const previews = files.map(file => URL.createObjectURL(file));
    setNotePhotoPreviews(prev => [...prev, ...previews]);
  };

  // Save Server IP from Mobile UI
  const handleSaveServerIp = (e) => {
    e.preventDefault();
    if (!serverIp.trim()) return;
    setCustomServerIp(serverIp.trim());
    setShowServerConfig(false);
    setSyncStatusMsg({ type: 'info', text: `🔄 Server IP updated to http://${serverIp.trim()}:8000. Re-testing server connection...` });
    checkConnection();
  };

  // Save New Note (Online or Offline)
  const handleSaveNote = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      setSyncStatusMsg({ type: 'error', text: '🔒 Login Required: You must log in to your SDM account before creating notes.' });
      return;
    }
    if (!noteSiteId || !noteTitle || !noteDescription) return;

    const notePayload = {
      site_id_str: noteSiteId.toUpperCase(),
      title: noteTitle,
      category: noteCategory,
      priority: notePriority,
      description: noteDescription,
      created_by: currentUser?.full_name || currentUser?.username || 'Field SDM',
      created_at: noteIncidentTime ? new Date(noteIncidentTime).toISOString() : new Date().toISOString(),
      photos: notePhotos
    };

    if (isOnline) {
      try {
        const formData = new FormData();
        formData.append('site_id_str', notePayload.site_id_str);
        formData.append('title', notePayload.title);
        formData.append('category', notePayload.category);
        formData.append('priority', notePayload.priority);
        formData.append('description', notePayload.description);
        formData.append('created_by', notePayload.created_by);
        if (noteIncidentTime) {
          formData.append('created_at', noteIncidentTime);
        }
        notePhotos.forEach(file => formData.append('uploaded_photos', file));

        await createNote(formData);
        setSyncStatusMsg({ type: 'success', text: `🟢 Note created & saved directly to server for site ${notePayload.site_id_str}!` });
      } catch (e) {
        // Fallback to offline queue if request failed
        saveOfflineNote(notePayload);
        refreshPendingQueues();
        setSyncStatusMsg({ type: 'warning', text: `📦 Saved to Offline Queue! Note will sync automatically when server connection stabilizes.` });
      }
    } else {
      saveOfflineNote(notePayload);
      refreshPendingQueues();
      setSyncStatusMsg({ type: 'warning', text: `📦 Offline Mode: Note saved to local device queue! It will sync when connected to server network.` });
    }

    // Reset Form
    setNoteSiteId('');
    setNoteTitle('');
    setNoteDescription('');
    setNotePhotos([]);
    setNotePhotoPreviews([]);
  };

  // Save WhatsApp Intel (Online or Offline)
  const handleSaveWa = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      setSyncStatusMsg({ type: 'error', text: '🔒 Login Required: You must log in to your SDM account before logging intel.' });
      return;
    }
    if (!waSiteId || !waMessage) return;

    const waPayload = {
      site_id_str: waSiteId.toUpperCase(),
      sender_name: waSender || currentUser?.full_name || currentUser?.username || 'Mobile Engineer',
      message_text: waMessage
    };

    if (isOnline) {
      try {
        await createWhatsAppMessage(waPayload);
        setSyncStatusMsg({ type: 'success', text: `🟢 WhatsApp Intel logged directly to server for site ${waPayload.site_id_str}!` });
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

  const pendingTotal = pendingNotes.length + pendingWa.length;
  const lastSync = getLastSyncTime();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      
      {/* Mobile Top App Header */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
              <Smartphone className="w-6 h-6 text-cyan-400 animate-pulse" />
              FCT SDM Field Mobile Application
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Offline-First Mobile Operations &bull; Create SDM Notes & WhatsApp Field Intel Offline &bull; Network Auto-Sync
            </p>
          </div>

          {/* Sync Control & Status Badge */}
          <div className="flex items-center space-x-3">
            <div className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
              isOnline 
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40' 
                : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
            }`}>
              {isOnline ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-rose-400 animate-bounce" />}
              <span>{isOnline ? 'Server Network Online' : 'Offline Mode (Device Queue Active)'}</span>
            </div>

            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg flex items-center space-x-1.5 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
              {pendingTotal > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-amber-400 text-slate-950 rounded-full text-[10px] font-extrabold">
                  {pendingTotal}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* User Badge & Server IP Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800/80 text-xs">
          {/* Active User Card */}
          <div className="flex items-center space-x-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800 text-slate-300 font-medium">
            <User className="w-4 h-4 text-cyan-400" />
            <span>
              Logged in: <strong className="text-white">{currentUser?.full_name || currentUser?.username || 'Guest SDM'}</strong>
            </span>
            {onLogout && (
              <button
                onClick={onLogout}
                title="Log out or switch SDM account"
                className="ml-2 px-2 py-0.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 rounded border border-rose-800 text-[10px] font-bold flex items-center gap-1 transition-all"
              >
                <LogOut className="w-3 h-3" /> Log Out
              </button>
            )}
          </div>

          {/* Server IP Config Button */}
          <button
            onClick={() => setShowServerConfig(!showServerConfig)}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-cyan-300 font-mono text-[11px] font-bold rounded-xl border border-cyan-500/30 flex items-center gap-1.5 transition-all"
          >
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            <span>Server IP: {serverIp}</span>
          </button>
        </div>

        {/* Server IP Drawer */}
        {showServerConfig && (
          <form onSubmit={handleSaveServerIp} className="p-4 bg-slate-900/95 rounded-xl border border-cyan-500/40 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-cyan-300 flex items-center gap-1.5 font-mono">
                <Server className="w-4 h-4 text-cyan-400" /> Configure Backend Server Host / IP Address
              </h4>
              <button type="button" onClick={() => setShowServerConfig(false)} className="text-slate-400 hover:text-white text-xs">&times;</button>
            </div>
            <p className="text-[11px] text-slate-400">
              Enter your backend server network IP (e.g. <code className="text-cyan-300 font-mono">192.168.1.2</code> or <code className="text-cyan-300 font-mono">10.0.0.5</code>). Target API: <code className="text-cyan-300 font-mono">http://{serverIp}:8000/api/v1</code>
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. 192.168.1.2"
                value={serverIp}
                onChange={(e) => setServerIp(e.target.value)}
                required
                className="flex-1 bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-mono"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all"
              >
                Save & Connect
              </button>
            </div>
          </form>
        )}

        {/* Sync Alert Banner */}
        {syncStatusMsg && (
          <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between border ${
            syncStatusMsg.type === 'success' ? 'bg-emerald-950/60 text-emerald-200 border-emerald-800' :
            syncStatusMsg.type === 'error' ? 'bg-rose-950/60 text-rose-200 border-rose-800' :
            'bg-amber-950/60 text-amber-200 border-amber-800'
          }`}>
            <span>{syncStatusMsg.text}</span>
            {lastSync && <span className="text-[10px] text-slate-400">Last Synced: {lastSync}</span>}
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab('note')}
          className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeSubTab === 'note' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>New SDM Note</span>
        </button>

        <button
          onClick={() => setActiveSubTab('whatsapp')}
          className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeSubTab === 'whatsapp' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Log WhatsApp Intel</span>
        </button>

        <button
          onClick={() => setActiveSubTab('queue')}
          className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all relative ${
            activeSubTab === 'queue' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-white'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          <span>Pending Queue ({pendingTotal})</span>
          {pendingTotal > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping absolute top-2 right-2" />
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('cache')}
          className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeSubTab === 'cache' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Offline Site Cache ({cachedSites.length})</span>
        </button>
      </div>

      {/* Sub-Tab 1: Create Offline SDM Note */}
      {activeSubTab === 'note' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              Create Field SDM Operational Note (Offline Supported)
            </h3>
            <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded">
              {isOnline ? '🟢 Live Online Save' : '📦 Local Device Storage'}
            </span>
          </div>

          <form onSubmit={handleSaveNote} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Target Site ID *</label>
                <input
                  type="text"
                  placeholder="e.g. FC2700..."
                  value={noteSiteId}
                  onChange={(e) => setNoteSiteId(e.target.value.toUpperCase())}
                  required
                  className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Category *</label>
                <select
                  value={noteCategory}
                  onChange={(e) => setNoteCategory(e.target.value)}
                  className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                >
                  {['Generator', 'Power', 'Battery', 'Transmission', 'SA Alarms', 'Access', 'Security', 'General'].map(cat => (
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
                  {['P1-Critical', 'High', 'Medium', 'Low'].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Incident / Note Title *</label>
                <input
                  type="text"
                  placeholder="Brief summary of the issue or operational status..."
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  required
                  className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-cyan-400" /> Incident Date & Time *</span>
                  <span className="text-[10px] text-cyan-300 font-normal">Set time event occurred</span>
                </label>
                <input
                  type="datetime-local"
                  value={noteIncidentTime}
                  onChange={(e) => setNoteIncidentTime(e.target.value)}
                  required
                  className="w-full bg-slate-900 text-xs text-white font-mono p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Detailed Field Observations & Action Progress *</label>
              <textarea
                rows={4}
                placeholder="Enter root cause, engineer ETA, actions taken, or field findings..."
                value={noteDescription}
                onChange={(e) => setNoteDescription(e.target.value)}
                required
                className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Photo Upload Picker */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">📷 Upload Field Evidence Photos (Offline Cached)</label>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handlePhotoChange}
                className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-cyan-400 hover:file:bg-slate-700 cursor-pointer"
              />

              {notePhotoPreviews.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {notePhotoPreviews.map((src, i) => (
                    <img key={i} src={src} alt="Preview" className="w-16 h-16 object-cover rounded-lg border border-slate-700" />
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-2 transition-all"
            >
              <span>{isOnline ? 'Save Note & Direct Upload' : 'Save Note to Offline Device Queue'}</span>
              <UploadCloud className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Sub-Tab 2: Log Local WhatsApp Intel */}
      {activeSubTab === 'whatsapp' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              Log WhatsApp Field Technical Intel (Offline Supported)
            </h3>
            <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded">
              {isOnline ? '🟢 Live Online Save' : '📦 Local Device Storage'}
            </span>
          </div>

          <form onSubmit={handleSaveWa} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Target Site ID *</label>
                <input
                  type="text"
                  placeholder="e.g. FC2700..."
                  value={waSiteId}
                  onChange={(e) => setWaSiteId(e.target.value.toUpperCase())}
                  required
                  className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Engineer / Sender Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Engr. Musa / FSE Okon..."
                  value={waSender}
                  onChange={(e) => setWaSender(e.target.value)}
                  required
                  className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">WhatsApp Field Message / Group Update *</label>
              <textarea
                rows={4}
                placeholder="Paste or type WhatsApp update (e.g. 'FC2700 DG restored by FSE Engr John. ETA 20 mins for full battery float check')..."
                value={waMessage}
                onChange={(e) => setWaMessage(e.target.value)}
                required
                className="w-full bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-2 transition-all"
            >
              <span>{isOnline ? 'Log WhatsApp Intel Directly' : 'Queue WhatsApp Intel for Auto-Sync'}</span>
              <MessageSquare className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Sub-Tab 3: Pending Queue */}
      {activeSubTab === 'queue' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-amber-400" />
                Device Offline Queue ({pendingTotal} Unsynced Item(s))
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                These updates were recorded offline and will automatically upload when connected to the server network.
              </p>
            </div>

            {pendingTotal > 0 && (
              <button
                onClick={() => { clearPendingQueue(); refreshPendingQueues(); }}
                className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800 rounded-lg text-xs font-semibold flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Queue
              </button>
            )}
          </div>

          {pendingTotal === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs space-y-2">
              <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto" />
              <p className="font-semibold text-white">Queue is empty!</p>
              <p>All local SDM notes and WhatsApp updates on this device have been synchronized to the server backend.</p>
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* Pending Notes List */}
              {pendingNotes.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-cyan-300 block">Pending SDM Notes ({pendingNotes.length}):</span>
                  {pendingNotes.map((pn) => (
                    <div key={pn.local_id} className="p-3 bg-slate-900/80 rounded-xl border border-amber-500/30 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 bg-amber-950 text-amber-300 font-mono font-bold text-[10px] rounded">
                            {pn.site_id_str}
                          </span>
                          <span className="text-xs font-bold text-white">{pn.title}</span>
                          <span className="text-[10px] text-slate-400">({pn.category})</span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1 line-clamp-1">{pn.description}</p>
                      </div>

                      <button
                        onClick={() => { removePendingNote(pn.local_id); refreshPendingQueues(); }}
                        className="text-slate-500 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending WhatsApp Messages List */}
              {pendingWa.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-cyan-300 block">Pending WhatsApp Messages ({pendingWa.length}):</span>
                  {pendingWa.map((pw) => (
                    <div key={pw.local_id} className="p-3 bg-slate-900/80 rounded-xl border border-amber-500/30 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 bg-amber-950 text-amber-300 font-mono font-bold text-[10px] rounded">
                            {pw.site_id_str}
                          </span>
                          <span className="text-xs font-bold text-white">{pw.sender_name}</span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1 line-clamp-1">{pw.message_text}</p>
                      </div>

                      <button
                        onClick={() => { removePendingWhatsApp(pw.local_id); refreshPendingQueues(); }}
                        className="text-slate-500 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 4: Offline Site Cache */}
      {activeSubTab === 'cache' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Offline Site Database Cache ({cachedSites.length} Sites Saved)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Cached locally on this device so field engineers can search site configurations without internet connection.
              </p>
            </div>
          </div>

          {cachedSites.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No offline site cache stored yet. Connect to server network to auto-sync site records.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
              {cachedSites.slice(0, 50).map((site) => (
                <div 
                  key={site.id} 
                  onClick={() => onSelectSite(site.ihs_site_id)}
                  className="p-3 bg-slate-900/90 hover:bg-slate-800 rounded-xl border border-slate-800 cursor-pointer transition-all space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-cyan-300 font-mono">{site.ihs_site_id}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      site.is_down ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {site.operational_status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 truncate">{site.site_address}</p>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
                    <span>Power: {site.power_solution}</span>
                    <span>DG: {site.dg_capacity}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
