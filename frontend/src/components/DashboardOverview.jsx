import React, { useState, useEffect } from 'react';
import { 
  Radio, ShieldAlert, AlertTriangle, Zap, Wrench, Signal, BatteryCharging, 
  FileText, MessageSquare, Search, ArrowRight, Activity, TrendingUp, CheckCircle, Clock,
  Network, Layers, ExternalLink, ChevronRight, Filter, MapPin, Cpu
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getSDMStateInfo } from '../utils/userUtils';
import { fetchIHSFiberLinks, fetchHuaweiFiberLinks } from '../api';

export default function DashboardOverview({ stats, onSearchSite, onSelectSite, onNavigateToAvailability, recentNotes, recentWhatsApp, setActiveTab, onNavigateWithFilter, currentUser }) {
  const [siteQuery, setSiteQuery] = useState('');
  const stateInfo = getSDMStateInfo(currentUser);

  // Fiber Homepage Widget State
  const [fiberProvider, setFiberProvider] = useState('ihs'); // 'ihs' or 'huawei'
  const [ihsLinks, setIhsLinks] = useState([]);
  const [ihsLoading, setIhsLoading] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState('All');
  const [selectedState, setSelectedState] = useState('All');
  const [fiberSearch, setFiberSearch] = useState('');

  const loadFiberData = async () => {
    setIhsLoading(true);
    try {
      if (fiberProvider === 'ihs') {
        const res = await fetchIHSFiberLinks({
          page: 1,
          page_size: 8,
          cluster: selectedCluster !== 'All' ? selectedCluster : undefined,
          search: fiberSearch.trim() || undefined
        });
        setIhsLinks(Array.isArray(res) ? res : res.results || []);
      } else {
        const res = await fetchHuaweiFiberLinks({
          page: 1,
          page_size: 8,
          state: selectedState !== 'All' ? selectedState : undefined,
          search: fiberSearch.trim() || undefined
        });
        setIhsLinks(Array.isArray(res) ? res : res.results || []);
      }
    } catch (err) {
      console.error('Failed to load homepage Fiber links:', err);
    } finally {
      setIhsLoading(false);
    }
  };

  useEffect(() => {
    loadFiberData();
  }, [fiberProvider, selectedCluster, selectedState, fiberSearch]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (siteQuery.trim()) {
      onSearchSite(siteQuery.trim().toUpperCase());
    }
  };

  const isFse = currentUser?.role === 'SMC FSE Engineer' || currentUser?.role === 'FSE Engineer';

  const cardsData = [
    { 
      title: isFse ? 'My Assigned Sites' : 'Total Sites', 
      value: stats?.total_sites ?? (isFse ? (currentUser?.assigned_sites_count || 63) : (currentUser?.is_superuser ? 20174 : 1050)), 
      icon: Radio, 
      color: 'from-blue-500/20 to-cyan-500/20', 
      textColor: 'text-cyan-400', 
      border: 'border-cyan-500/30',
      action: () => onNavigateWithFilter('database', { status: 'All', priority: 'All', search: '' })
    },
    { 
      title: 'Sites Down', 
      value: stats?.sites_down ?? 0, 
      icon: ShieldAlert, 
      color: 'from-red-500/20 to-rose-500/20', 
      textColor: 'text-red-400', 
      border: 'border-red-500/30', 
      badge: (stats?.sites_down || 0) > 0 ? 'CRITICAL' : 'STABLE',
      action: () => onNavigateWithFilter('database', { status: 'Down', priority: 'All', search: '' })
    },
    { 
      title: 'Critical Sites', 
      value: stats?.critical_sites ?? 0, 
      icon: AlertTriangle, 
      color: 'from-amber-500/20 to-orange-500/20', 
      textColor: 'text-amber-400', 
      border: 'border-amber-500/30',
      action: () => onNavigateWithFilter('database', { status: 'All', priority: 'P1', search: '' })
    },
    { 
      title: 'IHS Fiber Ring Links', 
      value: stats?.ihs_fiber_links_count ?? 340, 
      icon: Network, 
      color: 'from-emerald-500/20 to-teal-500/20', 
      textColor: 'text-emerald-400', 
      border: 'border-emerald-500/30',
      badge: `${stats?.ihs_fiber_total_km ?? 506.6} km`,
      action: () => setActiveTab('tnl_links')
    },
    { 
      title: 'Huawei Fiber Links', 
      value: stats?.huawei_fiber_links_count ?? 1416, 
      icon: Cpu, 
      color: 'from-purple-500/20 to-indigo-500/20', 
      textColor: 'text-purple-400', 
      border: 'border-purple-500/30',
      badge: `${stats?.huawei_fiber_total_km ?? 10903.87} km`,
      action: () => setActiveTab('tnl_links')
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

  const clusterChips = ['All', 'C168', 'C71', 'C83', 'C95', 'C80', 'C92', 'C60', 'C84', 'C91', 'C93'];
  const stateChips = ['All', 'LAGOS', 'FCT', 'EDO', 'AKWA IBOM', 'KADUNA', 'DELTA', 'RIVERS', 'CROSS RIVER', 'KATSINA', 'OYO'];

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
                  <span className={`text-[10px] px-1.5 py-0.5 font-bold border rounded ${
                    card.title.includes('Huawei')
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                      : card.title.includes('Fiber') 
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                      : 'bg-red-500/20 text-red-400 border-red-500/30'
                  }`}>
                    {card.badge}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ⚡ IHS & HUAWEI FIBER INFRASTRUCTURE HOMEPAGE PANEL */}
      <div className="glass-panel p-6 rounded-2xl border border-cyan-500/30 bg-slate-900/80 relative overflow-hidden shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-gradient-to-br from-cyan-500/20 via-purple-500/20 to-teal-500/20 rounded-xl text-cyan-400 border border-cyan-500/30">
                <Network className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  {/* Fiber Provider Selector Pills */}
                  <button
                    onClick={() => setFiberProvider('ihs')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                      fiberProvider === 'ihs'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                        : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-white'
                    }`}
                  >
                    🔌 IHS FCT Fiber Ring (340 Links)
                  </button>

                  <button
                    onClick={() => setFiberProvider('huawei')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                      fiberProvider === 'huawei'
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-sm'
                        : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-white'
                    }`}
                  >
                    📡 Huawei Fiber (1,416 Links)
                  </button>
                </div>
                
                <p className="text-xs text-slate-400 mt-1">
                  {fiberProvider === 'ihs' 
                    ? 'Active FCT Optical Fiber backbone ring connecting IHS FCT telecommunication hub sites'
                    : 'Nationwide Huawei Maintenance Fiber infrastructure across Nigeria (10,903.87 km total length)'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5">
              <Search className="w-4 h-4 text-cyan-400" />
              <input
                type="text"
                placeholder="Search Segment or Site ID..."
                value={fiberSearch}
                onChange={(e) => setFiberSearch(e.target.value)}
                className="bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none w-36"
              />
            </div>
            <button
              onClick={() => setActiveTab('tnl_links')}
              className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white font-semibold text-xs rounded-xl shadow-md flex items-center space-x-1.5 transition-all"
            >
              <span>Explore All 2,682 Links</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Filter Chips */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-3 mb-4 scrollbar-thin">
          <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-cyan-400" /> {fiberProvider === 'ihs' ? 'Cluster:' : 'State:'}
          </span>
          {(fiberProvider === 'ihs' ? clusterChips : stateChips).map((c) => (
            <button
              key={c}
              onClick={() => fiberProvider === 'ihs' ? setSelectedCluster(c) : setSelectedState(c)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all whitespace-nowrap border ${
                (fiberProvider === 'ihs' ? selectedCluster : selectedState) === c
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {c === 'All' ? (fiberProvider === 'ihs' ? 'All FCT Clusters' : 'All States') : c}
            </button>
          ))}
        </div>

        {/* Live Fiber Links Data Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/60">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">{fiberProvider === 'ihs' ? 'Cluster' : 'State / Region'}</th>
                <th className="py-3 px-4">Segment Name / ID</th>
                <th className="py-3 px-4">Endpoint Site A</th>
                <th className="py-3 px-4">Endpoint Site B</th>
                <th className="py-3 px-4">Distance</th>
                <th className="py-3 px-4">{fiberProvider === 'ihs' ? 'Fiber Length' : 'Maintenance FMP'}</th>
                <th className="py-3 px-4 text-right">Quick Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {ihsLoading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-400 animate-pulse">
                    Loading {fiberProvider === 'ihs' ? 'IHS FCT Fiber Ring' : 'Huawei Fiber'} dataset...
                  </td>
                </tr>
              ) : ihsLinks && ihsLinks.length > 0 ? (
                ihsLinks.map((link) => (
                  <tr key={link.id} className="hover:bg-cyan-950/20 transition-all group">
                    <td className="py-2.5 px-4">
                      {fiberProvider === 'ihs' ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-cyan-500/10 text-cyan-300 rounded border border-cyan-500/20">
                          {link.cluster_ref || 'FCT'}
                        </span>
                      ) : (
                        <div>
                          <div className="font-extrabold text-purple-300">{link.state}</div>
                          <div className="text-[10px] text-slate-400">{link.region || 'Region N/A'}</div>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-white group-hover:text-cyan-300">
                      {link.segment_id || link.segment_name}
                    </td>
                    <td className="py-2.5 px-4">
                      {link.site_a ? (
                        <button
                          onClick={() => onSelectSite(link.site_a)}
                          className="font-mono text-cyan-400 font-semibold hover:underline flex items-center gap-1"
                        >
                          <MapPin className="w-3 h-3 text-cyan-400" />
                          {link.site_a}
                        </button>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {link.site_b ? (
                        <button
                          onClick={() => onSelectSite(link.site_b)}
                          className="font-mono text-cyan-400 font-semibold hover:underline flex items-center gap-1"
                        >
                          <MapPin className="w-3 h-3 text-cyan-400" />
                          {link.site_b}
                        </button>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-amber-400">
                      {link.distance_km ? `${link.distance_km.toFixed(2)} km` : '0 km'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-300">
                      {fiberProvider === 'ihs' 
                        ? (link.fibre_length_m ? `${link.fibre_length_m.toLocaleString()} m` : '0 m')
                        : <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-[10px] font-bold border border-purple-500/30">Huawei</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => setActiveTab('tnl_links')}
                        className="px-2.5 py-1 text-[10px] bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white rounded-md border border-slate-700 transition-all inline-flex items-center gap-1"
                      >
                        <span>Analyze Outage</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="py-6 text-center text-slate-500">
                    No {fiberProvider === 'ihs' ? 'IHS' : 'Huawei'} Fiber Links found matching filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-cyan-300">{note.site_ihs_id}</span>
                      {onNavigateToAvailability && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateToAvailability(note.site_ihs_id);
                          }}
                          className="px-1.5 py-0.5 text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold rounded border border-emerald-500/40 flex items-center gap-1"
                          title={`Filter Daily Availability for ${note.site_ihs_id}`}
                        >
                          <Activity className="w-2.5 h-2.5 text-emerald-400" />
                          <span>Availability</span>
                        </button>
                      )}
                    </div>
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
