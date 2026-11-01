import React, { useState, useEffect } from 'react';
import { 
  Radio, Search, Bell, Bot, Layers, FileText, MessageSquare, BarChart3, 
  Map, Maximize, Minimize, Sun, Moon, Sparkles, ChevronDown, User, LogOut, ShieldCheck, Smartphone, FileSpreadsheet, Network, PhoneCall, Wifi, WifiOff, Database, UserCheck, ShieldAlert, CheckSquare, Clock, Compass, Menu, X, Calendar, UserCog
} from 'lucide-react';
import { getPendingTotalCount } from '../mobileOfflineStorage';
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
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  const stateInfo = getSDMStateInfo(currentUser);

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
    { id: 'mtn', label: 'MTN Operations (Gold)', icon: Radio, color: 'text-amber-400' },
    { id: 'mtn-dark', label: 'MTN Operations (Dark)', icon: Moon, color: 'text-amber-300' },
    { id: 'sky', label: 'Skyblueish (Default)', icon: Sparkles, color: 'text-cyan-400' },
    { id: 'dark', label: 'Dark Mode', icon: Moon, color: 'text-indigo-400' },
    { id: 'light', label: 'Light Mode', icon: Sun, color: 'text-amber-400' },
  ];

  const currentThemeObj = themes.find(t => t.id === currentTheme) || themes[0];
  const ThemeIcon = currentThemeObj.icon;
  const unreadCount = notifications ? notifications.filter(n => !n.is_read).length : 0;
  const isMtnTheme = currentTheme === 'mtn' || currentTheme === 'mtn-dark';

  // Primary top navbar quick tabs
  const topTabs = [
    { id: 'noc_hub', label: 'NOC Hub', icon: Radio, badge: 'MTN' },
    { id: 'dashboard', label: 'Overview', icon: Layers },
    { id: 'daily_availability', label: 'Daily Avail', icon: Calendar },
    { id: 'map', label: 'Live Map', icon: Map },
    { id: 'database', label: 'Site Matrix', icon: Database },
    { id: 'notes', label: 'Field Notes', icon: FileText },
    { id: 'wo_tracker', label: 'WO Tracker', icon: CheckSquare },
  ];

  return (
    <header className={`sticky top-0 z-40 glass-panel border-b transition-all ${
      isMtnTheme 
        ? 'bg-[#FFCC00] border-black text-black shadow-md' 
        : 'border-slate-800/80 bg-slate-950/80 backdrop-blur-xl'
    }`}>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Hamburger Menu Toggle & Dashboard Branding */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onToggleSidebar}
              className={`p-2.5 rounded-xl border shadow-md transition-all flex items-center justify-center cursor-pointer ${
                isMtnTheme
                  ? 'bg-black text-[#FFCC00] border-black hover:bg-slate-900'
                  : 'text-slate-300 hover:text-white bg-slate-900/90 border-slate-700/80 hover:border-cyan-500/50'
              }`}
              title="Toggle Menu & Navigation Drawer"
            >
              {isSidebarOpen ? (
                <X className={`w-5 h-5 ${isMtnTheme ? 'text-[#FFCC00]' : 'text-cyan-400'}`} />
              ) : (
                <Menu className={`w-5 h-5 ${isMtnTheme ? 'text-[#FFCC00]' : 'text-slate-300'}`} />
              )}
            </button>

            {isMtnTheme ? (
              <div 
                className="flex items-center space-x-2.5 cursor-pointer select-none" 
                onClick={() => setActiveTab('noc_hub')}
              >
                <div className="px-2.5 py-1 bg-black text-[#FFCC00] font-black text-xs sm:text-sm rounded-full tracking-wider shadow-sm flex items-center justify-center border border-black">
                  MTN
                </div>
                <div className="flex flex-col">
                  <span className="font-extrabold text-sm text-black leading-tight">Home</span>
                  <span className="text-[9px] font-bold text-slate-900/80 uppercase tracking-wider">NETWORK OPERATIONS</span>
                </div>
              </div>
            ) : (
              <div 
                className="flex items-center space-x-3 cursor-pointer select-none" 
                onClick={() => setActiveTab('dashboard')}
              >
                <div className="p-2 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20 text-white">
                  <Radio className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-black text-base sm:text-lg tracking-wide text-white">
                      {stateInfo.dashboardTitle || 'FCT SDM'}
                    </span>
                    <span className="px-2 py-0.5 text-[9px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-full">
                      v3.0
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 hidden md:block">
                    {stateInfo.subtitle || 'SDM Field Operations Dashboard'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Center Brand Title in MTN Theme */}
          {isMtnTheme && (
            <div className="font-black text-base text-black tracking-tight hidden lg:block">
              Home Page
            </div>
          )}

          {/* Quick Tabs in Top Header (Desktop) */}
          <nav className="hidden xl:flex items-center space-x-1">
            {topTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Quick Search */}
          <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center flex-1 max-w-xs mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Lookup Site ID..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-slate-900/90 text-xs text-slate-200 placeholder-slate-500 pl-9 pr-4 py-2 rounded-xl border border-slate-700/60 focus:outline-none focus:border-cyan-500 font-mono transition-all"
              />
            </div>
          </form>

          {/* Right Controls & Profile */}
          <div className="flex items-center space-x-2.5">
            
            {/* Live Online Status */}
            <div className="hidden sm:flex items-center space-x-1.5 px-2 py-1 rounded-xl text-[11px] font-bold">
              {isOnline ? (
                <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-lg shadow-sm">
                  <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span className="hidden lg:inline">ONLINE</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg shadow-sm">
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>OFFLINE</span>
                </span>
              )}
            </div>

            {/* Quick Switch to Mobile App View */}
            <button
              onClick={() => setActiveTab('mobile')}
              className="px-2.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Switch to Mobile App View"
            >
              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Mobile View</span>
            </button>

            {/* Notifications Bell */}
            <button
              onClick={onOpenNotifications}
              className="p-2 rounded-xl text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all relative cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4 text-cyan-400" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Theme Selector & MTN Dark/Light Switch Pill */}
            {isMtnTheme ? (
              <button
                onClick={() => onThemeChange(currentTheme === 'mtn' ? 'mtn-dark' : 'mtn')}
                className="px-3 py-1.5 bg-black text-[#FFCC00] hover:bg-slate-900 border border-black rounded-full text-xs font-black flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="Toggle MTN Dark / Light Mode"
              >
                {currentTheme === 'mtn' ? (
                  <>
                    <Moon className="w-3.5 h-3.5 text-[#FFCC00] fill-[#FFCC00]" />
                    <span>Dark</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-3.5 h-3.5 text-[#FFCC00]" />
                    <span>Light</span>
                  </>
                )}
              </button>
            ) : null}

            {/* Theme Menu Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className={`p-2 rounded-xl border transition-all flex items-center gap-1 cursor-pointer ${
                  isMtnTheme
                    ? 'bg-black text-[#FFCC00] border-black hover:bg-slate-900'
                    : 'text-slate-300 hover:text-white bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
                title="Change Theme"
              >
                <ThemeIcon className={`w-4 h-4 ${isMtnTheme ? 'text-[#FFCC00]' : currentThemeObj.color}`} />
              </button>
              
              {showThemeMenu && (
                <div className="absolute right-0 mt-2 w-44 rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl p-1 z-50 animate-in fade-in duration-150">
                  {themes.map((t) => {
                    const TIcon = t.icon;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          onThemeChange(t.id);
                          setShowThemeMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                          currentTheme === t.id ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        <TIcon className={`w-4 h-4 ${t.color}`} />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all hidden sm:flex cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {isFullscreen ? <Minimize className="w-4 h-4 text-cyan-400" /> : <Maximize className="w-4 h-4 text-slate-400" />}
            </button>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition-all cursor-pointer shadow-sm"
                title="Account & Profile Menu"
              >
                <div className={`w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center font-bold text-xs border ${
                  currentUser?.is_superuser
                    ? 'border-amber-400/60 bg-amber-950 text-amber-300'
                    : currentUser?.role === 'MTN RDM'
                      ? 'border-indigo-400/60 bg-indigo-950 text-indigo-300'
                      : 'border-cyan-400/60 bg-slate-800 text-cyan-300'
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
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 pr-0.5" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in duration-150 space-y-1">
                  <div 
                    onClick={() => {
                      setShowUserMenu(false);
                      if (onOpenProfile) onOpenProfile();
                    }}
                    className="p-2 border-b border-slate-800/80 hover:bg-slate-900/60 rounded-xl cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-slate-700 bg-slate-800 flex items-center justify-center text-xs font-bold text-cyan-300">
                        {currentUser?.avatar_url ? (
                          <img
                            src={getMediaUrl(currentUser.avatar_url)}
                            alt={currentUser.full_name || 'User'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{currentUser?.full_name ? currentUser.full_name.charAt(0).toUpperCase() : 'U'}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs text-white truncate">{currentUser?.full_name || 'SDM Engineer'}</div>
                        <div className="text-[10px] text-cyan-400 font-semibold truncate">{currentUser?.role || 'State Delivery Manager'}</div>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      if (onOpenProfile) onOpenProfile();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-cyan-950/40 hover:text-cyan-300 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <UserCog className="w-3.5 h-3.5 text-cyan-400" />
                    <span>My Profile & Account Details</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setActiveTab('mobile');
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-900 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Field Mobile App View</span>
                  </button>

                  {currentUser?.is_superuser && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        setActiveTab('admin');
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-900 flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                      <span>SDM User Admin</span>
                    </button>
                  )}

                  <div className="pt-1 border-t border-slate-800/80">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onLogout();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-950/40 flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-400" />
                      <span>Log Out Account</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>
      </div>
    </header>
  );
}
