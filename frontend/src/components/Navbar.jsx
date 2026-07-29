import React, { useState, useEffect } from 'react';
import { 
  Radio, Search, Bell, Bot, Layers, FileText, MessageSquare, BarChart3, 
  Map, Maximize, Minimize, Sun, Moon, Sparkles, ChevronDown, User, LogOut, ShieldCheck, Smartphone, FileSpreadsheet, Network, PhoneCall, Wifi, WifiOff 
} from 'lucide-react';
import { getPendingTotalCount } from '../mobileOfflineStorage';
import { getSDMStateInfo } from '../utils/userUtils';

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  onSearchSite, 
  notifications, 
  onOpenNotifications, 
  currentTheme, 
  onThemeChange,
  currentUser,
  onLogout
}) {
  const [searchInput, setSearchInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

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
    { id: 'sky', label: 'Skyblueish (Default)', icon: Sparkles, color: 'text-cyan-400' },
    { id: 'dark', label: 'Dark Mode', icon: Moon, color: 'text-indigo-400' },
    { id: 'light', label: 'Light Mode', icon: Sun, color: 'text-amber-400' },
  ];

  const currentThemeObj = themes.find(t => t.id === currentTheme) || themes[0];
  const ThemeIcon = currentThemeObj.icon;
  const pendingCount = getPendingTotalCount();

  const baseNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Layers },
    { id: 'database', label: 'Site Database', icon: Radio },
    { id: 'ihs_matrix', label: 'IHS Matrix', icon: FileSpreadsheet },
    { id: 'tnl_links', label: 'TNL Links', icon: Network },
    { id: 'fse_inspector', label: 'FSE & Notes Inspector', icon: FileSpreadsheet },
    { id: 'notes', label: 'SDM Notes', icon: FileText },
    { id: 'whatsapp', label: 'WhatsApp Intel', icon: MessageSquare },
    { id: 'ai', label: 'AI Assistant', icon: Bot },
    { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
    { id: 'map', label: 'Live Geo Map', icon: Map },
    { id: 'mobile', label: `📱 Field Mobile App ${pendingCount > 0 ? `(${pendingCount})` : ''}`, icon: Smartphone },
  ];

  if (currentUser && currentUser.is_superuser) {
    baseNavItems.push({ id: 'admin', label: 'SDM Directory & Admin', icon: ShieldCheck });
  }


  const unreadCount = notifications ? notifications.filter(n => !n.is_read).length : 0;

  return (
    <header className="sticky top-0 z-40 glass-panel border-b border-slate-800/80">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="p-2 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20">
              <Radio className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-wider text-white">
                  {stateInfo.dashboardTitle}
                </span>
                <span className="px-2 py-0.5 text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-full">
                  v3.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {stateInfo.subtitle}
              </p>
            </div>
          </div>

          {/* Quick Search */}
          <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center flex-1 max-w-md mx-6">
            <div className="relative w-full">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Enter Site ID (e.g. FC2700)..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-slate-900/80 text-sm text-slate-200 placeholder-slate-500 pl-9 pr-4 py-2 rounded-xl border border-slate-700/60 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
              />
            </div>
          </form>

          {/* Right Controls & SDM User Profile */}
          <div className="flex items-center space-x-3">
            
            {/* Live Online / Offline Network Status Pill */}
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all">
              {isOnline ? (
                <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-lg shadow-sm" title="Connected to SDM Server">
                  <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>Online</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg shadow-sm" title="Working Offline - Actions will sync automatically when online">
                  <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-ping" />
                  <span>Offline ({pendingCount} pending)</span>
                </span>
              )}
            </div>

            {/* AI Ops Pill */}
            <button
              onClick={() => setActiveTab('ai')}
              className="flex items-center space-x-2 px-3 py-1.5 bg-gradient-to-r from-indigo-600/30 to-cyan-600/30 hover:from-indigo-600/50 hover:to-cyan-600/50 border border-cyan-500/40 text-cyan-300 text-xs font-medium rounded-xl transition-all shadow-md"
            >
              <Bot className="w-4 h-4 text-cyan-400 animate-bounce" />
              <span className="hidden sm:inline">AI Operations</span>
            </button>

            {/* Theme Selector Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="p-2 text-slate-200 bg-slate-900/80 hover:bg-slate-800/80 border border-slate-700 rounded-xl transition-all shadow-md flex items-center space-x-1.5"
                title="Select Theme"
              >
                <ThemeIcon className={`w-4 h-4 ${currentThemeObj.color}`} />
                <span className="hidden lg:inline text-xs font-semibold">{currentThemeObj.label.split(' ')[0]}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showThemeMenu && (
                <div className="absolute right-0 mt-2 w-48 glass-panel rounded-xl border border-slate-700 shadow-2xl z-50 py-1 space-y-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Dashboard Theme</div>
                  {themes.map((t) => {
                    const IconComp = t.icon;
                    const isSelected = currentTheme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          onThemeChange(t.id);
                          setShowThemeMenu(false);
                        }}
                        className={`w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium transition-all ${
                          isSelected ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <IconComp className={`w-4 h-4 ${t.color}`} />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Fullscreen Toggle Button */}
            <button
              onClick={toggleFullscreen}
              className="p-2 text-cyan-400 hover:text-white bg-slate-900/80 hover:bg-cyan-950/60 border border-cyan-500/30 rounded-xl transition-all shadow-md flex items-center space-x-1"
              title={isFullscreen ? "Exit Fullscreen" : "Toggle Fullscreen Mode"}
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              <span className="hidden xl:inline text-xs font-semibold px-1">{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
            </button>

            {/* Notifications Bell */}
            <button
              onClick={onOpenNotifications}
              className="relative p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-xl transition-all"
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white glow-badge-red">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Logged-in SDM User Profile Pill */}
            {currentUser && (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-cyan-500/40 rounded-xl transition-all shadow-md"
                >
                  <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow">
                    {currentUser.full_name ? currentUser.full_name.charAt(0).toUpperCase() : 'S'}
                  </div>
                  <div className="hidden md:block text-left">
                    <div className="text-xs font-bold text-white leading-none">{currentUser.full_name}</div>
                    <div className="text-[9px] text-cyan-400 font-semibold">{currentUser.role || 'SDM Manager'}</div>
                  </div>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-64 glass-panel rounded-2xl border border-slate-700 shadow-2xl z-50 p-3 space-y-3">
                    <div className="border-b border-slate-800 pb-2">
                      <div className="text-xs font-extrabold text-white">{currentUser.full_name}</div>
                      <div className="text-[11px] text-cyan-400 font-semibold">{currentUser.role}</div>
                      <div className="text-[10px] text-slate-400 mt-1 font-mono">{currentUser.email}</div>
                      <div className="text-[10px] text-slate-400 font-mono">Phone: {currentUser.phone || '0800-000-000'}</div>
                    </div>

                    {currentUser.is_superuser && (
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          setActiveTab('admin');
                        }}
                        className="w-full flex items-center justify-center space-x-2 px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/40 text-xs font-bold rounded-xl transition-all"
                      >
                        <ShieldCheck className="w-4 h-4 text-cyan-400" />
                        <span>SDM Admin Control</span>
                      </button>
                    )}

                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Assigned Sites:</span>
                        <b className="text-cyan-300 font-mono">
                          {currentUser.is_superuser 
                            ? 'All Sites (1,044)' 
                            : (currentUser.assigned_sites_count || 'Portfolio Sites')}
                        </b>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Scope:</span>
                        <b className="text-slate-200">{stateInfo.regionText}</b>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onLogout();
                      }}
                      className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-xs font-bold rounded-xl transition-all"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Log Out of Account</span>
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>

        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 overflow-x-auto no-scrollbar py-2 border-t border-slate-800/40">
          {baseNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-2 px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
