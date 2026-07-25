import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import DashboardOverview from './components/DashboardOverview';
import SiteDatabase from './components/SiteDatabase';
import SiteProfile from './components/SiteProfile';
import NotesCenter from './components/NotesCenter';
import WhatsAppCenter from './components/WhatsAppCenter';
import AIAssistantModal from './components/AIAssistantModal';
import ReportsAnalytics from './components/ReportsAnalytics';
import GeoMap from './components/GeoMap';
import SDMLoginModal from './components/SDMLoginModal';
import SDMUserManagement from './components/SDMUserManagement';
import MobileAppView from './components/MobileAppView';
import { fetchDashboardStats, fetchNotes, fetchWhatsAppMessages, fetchNotifications, markAllNotificationsRead } from './api';
import { Bell, CheckCircle, AlertTriangle, Radio, Eye, Bot, X, ShieldAlert, Clock, MapPin, User } from 'lucide-react';

export default function App() {
  const isMobileNative = typeof window !== 'undefined' && (
    (typeof window.Capacitor !== 'undefined' && window.Capacitor?.isNativePlatform?.() && window.Capacitor?.getPlatform?.() !== 'web') ||
    (typeof window.Capacitor !== 'undefined' && (window.Capacitor?.getPlatform?.() === 'android' || window.Capacitor?.getPlatform?.() === 'ios')) ||
    window.location.protocol === 'capacitor:' || 
    window.location.protocol === 'file:'
  );
  const [activeTab, setActiveTab] = useState(() => isMobileNative ? 'mobile' : 'dashboard');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  
  // SDM User Auth State - Require authentication by default
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('fct_sdm_user');
      return saved && saved !== 'undefined' ? JSON.parse(saved) : null;
    } catch (e) {
      console.error('Failed to parse saved user credentials:', e);
      return null;
    }
  });


  // Theme state
  const [theme, setTheme] = useState(() => localStorage.getItem('fct_sdm_theme') || 'sky');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fct_sdm_theme', theme);
  }, [theme]);

  // Database Filter states
  const [dbSearch, setDbSearch] = useState('');
  const [dbStatus, setDbStatus] = useState('All');
  const [dbPriority, setDbPriority] = useState('All');

  // Data states
  const [stats, setStats] = useState(null);
  const [recentNotes, setRecentNotes] = useState([]);
  const [recentWhatsApp, setRecentWhatsApp] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);

  const loadGlobalData = async () => {
    if (!currentUser) return;
    try {
      const sdmParam = !currentUser.is_superuser ? currentUser.full_name : undefined;

      const statsRes = await fetchDashboardStats({ sdm: sdmParam });
      setStats(statsRes);

      const notesRes = await fetchNotes({ sdm: sdmParam, page_size: 5 });
      setRecentNotes(notesRes.results || notesRes);

      const waRes = await fetchWhatsAppMessages({ sdm: sdmParam, page_size: 5 });
      setRecentWhatsApp(waRes.results || waRes);

      const notifRes = await fetchNotifications({ sdm: sdmParam });
      setNotifications(notifRes.results || notifRes);
    } catch (e) {
      console.error('Data load error:', e);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadGlobalData();
      const interval = setInterval(loadGlobalData, 30000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  const handleLoginSuccess = (userObj, token) => {
    localStorage.setItem('fct_sdm_token', token);
    localStorage.setItem('fct_sdm_user', JSON.stringify(userObj));
    setCurrentUser(userObj);
  };

  const handleLogout = () => {
    localStorage.removeItem('fct_sdm_token');
    localStorage.removeItem('fct_sdm_user');
    setCurrentUser(null);
  };

  const handleSelectSite = (siteId) => {
    setSelectedSiteId(siteId);
    setActiveTab('profile');
  };

  const handleNavigateWithFilter = (targetTab, filters = {}) => {
    if (filters.status !== undefined) setDbStatus(filters.status);
    if (filters.priority !== undefined) setDbPriority(filters.priority);
    if (filters.search !== undefined) setDbSearch(filters.search);
    setActiveTab(targetTab);
  };

  const handleMarkAllRead = async () => {
    try {
      const sdmParam = currentUser && !currentUser.is_superuser ? currentUser.full_name : undefined;
      await markAllNotificationsRead({ sdm: sdmParam });
      loadGlobalData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleNotificationClick = (notif) => {
    setSelectedNotification(notif);
    setShowNotifications(false);
  };

  // Enforce SDM Authentication Portal if not logged in!
  if (!currentUser) {
    return <SDMLoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  // Direct Mobile View ONLY for Android Native APK App
  if (isMobileNative) {
    return (
      <div className="min-h-screen font-sans w-full overflow-x-hidden p-2 sm:p-4">
        <MobileAppView currentUser={currentUser} onLogout={handleLogout} onSelectSite={handleSelectSite} currentTheme={theme} onThemeChange={setTheme} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans w-full overflow-x-hidden">

      
      {/* Navbar Header */}
      <Navbar
        activeTab={activeTab === 'profile' ? 'database' : activeTab}
        setActiveTab={(tab) => {
          if (tab === 'database') {
            setDbSearch('');
            setDbStatus('All');
            setDbPriority('All');
          }
          setActiveTab(tab);
        }}
        onSearchSite={handleSelectSite}
        notifications={notifications}
        onOpenNotifications={() => setShowNotifications(!showNotifications)}
        currentTheme={theme}
        onThemeChange={setTheme}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Workspace Container */}
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
        
        {activeTab === 'dashboard' && (
          <DashboardOverview
            stats={stats}
            onSearchSite={handleSelectSite}
            onSelectSite={handleSelectSite}
            recentNotes={recentNotes}
            recentWhatsApp={recentWhatsApp}
            setActiveTab={setActiveTab}
            onNavigateWithFilter={handleNavigateWithFilter}
          />
        )}

        {activeTab === 'database' && (
          <SiteDatabase
            currentUser={currentUser}
            onSelectSite={handleSelectSite}
            initialSearch={dbSearch}
            initialStatus={dbStatus}
            initialPriority={dbPriority}
          />
        )}

        {activeTab === 'profile' && (
          <SiteProfile
            siteId={selectedSiteId}
            currentUser={currentUser}
            onBack={() => setActiveTab('database')}
            onOpenAIWithPrompt={() => setActiveTab('ai')}
          />
        )}

        {activeTab === 'notes' && (
          <NotesCenter onSelectSite={handleSelectSite} currentUser={currentUser} />
        )}

        {activeTab === 'whatsapp' && (
          <WhatsAppCenter onSelectSite={handleSelectSite} currentUser={currentUser} />
        )}

        {activeTab === 'ai' && (
          <AIAssistantModal
            initialSiteId={selectedSiteId}
            onSelectSite={handleSelectSite}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsAnalytics onSelectSite={handleSelectSite} currentUser={currentUser} />
        )}

        {activeTab === 'map' && (
          <GeoMap onSelectSite={handleSelectSite} currentUser={currentUser} />
        )}

        {activeTab === 'mobile' && (
          <MobileAppView currentUser={currentUser} onSelectSite={handleSelectSite} currentTheme={theme} onThemeChange={setTheme} />
        )}

        {activeTab === 'admin' && currentUser && currentUser.is_superuser && (
          <SDMUserManagement currentUser={currentUser} />
        )}

      </main>


      {/* Notifications Popover */}
      {showNotifications && (
        <div className="fixed top-16 right-4 sm:right-8 z-50 w-80 sm:w-96 glass-panel rounded-2xl p-4 border border-slate-700 shadow-2xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-cyan-400" /> Notifications ({notifications.length})
            </h4>
            <button
              onClick={handleMarkAllRead}
              className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
            >
              <CheckCircle className="w-3 h-3" /> Mark all read
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {notifications && notifications.length > 0 ? (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all hover:border-cyan-400/60 ${
                    n.is_read ? 'bg-slate-900/50 border-slate-800 text-slate-400' : 'bg-slate-900 border-cyan-500/40 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-[11px]">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                      n.alert_type === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      n.alert_type === 'WARNING' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                      'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    }`}>
                      {n.alert_type}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="font-bold text-slate-100 mt-1">{n.title}</div>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                </div>
              ))
            ) : (
              <div className="text-center text-slate-500 py-6 text-xs">No active alerts for your portfolio.</div>
            )}
          </div>
        </div>
      )}

      {/* Detailed Notification Modal */}
      {selectedNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="glass-panel max-w-lg w-full p-6 rounded-3xl border border-slate-700 shadow-2xl space-y-5">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div className={`p-2.5 rounded-2xl ${
                  selectedNotification.alert_type === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                  selectedNotification.alert_type === 'WARNING' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                  'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                }`}>
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    Operational Alert Detail &bull; {selectedNotification.alert_type}
                  </span>
                  <h3 className="text-base font-extrabold text-white leading-snug">{selectedNotification.title}</h3>
                </div>
              </div>

              <button
                onClick={() => setSelectedNotification(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notification Metadata Pill */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px]">TIMESTAMP</span>
                <span className="font-mono text-slate-200 font-semibold flex items-center gap-1 mt-0.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  {new Date(selectedNotification.created_at).toLocaleString()}
                </span>
              </div>

              <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px]">ASSOCIATED SITE ID</span>
                <span className="font-mono text-cyan-300 font-extrabold flex items-center gap-1 mt-0.5">
                  <Radio className="w-3.5 h-3.5 text-cyan-400" />
                  {selectedNotification.site ? selectedNotification.site.ihs_site_id : 'System-Wide'}
                </span>
              </div>
            </div>

            {/* Notification Message Content */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs text-slate-300 space-y-2">
              <span className="font-bold text-slate-200 block text-[11px]">ALERT DESCRIPTION & RCA TELEMETRY:</span>
              <p className="leading-relaxed font-sans">{selectedNotification.message}</p>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-800">
              {selectedNotification.site && (
                <>
                  <button
                    onClick={() => {
                      const sId = selectedNotification.site.ihs_site_id;
                      setSelectedNotification(null);
                      handleSelectSite(sId);
                    }}
                    className="w-full sm:w-auto px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Open Site Profile</span>
                  </button>

                  <button
                    onClick={() => {
                      const sId = selectedNotification.site.ihs_site_id;
                      setSelectedNotification(null);
                      setSelectedSiteId(sId);
                      setActiveTab('ai');
                    }}
                    className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5"
                  >
                    <Bot className="w-4 h-4 text-cyan-300" />
                    <span>AI RCA Diagnostics</span>
                  </button>
                </>
              )}

              <button
                onClick={() => setSelectedNotification(null)}
                className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="glass-panel border-t border-slate-800/80 py-4 mt-8 text-center text-xs text-slate-500">
        <p>FCT SDM Dashboard v2.0 &bull; Logged in as: <b className="text-slate-300">{currentUser.full_name}</b> ({currentUser.role}) &bull; Federal Capital Territory</p>
      </footer>

    </div>
  );
}
