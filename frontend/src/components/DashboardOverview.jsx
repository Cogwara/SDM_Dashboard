import React, { useState, useEffect } from 'react';
import { 
  Radio, ShieldAlert, AlertTriangle, Zap, Wrench, Signal, BatteryCharging, 
  FileText, MessageSquare, Search, ArrowRight, Activity, TrendingUp, CheckCircle, Clock,
  Network, Layers, ExternalLink, ChevronRight, Filter, MapPin, Cpu, Calendar, CheckSquare, Sparkles, Smartphone,
  Users, Phone, UserCheck, RefreshCw
} from 'lucide-react';
import { getSDMStateInfo } from '../utils/userUtils';

export default function DashboardOverview({ 
  stats, 
  onSearchSite, 
  onSelectSite, 
  onNavigateToAvailability, 
  recentNotes, 
  recentWhatsApp, 
  setActiveTab, 
  onNavigateWithFilter, 
  currentUser 
}) {
  const [siteQuery, setSiteQuery] = useState('');
  const stateInfo = getSDMStateInfo(currentUser);
  const isFse = currentUser?.role === 'SMC FSE Engineer' || currentUser?.role === 'FSE Engineer';
  const isRdm = currentUser?.role === 'MTN RDM' || currentUser?.role === 'Regional Delivery Manager';

  const [supervisedSdms, setSupervisedSdms] = useState(currentUser?.sdms_under_rdm || []);
  const [loadingSdms, setLoadingSdms] = useState(false);

  useEffect(() => {
    if (isRdm || currentUser?.is_superuser) {
      setLoadingSdms(true);
      const rdmQueryName = isRdm ? (currentUser.full_name || currentUser.username) : 'Onikola Lukman Adesina';
      fetch(`/api/v1/rdm/sdms/?rdm=${encodeURIComponent(rdmQueryName)}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.sdms && data.sdms.length > 0) {
            setSupervisedSdms(data.sdms);
          }
        })
        .catch(err => console.error('Failed to fetch supervised SDMs:', err))
        .finally(() => setLoadingSdms(false));
    }
  }, [currentUser, isRdm]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (siteQuery.trim()) {
      onSearchSite(siteQuery.trim().toUpperCase());
    }
  };

  const totalSites = stats?.total_sites ?? (isFse ? (currentUser?.assigned_sites_count || 63) : (isRdm ? (currentUser?.assigned_sites_count || 2767) : (currentUser?.is_superuser ? 20174 : 1050)));
  const sitesDown = stats?.sites_down ?? 0;
  const criticalSites = stats?.critical_sites ?? 0;
  const powerOutages = stats?.commercial_power_outage ?? 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      
      {/* 🌟 Clean Modern Hero Header & Instant Search Bar */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 relative overflow-hidden border border-slate-800 shadow-2xl bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-900/90">
        <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {stateInfo.code || 'FCT'} PORTFOLIO
              </span>
              <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live Telemetry
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {stateInfo.controlCenterTitle || 'State Delivery Operations'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Real-time telecom site performance, 4G LTE coverage sectors, and field incident management.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('daily_availability')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl border border-slate-700 text-xs font-bold transition-all shadow flex items-center gap-2 cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-cyan-400" />
              <span>Daily Availability</span>
            </button>
            <button
              onClick={() => setActiveTab('map')}
              className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2 cursor-pointer"
            >
              <MapPin className="w-4 h-4" />
              <span>Live Geo Map</span>
            </button>
          </div>
        </div>

        {/* Instant Site Lookup Search Bar */}
        <form onSubmit={handleSearch} className="mt-6">
          <div className="flex items-center bg-slate-950/90 border border-cyan-500/40 rounded-2xl p-2 shadow-2xl shadow-cyan-950/40">
            <Search className="w-5 h-5 text-cyan-400 ml-3 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search Site ID (e.g. FC0001, T0108, KD0523)..."
              value={siteQuery}
              onChange={(e) => setSiteQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none px-2 font-mono"
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center space-x-1.5 shrink-0 cursor-pointer"
            >
              <span>Instant Lookup</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-slate-400">
            <span className="font-semibold">Quick Sample Sites:</span>
            {['FC0001', 'T0108', 'FC0095', 'FC2697', 'KD0523', 'AB0001'].map((sId) => (
              <button
                key={sId}
                type="button"
                onClick={() => onSearchSite(sId)}
                className="px-2.5 py-0.5 bg-slate-800/80 hover:bg-cyan-950/60 hover:text-cyan-300 text-slate-300 rounded-lg border border-slate-700/80 transition-all font-mono font-bold cursor-pointer"
              >
                {sId}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* 📊 4 Core High-Impact Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Sites */}
        <div
          onClick={() => onNavigateWithFilter('database', { status: 'All', priority: 'All', search: '' })}
          className="glass-card p-5 rounded-2xl border border-cyan-500/30 bg-slate-900/80 hover:border-cyan-400 hover:scale-[1.02] transition-all cursor-pointer shadow-xl group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {isFse ? 'Assigned Sites' : 'Total Sites'}
            </span>
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:bg-cyan-500/20 transition-all">
              <Radio className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-white font-mono">{totalSites.toLocaleString()}</span>
            <span className="text-[10px] font-bold text-cyan-400 font-mono bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/30">
              Active Network
            </span>
          </div>
        </div>

        {/* Card 2: Sites Down (Outages) */}
        <div
          onClick={() => onNavigateWithFilter('database', { status: 'Down', priority: 'All', search: '' })}
          className="glass-card p-5 rounded-2xl border border-red-500/30 bg-red-950/10 hover:border-red-400 hover:scale-[1.02] transition-all cursor-pointer shadow-xl group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-300">
              Sites Down / Outages
            </span>
            <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 group-hover:bg-red-500/20 transition-all">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-red-400 font-mono">{sitesDown}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
              sitesDown > 0 
                ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse' 
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            }`}>
              {sitesDown > 0 ? 'CRITICAL OUTAGES' : '100% OPERATIONAL'}
            </span>
          </div>
        </div>

        {/* Card 3: Critical P1 Sites */}
        <div
          onClick={() => onNavigateWithFilter('database', { status: 'All', priority: 'P1', search: '' })}
          className="glass-card p-5 rounded-2xl border border-amber-500/30 bg-amber-950/10 hover:border-amber-400 hover:scale-[1.02] transition-all cursor-pointer shadow-xl group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
              Critical Sites (P1)
            </span>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:bg-amber-500/20 transition-all">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-amber-400 font-mono">{criticalSites}</span>
            <span className="text-[10px] font-bold text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-500/30">
              High Priority
            </span>
          </div>
        </div>

        {/* Card 4: Daily Availability */}
        <div
          onClick={() => setActiveTab('daily_availability')}
          className="glass-card p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/10 hover:border-emerald-400 hover:scale-[1.02] transition-all cursor-pointer shadow-xl group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
              Daily Availability
            </span>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-all">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-emerald-400 font-mono">99.8%</span>
            <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/30">
              2G / 3G / 4G / 5G
            </span>
          </div>
        </div>

      </div>

      {/* 👑 Regional SDM Supervision Command Matrix (Visible for MTN RDM & Super Admin) */}
      {(isRdm || (currentUser?.is_superuser && supervisedSdms.length > 0)) && (
        <div className="glass-panel p-6 rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900/95 via-indigo-950/20 to-slate-950 space-y-4 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl text-white shadow-lg shadow-indigo-500/20">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-white">Supervised State Delivery Managers (SDMs)</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {supervisedSdms.length} SDMs In Your Region
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Regional field performance, active site outages, and 1-click drill-down telemetry per SDM.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">
                Regional Sites: <b className="text-indigo-300 font-bold">{totalSites.toLocaleString()} Sites</b>
              </span>
            </div>
          </div>

          {loadingSdms ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
              <div className="text-xs font-bold">Loading regional SDM telemetry...</div>
            </div>
          ) : supervisedSdms.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/50 rounded-2xl border border-slate-800">
              No SDMs currently mapped under this regional command.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {supervisedSdms.map((sdm, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-slate-950/70 hover:bg-slate-900/90 rounded-2xl border border-slate-800/90 hover:border-indigo-500/50 transition-all shadow-md space-y-3 group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-black text-white group-hover:text-indigo-300 transition-colors flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span>{sdm.name}</span>
                      </h4>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {sdm.states && sdm.states.length > 0 ? (
                          sdm.states.map((st, sidx) => (
                            <span key={sidx} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                              {st}
                            </span>
                          ))
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {sdm.primary_state || 'Regional'}
                          </span>
                        )}
                      </div>
                    </div>

                    {sdm.phone && sdm.phone !== 'N/A' && (
                      <a
                        href={`tel:${sdm.phone}`}
                        className="p-2 bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors shrink-0"
                        title={`Call ${sdm.name}: ${sdm.phone}`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  {/* Operational Metrics Bar */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 text-center">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase block">Sites</span>
                      <span className="text-sm font-black font-mono text-cyan-300">{sdm.sites_count.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase block">Down</span>
                      <span className={`text-sm font-black font-mono ${sdm.sites_down > 0 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
                        {sdm.sites_down}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase block">Critical</span>
                      <span className="text-sm font-black font-mono text-amber-400">{sdm.critical_sites}</span>
                    </div>
                  </div>

                  {/* 1-Click Drill-Down Action Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => onNavigateWithFilter('database', { sdm: sdm.name, status: 'All', priority: 'All', search: '' })}
                      className="flex-1 py-1.5 bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 hover:text-white rounded-xl border border-indigo-500/30 text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>View Sites</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('daily_availability');
                      }}
                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 rounded-xl border border-slate-800 text-[11px] font-bold transition-all cursor-pointer"
                      title="View Daily Availability"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 🚀 4 Primary Quick Action Command Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Tile 1: Daily Availability Center */}
        <div
          onClick={() => setActiveTab('daily_availability')}
          className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-cyan-500/40 transition-all cursor-pointer shadow-lg group flex flex-col justify-between"
        >
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-3 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl text-white shadow-md group-hover:scale-110 transition-transform">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">Daily Availability</h3>
              <p className="text-[11px] text-slate-400">Multi-Tech 86-Day Matrix &amp; Worst Sites</p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-cyan-400 font-bold">
            <span>Launch Availability Center</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Tile 2: Live Geo Map & 4G RF Sectors */}
        <div
          onClick={() => setActiveTab('map')}
          className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-cyan-500/40 transition-all cursor-pointer shadow-lg group flex flex-col justify-between"
        >
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-3 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl text-white shadow-md group-hover:scale-110 transition-transform">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">Live Geo Map</h3>
              <p className="text-[11px] text-slate-400">40.9K 4G LTE Sector Wedges &amp; Pins</p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-blue-400 font-bold">
            <span>Explore Map &amp; RF Sectors</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Tile 3: SDM Operational Notes */}
        <div
          onClick={() => setActiveTab('notes')}
          className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-cyan-500/40 transition-all cursor-pointer shadow-lg group flex flex-col justify-between"
        >
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-3 bg-gradient-to-tr from-amber-600 to-orange-600 rounded-xl text-white shadow-md group-hover:scale-110 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">SDM Field Notes</h3>
              <p className="text-[11px] text-slate-400">Log Site Incidents, Photos &amp; GPS</p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-amber-400 font-bold">
            <span>Log &amp; View Notes</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Tile 4: WO Tracker & Fiber Outages */}
        <div
          onClick={() => setActiveTab('wo_tracker')}
          className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-cyan-500/40 transition-all cursor-pointer shadow-lg group flex flex-col justify-between"
        >
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-3 bg-gradient-to-tr from-purple-600 to-pink-600 rounded-xl text-white shadow-md group-hover:scale-110 transition-transform">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">WO &amp; Fiber Tracker</h3>
              <p className="text-[11px] text-slate-400">Work Orders, Fiber Cuts &amp; RCA</p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-purple-400 font-bold">
            <span>Track Open Tickets</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

      </div>

      {/* 📡 Live Operational Streams (2-Column Clean Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Recent SDM Operational Notes */}
        <div className="glass-panel p-5 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Active SDM Field Notes</h3>
                <p className="text-[11px] text-slate-400">Recent operational log entries and site escalations</p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('notes')}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {recentNotes && recentNotes.length > 0 ? (
              recentNotes.slice(0, 4).map((note, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectSite(note.site_ihs_id || note.site_id || (note.title ? note.title.split(' ')[0] : ''))}
                  className="p-3.5 bg-slate-900/80 hover:bg-slate-900 rounded-2xl border border-slate-800 hover:border-cyan-500/40 transition-all cursor-pointer group space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-extrabold text-cyan-300 text-sm group-hover:text-cyan-200">
                        {note.site_ihs_id || note.site_id || (note.title ? note.title.split(' ')[0] : 'General')}
                      </span>
                      <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${
                        note.priority === 'Critical' ? 'bg-red-500/20 text-red-300 border-red-500/40' :
                        note.priority === 'High' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                        'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {note.priority}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {note.category}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-slate-200 line-clamp-1">{note.title}</h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2">{note.description}</p>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                    <span>By: <b className="text-slate-400">{note.created_by}</b></span>
                    <span>{new Date(note.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-500 py-10 text-center">
                No active operational notes logged yet.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Recent WhatsApp Intelligence Feed */}
        <div className="glass-panel p-5 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">WhatsApp Field Intel Feed</h3>
                <p className="text-[11px] text-slate-400">Real-time team chat updates &amp; technician ETAs</p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('whatsapp')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>Live Chat</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {recentWhatsApp && recentWhatsApp.length > 0 ? (
              recentWhatsApp.slice(0, 4).map((msg, idx) => (
                <div
                  key={idx}
                  onClick={() => msg.site_id_str ? onSelectSite(msg.site_id_str) : setActiveTab('whatsapp')}
                  className="p-3.5 bg-slate-900/80 hover:bg-slate-900 rounded-2xl border border-slate-800 hover:border-emerald-500/40 transition-all cursor-pointer group space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-extrabold text-emerald-400 text-sm">
                      {msg.site_id_str || 'General Network'}
                    </span>
                    <span className="text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {msg.sender_name}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 line-clamp-2">{msg.message_text}</p>

                  {msg.extracted_eta && (
                    <div className="flex items-center gap-1 text-[10px] text-amber-400 font-bold bg-amber-950/40 px-2 py-0.5 rounded-lg border border-amber-500/30 w-fit">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>Estimated ETA: {msg.extracted_eta}</span>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-500 py-10 text-center">
                No recent WhatsApp updates imported.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
