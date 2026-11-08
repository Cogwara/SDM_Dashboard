import React, { useState, useEffect, useRef } from 'react';
import {
  Radio, Search, Bell, Layers, FileText, CheckSquare, Calendar, Map, Database,
  Maximize, Minimize, Sun, Moon, Sparkles, ChevronDown, LogOut, ShieldCheck,
  Smartphone, UserCog, Menu, X
} from 'lucide-react';
import { getSDMStateInfo } from '../utils/userUtils';
import { getMediaUrl } from '../api';

export default function Navbar({
  activeTab,
  setActiveTab,
  onSearchSite,
  notifications,
  onOpenNotifications,
  currentTheme,
  onThemeChange,
  currentUser,
  onLogout,
  onToggleSidebar,
  isSidebarOpen,
  onOpenProfile
}) {
  const [searchInput, setSearchInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [openMenu, setOpenMenu] = useState(null); // 'theme' | 'user' | null
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  const themeMenuRef = useRef(null);
  const userMenuRef = useRef(null);

  const stateInfo = getSDMStateInfo(currentUser);
  const isMtnTheme = currentTheme === 'mtn' || currentTheme === 'mtn-dark';

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Close dropdowns on outside click / Escape
  useEffect(() => {
    if (!openMenu) return;
    const refs = { theme: themeMenuRef, user: userMenuRef };
    const handlePointerDown = (e) => {
      if (refs[openMenu].current && !refs[openMenu].current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [openMenu]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchInput.trim()) {
      onSearchSite(searchInput.trim().toUpperCase());
    }
  };

  const themes = [
    { id: 'mtn', label: 'MTN Operations (Gold)', icon: Radio },
    { id: 'mtn-dark', label: 'MTN Operations (Dark)', icon: Moon },
    { id: 'sky', label: 'Skyblueish (Default)', icon: Sparkles },
    { id: 'dark', label: 'Dark Mode', icon: Moon },
    { id: 'light', label: 'Light Mode', icon: Sun },
  ];

  const currentThemeObj = themes.find(t => t.id === currentTheme) || themes[0];
  const ThemeIcon = currentThemeObj.icon;
  const unreadCount = notifications ? notifications.filter(n => !n.is_read).length : 0;

  // Primary top navbar quick tabs
  const topTabs = [
    { id: 'noc_hub', label: 'NOC Hub', icon: Radio },
    { id: 'dashboard', label: 'Overview', icon: Layers },
    { id: 'daily_availability', label: 'Daily Avail', icon: Calendar },
    { id: 'map', label: 'Live Map', icon: Map },
    { id: 'database', label: 'Site Matrix', icon: Database },
    { id: 'notes', label: 'Field Notes', icon: FileText },
    { id: 'wo_tracker', label: 'WO Tracker', icon: CheckSquare },
  ];

  return (
    <header className={`sticky top-0 z-40 border-b transition-all ${
      isMtnTheme
        ? 'bg-[#FFCC00] border-b-2 border-black shadow-md text-black'
        : 'glass-panel border-[var(--border-color)]'
    }`}>
      <div className="w-full px-3 sm:px-5 lg:px-7">
        <div className="flex items-center justify-between gap-2 h-16">

          {/* ── Left: Drawer toggle + brand ───────────────────── */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onToggleSidebar}
              className="nav-btn"
              title="Toggle Menu & Navigation Drawer"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {isMtnTheme ? (
              <button
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setActiveTab('noc_hub')}
                title="Go to MTN NOC Hub"
              >
                <span className="px-2.5 py-1 bg-black text-[#FFCC00] font-black text-xs sm:text-sm rounded-lg tracking-wider">
                  MTN
                </span>
                <span className="flex flex-col items-start leading-tight">
                  <span className="font-extrabold text-sm text-black">Home</span>
                  <span className="text-[9px] font-bold text-black/60 uppercase tracking-widest">Network Ops</span>
                </span>
              </button>
            ) : (
              <button
                className="flex items-center gap-2.5 cursor-pointer select-none min-w-0"
                onClick={() => setActiveTab('dashboard')}
                title="Go to Overview"
              >
                <span className="w-9 h-9 shrink-0 flex items-center justify-center bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20 text-white">
                  <Radio className="w-5 h-5" />
                </span>
                <span className="flex flex-col items-start min-w-0">
                  <span className="font-black text-sm sm:text-base tracking-wide text-[var(--text-main)] leading-tight truncate">
                    {stateInfo.dashboardTitle || 'FCT SDM'}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] hidden md:block truncate max-w-[200px]">
                    {stateInfo.subtitle || 'SDM Field Operations Dashboard'}
                  </span>
                </span>
              </button>
            )}
          </div>

          {/* ── Center: quick-tab strip (desktop) ─────────────── */}
          <nav className="nav-tabs" aria-label="Quick navigation">
            {topTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  data-active={activeTab === tab.id}
                  className="nav-tab"
                  title={tab.label}
                >
                  <Icon />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* ── Right: search + controls + profile ────────────── */}
          <div className="flex items-center gap-1.5">
            {/* Site ID quick search */}
            <form onSubmit={handleSearchSubmit} className="hidden md:block w-40 lg:w-52">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                <input
                  type="text"
                  placeholder="Lookup Site ID..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="nav-search font-mono"
                />
              </div>
            </form>

            {/* Live connection status */}
            <span className="hidden lg:block">
              <span
                className="nav-btn px-2 cursor-default"
                title={isOnline ? 'Live — connected' : 'Offline — changes are queued locally'}
              >
                {isOnline ? (
                  <>
                    <SignalDot color="bg-emerald-400" ping />
                    <span className="hidden xl:inline">Online</span>
                  </>
                ) : (
                  <>
                    <SignalDot color="bg-amber-400" />
                    <span className="hidden xl:inline">Offline</span>
                  </>
                )}
              </span>
            </span>

            {/* Fullscreen */}
            <span className="hidden md:inline-block">
              <button
                onClick={toggleFullscreen}
                className="nav-btn"
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </span>

            {/* Notifications */}
            <button
              onClick={onOpenNotifications}
              className="nav-btn relative"
              title="Notifications"
            >
              <Bell className="w-4.5 h-4.5" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center shadow">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Theme selector */}
            <div className="relative" ref={themeMenuRef}>
              <button
                onClick={() => setOpenMenu(openMenu === 'theme' ? null : 'theme')}
                className="nav-btn"
                title="Change Theme"
              >
                <ThemeIcon className="w-4.5 h-4.5" />
                <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${openMenu === 'theme' ? 'rotate-180' : ''}`} />
              </button>

              {openMenu === 'theme' && (
                <div className="dropdown-surface absolute right-0 mt-2 w-52 rounded-2xl shadow-2xl p-1.5 z-50 space-y-0.5">
                  <p className="px-2 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                    Appearance
                  </p>
                  {themes.map((t) => {
                    const TIcon = t.icon;
                    const isActive = currentTheme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          onThemeChange(t.id);
                          setOpenMenu(null);
                        }}
                        data-active={isActive}
                        className="dropdown-item justify-between"
                      >
                        <span className="flex items-center gap-2">
                          <TIcon className="w-4 h-4 text-[var(--text-muted)]" />
                          <span>{t.label}</span>
                        </span>
                        {isActive && <span className="text-[10px] font-black text-[var(--text-main)]">●</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* User profile */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setOpenMenu(openMenu === 'user' ? null : 'user')}
                className="nav-btn"
                title="Account & Profile Menu"
              >
                <Avatar currentUser={currentUser} className="w-8 h-8 text-xs" />
                <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${openMenu === 'user' ? 'rotate-180' : ''}`} />
              </button>

              {openMenu === 'user' && (
                <div className="dropdown-surface absolute right-0 mt-2 w-64 rounded-2xl shadow-2xl p-1.5 z-50 space-y-0.5">
                  {/* Identity card */}
                  <button
                    onClick={() => { setOpenMenu(null); if (onOpenProfile) onOpenProfile(); }}
                    className="dropdown-item rounded-xl"
                  >
                    <Avatar currentUser={currentUser} className="w-9 h-9 text-xs shrink-0" />
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="font-bold text-[var(--text-main)] truncate">
                        {currentUser?.full_name || 'SDM Engineer'}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] font-semibold truncate">
                        {currentUser?.role || 'State Delivery Manager'}
                      </span>
                    </span>
                    {currentUser?.is_superuser && (
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 text-[9px] font-black tracking-wide shrink-0">
                        ADMIN
                      </span>
                    )}
                  </button>

                  <div className="h-px my-1 bg-[var(--border-color)]" />

                  <button
                    onClick={() => { setOpenMenu(null); if (onOpenProfile) onOpenProfile(); }}
                    className="dropdown-item"
                  >
                    <UserCog className="w-4 h-4" />
                    <span>My Profile & Account</span>
                  </button>

                  <button
                    onClick={() => { setOpenMenu(null); setActiveTab('mobile'); }}
                    className="dropdown-item"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Field Mobile App View</span>
                  </button>

                  {currentUser?.is_superuser && (
                    <button
                      onClick={() => { setOpenMenu(null); setActiveTab('admin'); }}
                      className="dropdown-item"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>SDM User Admin</span>
                    </button>
                  )}

                  <div className="h-px my-1 bg-[var(--border-color)]" />

                  <button
                    onClick={() => { setOpenMenu(null); onLogout(); }}
                    className="dropdown-item"
                    data-variant="danger"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}

function Avatar({ currentUser, className = 'w-8 h-8 text-xs' }) {
  const ringClass = currentUser?.is_superuser
    ? 'ring-2 ring-amber-400/60'
    : currentUser?.role === 'MTN RDM'
      ? 'ring-2 ring-indigo-400/60'
      : 'ring-2 ring-cyan-400/50';

  return (
    <span className={`${className} rounded-full overflow-hidden flex items-center justify-center font-black shrink-0 ${ringClass} ${
      currentUser?.is_superuser ? 'bg-amber-500/15 text-amber-400'
      : currentUser?.role === 'MTN RDM' ? 'bg-indigo-500/15 text-indigo-400'
      : 'bg-cyan-500/15 text-cyan-400'
    }`}>
      {currentUser?.avatar_url ? (
        <img
          src={getMediaUrl(currentUser.avatar_url)}
          alt={currentUser.full_name || 'User'}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{currentUser?.full_name ? currentUser.full_name.charAt(0).toUpperCase() : 'S'}</span>
      )}
    </span>
  );
}

function SignalDot({ color, ping = false }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {ping && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-60`} />}
      <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
    </span>
  );
}
