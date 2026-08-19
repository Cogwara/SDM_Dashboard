import React, { useState, useRef, useEffect } from 'react';
import { 
  Radio, Layers, FileText, MessageSquare, BarChart3, Map, 
  Bot, Smartphone, FileSpreadsheet, Network, UserCheck, 
  ShieldAlert, CheckSquare, Clock, Database, ShieldCheck, 
  ChevronLeft, ChevronRight, Pin, PinOff, Sparkles, Compass
} from 'lucide-react';
import { getPendingTotalCount } from '../mobileOfflineStorage';

export default function RightNavDrawer({ activeTab, setActiveTab, currentUser }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const leaveTimerRef = useRef(null);

  const pendingCount = getPendingTotalCount();

  const isExpanded = isHovered || isPinned;

  const handleMouseEnter = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    leaveTimerRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 250);
  };

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const navCategories = [
    {
      title: 'Core Operations',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: Layers, badge: null },
        { id: 'database', label: 'Site Database', icon: Radio, badge: '20.1K' },
        { id: 'daily_availability', label: 'Daily Availability', icon: Radio, badge: 'Daily' },
        { id: 'hourly_availability', label: 'Hourly Availability', icon: Clock, badge: '24H' },
      ]
    },
    {
      title: 'Field & Incident Control',
      items: [
        { id: 'wo_tracker', label: 'WO Tracker', icon: CheckSquare, badge: 'WO', highlight: true },
        { id: 'map', label: 'Live Geo Map', icon: Map, badge: 'Live' },
        { id: 'fiber_outages', label: 'Fiber Outages', icon: ShieldAlert, badge: 'RCA' },
        { id: 'tnl_links', label: 'Fiber & TNL Directory', icon: Network, badge: null },
        { id: 'mobile', label: 'Field Mobile App', icon: Smartphone, badge: pendingCount > 0 ? `${pendingCount}` : null },
      ]
    },
    {
      title: 'Intelligence & Lookups',
      items: [
        { id: 'hub_finder', label: 'Hub Site Finder', icon: Database, badge: null },
        { id: 'site_fse_lookup', label: 'Site to FSE Lookup', icon: UserCheck, badge: null },
        { id: 'fse_inspector', label: 'FSE & Notes Inspector', icon: FileSpreadsheet, badge: null },
        { id: 'notes', label: 'SDM Notes', icon: FileText, badge: null },
        { id: 'whatsapp', label: 'WhatsApp Intel', icon: MessageSquare, badge: null },
      ]
    },
    {
      title: 'Analytics & Management',
      items: [
        { id: 'ai', label: 'AI Operations Assistant', icon: Bot, badge: 'AI', aiGlow: true },
        { id: 'reports', label: 'Reports & Analytics', icon: BarChart3, badge: null },
      ]
    }
  ];

  if (currentUser && currentUser.is_superuser) {
    navCategories[3].items.push({
      id: 'admin', label: 'SDM Directory & Admin', icon: ShieldCheck, badge: 'Admin'
    });
  }

  let currentActiveItem = null;
  for (const cat of navCategories) {
    const found = cat.items.find(i => i.id === activeTab);
    if (found) {
      currentActiveItem = found;
      break;
    }
  }

  const ActiveIcon = currentActiveItem ? currentActiveItem.icon : Layers;

  return (
    <aside 
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`fixed top-16 left-0 bottom-0 z-50 transition-all duration-300 ease-in-out hidden lg:flex ${
        isExpanded ? 'w-80' : 'w-12'
      }`}
    >
      {/* Left Glassmorphic Container Box */}
      <div className="relative w-full h-full bg-slate-900/95 backdrop-blur-2xl border-r border-cyan-500/30 shadow-[10px_0_30px_rgba(6,182,212,0.15)] flex flex-col justify-between overflow-hidden">
        
        {/* Collapsed Left Edge Trigger Handle Bar */}
        {!isExpanded && (
          <div className="absolute inset-0 flex flex-col items-center justify-between py-6 cursor-pointer group">
            {/* Glowing Top Pulse Bar */}
            <div className="w-full flex flex-col items-center space-y-3">
              <div className="w-1.5 h-12 bg-gradient-to-b from-cyan-400 via-blue-500 to-indigo-600 rounded-full shadow-[0_0_12px_rgba(6,182,212,0.8)] group-hover:h-16 transition-all" />
              <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-500/20 animate-pulse">
                <ActiveIcon className="w-5 h-5 text-cyan-400" />
              </div>
            </div>

            {/* Vertical Label */}
            <div className="-rotate-90 text-[11px] font-extrabold tracking-widest uppercase text-cyan-400/80 group-hover:text-cyan-300 whitespace-nowrap flex items-center space-x-2">
              <span>&larr; NAVIGATION</span>
              <Compass className="w-3.5 h-3.5 rotate-90 text-cyan-400 animate-spin" style={{ animationDuration: '8s' }} />
            </div>

            {/* Bottom Glow Icon */}
            <div className="w-full flex flex-col items-center">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shadow-md" />
            </div>
          </div>
        )}

        {/* Expanded Full Left Drawer Header */}
        {isExpanded && (
          <>
            <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl shadow-md">
                  <Compass className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xs font-black tracking-wider uppercase text-white flex items-center gap-1.5">
                    <span>PORTAL NAVIGATION</span>
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  </h3>
                  <p className="text-[10px] text-cyan-400 font-semibold">Left Side Control Panel</p>
                </div>
              </div>

              {/* Pin / Lock Open Toggle Button */}
              <button
                onClick={() => setIsPinned(!isPinned)}
                className={`p-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 ${
                  isPinned 
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm' 
                    : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
                }`}
                title={isPinned ? "Unpin auto-hide navigation" : "Pin navigation open"}
              >
                {isPinned ? <Pin className="w-3.5 h-3.5 text-cyan-400" /> : <PinOff className="w-3.5 h-3.5" />}
                <span className="text-[10px] font-mono">{isPinned ? 'Pinned' : 'Auto'}</span>
              </button>
            </div>

            {/* Drawer Links Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-5 custom-scrollbar">
              {navCategories.map((category, catIdx) => (
                <div key={catIdx} className="space-y-1.5">
                  <div className="px-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                    <span>{category.title}</span>
                    <div className="h-[1px] flex-1 bg-slate-800 ml-2" />
                  </div>

                  <div className="space-y-1">
                    {category.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      const isHighlight = item.highlight;
                      const isAi = item.aiGlow;

                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id);
                            if (!isPinned) setIsHovered(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                            isActive
                              ? 'bg-gradient-to-r from-cyan-600/30 to-blue-600/30 text-cyan-200 border border-cyan-500/50 shadow-lg shadow-cyan-500/10 font-bold'
                              : isHighlight
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25 font-bold shadow-md'
                              : isAi
                              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/35 font-bold'
                              : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
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
                                : isHighlight 
                                ? 'bg-amber-400 text-slate-950 animate-pulse'
                                : isAi
                                ? 'bg-indigo-400 text-slate-950'
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

            {/* Footer indicator */}
            <div className="p-3 border-t border-slate-800/80 bg-slate-950/90 text-[10px] text-slate-400 flex items-center justify-between">
              <span className="font-mono">FCT SDM Control Center</span>
              <span className="text-cyan-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> Left Auto-Hide
              </span>
            </div>
          </>
        )}

      </div>
    </aside>
  );
}
