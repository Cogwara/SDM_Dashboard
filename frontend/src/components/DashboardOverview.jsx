import React, { useState } from 'react';
import { 
  Radio, ShieldAlert, AlertTriangle, Zap, Wrench, Signal, BatteryCharging, 
  FileText, MessageSquare, Search, ArrowRight, Activity, TrendingUp, CheckCircle, Clock
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getSDMStateInfo } from '../utils/userUtils';

export default function DashboardOverview({ stats, onSearchSite, onSelectSite, recentNotes, recentWhatsApp, setActiveTab, onNavigateWithFilter, currentUser }) {
  const [siteQuery, setSiteQuery] = useState('');
  const stateInfo = getSDMStateInfo(currentUser);

  const handleSearch = (e) => {
    e.preventDefault();
    if (siteQuery.trim()) {
      onSearchSite(siteQuery.trim().toUpperCase());
    }
  };

  const cardsData = [
    { 
      title: 'Total Sites', 
      value: stats?.total_sites || 907, 
      icon: Radio, 
      color: 'from-blue-500/20 to-cyan-500/20', 
      textColor: 'text-cyan-400', 
      border: 'border-cyan-500/30',
      action: () => onNavigateWithFilter('database', { status: 'All', priority: 'All', search: '' })
    },
    { 
      title: 'Sites Down', 
      value: stats?.sites_down || 0, 
      icon: ShieldAlert, 
      color: 'from-red-500/20 to-rose-500/20', 
      textColor: 'text-red-400', 
      border: 'border-red-500/30', 
      badge: stats?.sites_down > 0 ? 'CRITICAL' : 'STABLE',
      action: () => onNavigateWithFilter('database', { status: 'Down', priority: 'All', search: '' })
    },
    { 
      title: 'Critical Sites', 
      value: stats?.critical_sites || 0, 
      icon: AlertTriangle, 
      color: 'from-amber-500/20 to-orange-500/20', 
      textColor: 'text-amber-400', 
      border: 'border-amber-500/30',
      action: () => onNavigateWithFilter('database', { status: 'All', priority: 'P1', search: '' })
    },
    { 
      title: 'Commercial Power Outage', 
      value: stats?.commercial_power_outage || 0, 
      icon: Zap, 
      color: 'from-yellow-500/20 to-amber-500/20', 
      textColor: 'text-yellow-400', 
      border: 'border-yellow-500/30',
      action: () => onNavigateWithFilter('database', { status: 'All', priority: 'All', search: 'Power' })
    },
    { 
      title: 'Generator Faults', 
      value: stats?.generator_faults || 0, 
      icon: Wrench, 
      color: 'from-purple-500/20 to-indigo-500/20', 
      textColor: 'text-purple-400', 
      border: 'border-purple-500/30',
      action: () => setActiveTab('notes')
    },
    { 
      title: 'Transmission Faults', 
      value: stats?.transmission_faults || 0, 
      icon: Signal, 
      color: 'from-blue-500/20 to-indigo-500/20', 
      textColor: 'text-blue-400', 
      border: 'border-blue-500/30',
      action: () => setActiveTab('notes')
    },
    { 
      title: 'Battery Faults', 
      value: stats?.battery_faults || 0, 
      icon: BatteryCharging, 
      color: 'from-emerald-500/20 to-teal-500/20', 
      textColor: 'text-emerald-400', 
      border: 'border-emerald-500/30',
      action: () => setActiveTab('notes')
    },
    { 
      title: 'Open Incidents', 
      value: stats?.open_incidents || 0, 
      icon: Activity, 
      color: 'from-rose-500/20 to-pink-500/20', 
      textColor: 'text-rose-400', 
      border: 'border-rose-500/30',
      action: () => setActiveTab('notes')
    },
    { 
      title: 'Recent Notes', 
      value: stats?.recent_notes_count || 0, 
      icon: FileText, 
      color: 'from-sky-500/20 to-blue-500/20', 
      textColor: 'text-sky-400', 
      border: 'border-sky-500/30',
      action: () => setActiveTab('notes')
    },
    { 
      title: 'Recent WhatsApp Updates', 
      value: stats?.recent_whatsapp_count || 0, 
      icon: MessageSquare, 
      color: 'from-green-500/20 to-emerald-500/20', 
      textColor: 'text-green-400', 
      border: 'border-green-500/30',
      action: () => setActiveTab('whatsapp')
    },
  ];

  const pieData = [
    { name: 'Commercial Power', value: stats?.commercial_power_outage || 4, color: '#f59e0b' },
    { name: 'Generator Faults', value: stats?.generator_faults || 3, color: '#a855f7' },
    { name: 'Transmission Faults', value: stats?.transmission_faults || 2, color: '#3b82f6' },
    { name: 'Battery Faults', value: stats?.battery_faults || 1, color: '#10b981' },
  ];

  return (
    <div className="space-y-6">
      
      {/* Hero Header & Quick Search Bar */}
      <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-wide flex items-center gap-2">
              {stateInfo.controlCenterTitle}
              <span className="inline-block w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping"></span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {stateInfo.intelligenceSubtitle}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs px-3 py-1 bg-slate-800 text-slate-300 rounded-lg border border-slate-700">
              Region: <b>{stateInfo.regionText}</b>
            </span>
          </div>
        </div>

        {/* Quick Search Widget */}
        <form onSubmit={handleSearch} className="mt-6">
          <div className="flex items-center bg-slate-900/90 border border-cyan-500/40 rounded-xl p-2 shadow-xl shadow-cyan-950/40 max-w-2xl">
            <Search className="w-5 h-5 text-cyan-400 ml-3 mr-2" />
            <input
              type="text"
              placeholder="Enter Site ID (Example: FC2700)"
              value={siteQuery}
              onChange={(e) => setSiteQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none px-2"
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs rounded-lg transition-all shadow-md flex items-center space-x-1"
            >
              <span>Instant Lookup</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex items-center space-x-2 mt-3 text-xs text-slate-400">
            <span>Quick Test Sites:</span>
            {['FC2700', 'FC2437', 'FC1012', 'FC3005', 'FC1109'].map((sId) => (
              <button
                key={sId}
                type="button"
                onClick={() => onSearchSite(sId)}
                className="px-2 py-0.5 bg-slate-800/80 hover:bg-cyan-900/40 hover:text-cyan-300 text-slate-300 rounded border border-slate-700 transition-all font-mono"
              >
                {sId}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* 10 Stat Cards Grid with Smart Contextual Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {cardsData.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className={`glass-card p-4 rounded-xl border ${card.border} relative overflow-hidden hover:scale-[1.02] transition-all cursor-pointer`}
              onClick={card.action}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">{card.title}</span>
                <div className={`p-2 rounded-lg bg-gradient-to-br ${card.color}`}>
                  <Icon className={`w-4 h-4 ${card.textColor}`} />
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className={`text-2xl font-black ${card.textColor}`}>{card.value}</span>
                {card.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 font-bold border border-red-500/30 rounded">
                    {card.badge}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts & Intel Feed Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Incident Distribution Chart */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              Active Fault Breakdown
            </h3>
            <button onClick={() => setActiveTab('reports')} className="text-xs text-slate-400 hover:text-cyan-300">Reports</button>
          </div>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            {pieData.map((item, i) => (
              <div key={i} className="flex items-center space-x-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                <span className="text-slate-400 truncate">{item.name}:</span>
                <span className="font-bold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent SDM Operational Notes */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-400" />
              Recent SDM Notes
            </h3>
            <button
              onClick={() => setActiveTab('notes')}
              className="text-xs text-cyan-400 hover:underline"
            >
              View All
            </button>
          </div>

          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {recentNotes && recentNotes.length > 0 ? (
              recentNotes.slice(0, 4).map((note, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectSite(note.site_ihs_id)}
                  className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 hover:border-cyan-500/40 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono font-bold text-cyan-300">{note.site_ihs_id}</span>
                    <span className="px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-300 rounded">
                      {note.category}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-slate-200 line-clamp-1">{note.title}</h4>
                  <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{note.description}</p>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-500 py-8 text-center">No notes logged yet. Use SDM Notes to add site history.</div>
            )}
          </div>
        </div>

        {/* Recent WhatsApp Intelligence */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-green-400" />
              WhatsApp Field Intel
            </h3>
            <button
              onClick={() => setActiveTab('whatsapp')}
              className="text-xs text-green-400 hover:underline"
            >
              Live Feed
            </button>
          </div>

          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {recentWhatsApp && recentWhatsApp.length > 0 ? (
              recentWhatsApp.slice(0, 4).map((msg, idx) => (
                <div
                  key={idx}
                  onClick={() => msg.site_id_str ? onSelectSite(msg.site_id_str) : setActiveTab('whatsapp')}
                  className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 hover:border-green-500/40 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono font-bold text-green-400">{msg.site_id_str || 'General'}</span>
                    <span className="text-[10px] text-slate-400">{msg.sender_name}</span>
                  </div>
                  <p className="text-xs text-slate-300 line-clamp-2">{msg.message_text}</p>
                  {msg.extracted_eta && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-400 font-semibold">
                      <Clock className="w-3 h-3" />
                      <span>ETA: {msg.extracted_eta}</span>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-500 py-8 text-center">No WhatsApp messages imported yet. Import chat log in WhatsApp tab.</div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
