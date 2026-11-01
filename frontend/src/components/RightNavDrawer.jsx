import React, { useEffect } from 'react';
import { 
  Radio, Layers, FileText, MessageSquare, BarChart3, Map, 
  Bot, Smartphone, FileSpreadsheet, Network, UserCheck, 
  ShieldAlert, CheckSquare, Clock, Database, ShieldCheck, 
  X, Sparkles, Download, LogOut, ChevronRight, User, UserCog, Edit3
} from 'lucide-react';
import { getPendingTotalCount } from '../mobileOfflineStorage';
import { getSDMStateInfo } from '../utils/userUtils';
import { getMediaUrl } from '../api';

export default function RightNavDrawer({ isOpen, onClose, activeTab, setActiveTab, currentUser, onLogout, onOpenProfile }) {
  const pendingCount = getPendingTotalCount();
  const stateInfo = getSDMStateInfo(currentUser);

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const navCategories = [
    {
      title: 'Core Operations',
      items: [
        { id: 'noc_hub', label: 'MTN NOC Operations Hub', icon: Radio, badge: 'MTN' },
        { id: 'dashboard', label: 'Dashboard Overview', icon: Layers },
        { id: 'daily_availability', label: 'Daily Availability Center', icon: Radio, badge: 'Daily' },
        { id: 'hourly_availability', label: 'Hourly Availability (24H)', icon: Clock, badge: '24H' },
        { id: 'database', label: 'Site Database & Matrix', icon: Database, badge: '20.1k' },
      ]
    },
    {
      title: 'Field & Incident Control',
      items: [
        { id: 'map', label: 'Live Geo Map & 4G Sectors', icon: Map, badge: 'Live' },
        { id: 'wo_tracker', label: 'Work Order (WO) Tracker', icon: CheckSquare, badge: 'WO' },
        { id: 'fiber_outages', label: 'Fiber Outages & RCA', icon: ShieldAlert, badge: 'RCA' },
        { id: 'tnl_links', label: 'Fiber & TNL Ring Directory', icon: Network },
        { id: 'mobile', label: 'Field Mobile App View', icon: Smartphone, badge: pendingCount > 0 ? `${pendingCount}` : null },
      ]
    },
    {
      title: 'Field Intelligence & Directory',
      items: [
        { id: 'hub_finder', label: 'Hub Site Analyzer', icon: Database },
        { id: 'site_fse_lookup', label: 'Site to FSE Lookup', icon: UserCheck },
        { id: 'fse_inspector', label: 'FSE Notes Inspector', icon: FileSpreadsheet },
        { id: 'notes', label: 'SDM Operational Notes', icon: FileText },
        { id: 'whatsapp', label: 'WhatsApp Intelligence Feed', icon: MessageSquare },
      ]
    },
    {
      title: 'Analytics & Management',
      items: [
        { id: 'ai', label: 'AI Operations Assistant', icon: Bot, badge: 'AI' },
        { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
      ]
    }
  ];

  if (currentUser && currentUser.is_superuser) {
    navCategories[3].items.push({
      id: 'admin', label: 'SDM Admin Directory', icon: ShieldCheck, badge: 'Admin'
    });
  }

  const isRdm = currentUser?.role === 'MTN RDM';
  const isSuperuser = currentUser?.is_superuser;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      
      {/* Darkened Backdrop Overlay */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
      />

      {/* Slide-out Left Drawer Panel */}
      <aside className="fixed inset-y-0 left-0 max-w-sm w-full bg-slate-900/98 backdrop-blur-2xl border-r border-slate-800 shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-left duration-300">
        
        {/* Drawer Header with User Profile Quick Card */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/90 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20 text-white">
                <Radio className="w-4 h-4 animate-pulse" />
              </div>
              <h2 className="text-xs font-black text-white tracking-wide flex items-center gap-1.5">
                <span>{stateInfo.dashboardTitle || 'SDM Portal'}</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                  v3.0
                </span>
              </h2>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-900 rounded-xl border border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
              title="Close Menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User Profile Quick Card */}
          <div 
            onClick={() => {
              onClose();
              if (onOpenProfile) onOpenProfile();
            }}
            className="p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 transition-all cursor-pointer group flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center space-x-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center font-bold text-sm border shrink-0 ${
                isSuperuser
                  ? 'border-amber-400/60 bg-amber-950 text-amber-300'
                  : isRdm
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
                  <span>{currentUser?.full_name ? currentUser.full_name.charAt(0).toUpperCase() : 'U'}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate group-hover:text-cyan-300 transition-colors">
                  {currentUser?.full_name || 'State Delivery Manager'}
                </div>
                <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                  <span className={isRdm ? 'text-indigo-400 font-semibold' : 'text-cyan-400 font-semibold'}>
                    {currentUser?.role || 'SDM Manager'}
                  </span>
                  <span>•</span>
                  <span>@{currentUser?.username || 'user'}</span>
                </div>
              </div>
            </div>

            <div className="p-1.5 rounded-lg bg-slate-800 text-slate-400 group-hover:text-cyan-400 group-hover:bg-cyan-500/10 transition-all">
              <Edit3 className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Categorized Navigation Menu Links */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          {navCategories.map((category, catIdx) => (
            <div key={catIdx} className="space-y-2">
              <div className="px-2 text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span>{category.title}</span>
                <div className="h-[1px] flex-1 bg-slate-800/80 ml-2" />
              </div>

              <div className="space-y-1">
                {category.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-cyan-600/30 to-blue-600/30 text-cyan-200 border border-cyan-500/50 shadow-lg shadow-cyan-500/10 font-bold'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className={`p-1.5 rounded-lg transition-transform group-hover:scale-110 ${
                          isActive ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400 group-hover:text-cyan-400'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="truncate">{item.label}</span>
                      </div>

                      {item.badge && (
                        <span className={`px-2 py-0.5 text-[9px] font-black rounded-full font-mono uppercase shadow-sm ${
                          isActive 
                            ? 'bg-cyan-400 text-slate-950' 
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Drawer Footer with APK Download & Logout */}
        <div className="p-4 border-t border-slate-800/90 bg-slate-950/90 space-y-2.5">
          
          {/* Direct APK Download Card */}
          <a
            href="https://ice-powerseller-clerk-where.trycloudflare.com/media/downloads/FCT_SDM_Mobile_v3.apk"
            download="FCT_SDM_Mobile_v3.apk"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-cyan-200" />
            <span>Download Android APK (v3.0)</span>
          </a>

          {/* Logout Button */}
          {onLogout && (
            <button
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="w-full py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 text-xs font-bold rounded-xl border border-rose-500/30 transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out Account</span>
            </button>
          )}

        </div>

      </aside>
    </div>
  );
}
