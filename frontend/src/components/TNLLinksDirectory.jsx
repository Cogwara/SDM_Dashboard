import React, { useState, useEffect } from 'react';
import { 
  Network, Search, FileSpreadsheet, MapPin, RefreshCw, X, 
  ExternalLink, Layers, CheckCircle2, ChevronLeft, ChevronRight, Zap, Filter,
  AlertTriangle, Phone, ShieldAlert, Radio, UserCheck, ArrowRight, Activity, Cpu
} from 'lucide-react';
import { 
  fetchTNLLinks, fetchTNLLinkStats, fetchTNLLinkImpact, 
  fetchIHSFiberLinks, fetchIHSFiberLinkStats,
  fetchHuaweiFiberLinks, fetchHuaweiFiberLinkStats 
} from '../api';

export default function TNLLinksDirectory({ currentUser, onSelectSite }) {
  const isSuperuser = currentUser?.is_superuser;
  const sdmName = currentUser?.full_name || currentUser?.username || '';

  // Network mode: 'ihs' (IHS FCT Fiber Ring), 'huawei' (Huawei Fiber Links), or 'tnl' (TNL Transmission Network)
  const [activeNetworkTab, setActiveNetworkTab] = useState('ihs');

  const [links, setLinks] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  // Impact Modal State
  const [selectedLink, setSelectedLink] = useState(null);
  const [impactData, setImpactData] = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedState, setSelectedState] = useState('All');
  const [selectedCluster, setSelectedCluster] = useState('All');
  const [selectedNetType, setSelectedNetType] = useState('All');
  const [toastMsg, setToastMsg] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeNetworkTab === 'ihs') {
        const params = {
          page,
          page_size: pageSize,
          search: search.trim() || undefined,
          cluster: selectedCluster !== 'All' ? selectedCluster : undefined,
        };
        const [listData, statsData] = await Promise.all([
          fetchIHSFiberLinks(params),
          fetchIHSFiberLinkStats()
        ]);
        setLinks(Array.isArray(listData) ? listData : listData.results || []);
        setTotalCount(listData.count || (Array.isArray(listData) ? listData.length : 0));
        setStats(statsData);
      } else if (activeNetworkTab === 'huawei') {
        const params = {
          page,
          page_size: pageSize,
          search: search.trim() || undefined,
          state: selectedState !== 'All' ? selectedState : undefined,
        };
        const [listData, statsData] = await Promise.all([
          fetchHuaweiFiberLinks(params),
          fetchHuaweiFiberLinkStats()
        ]);
        setLinks(Array.isArray(listData) ? listData : listData.results || []);
        setTotalCount(listData.count || (Array.isArray(listData) ? listData.length : 0));
        setStats(statsData);
      } else {
        const scopeParams = {
          sdm: !isSuperuser ? sdmName : undefined,
          is_superuser: isSuperuser ? 'true' : 'false'
        };
        const params = {
          page,
          page_size: pageSize,
          search: search.trim() || undefined,
          state: selectedState !== 'All' ? selectedState : undefined,
          network_type: selectedNetType !== 'All' ? selectedNetType : undefined,
          ...scopeParams
        };
        const [listData, statsData] = await Promise.all([
          fetchTNLLinks(params),
          fetchTNLLinkStats(scopeParams)
        ]);
        setLinks(Array.isArray(listData) ? listData : listData.results || []);
        setTotalCount(listData.count || (Array.isArray(listData) ? listData.length : 0));
        setStats(statsData);
      }
    } catch (err) {
      console.error('Failed to load Fiber/TNL Links:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeNetworkTab, page, pageSize, selectedState, selectedCluster, selectedNetType]);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    setPage(1);
    loadData();
  };

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Open Fiber Outage & Impact Analysis Modal
  const handleOpenImpactModal = async (link) => {
    setSelectedLink(link);
    setImpactLoading(true);
    setImpactData(null);
    try {
      const data = await fetchTNLLinkImpact(link.id);
      setImpactData(data);
    } catch (err) {
      console.error('Failed to fetch TNL link impact data:', err);
      showToast('Failed to load fiber impact analysis.');
    } finally {
      setImpactLoading(false);
    }
  };

  // Export Links to Excel (.xls)
  const handleExportToExcel = () => {
    if (!links || links.length === 0) {
      showToast('No links available to export.');
      return;
    }

    const tabName = activeNetworkTab === 'ihs' ? 'IHS_Fiber' : activeNetworkTab === 'huawei' ? 'Huawei_Fiber' : 'TNL_Transmission';
    const exportFileName = `${tabName}_Links_Export_${new Date().toISOString().split('T')[0]}.xls`;

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>${tabName}</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 11pt; }
          th { background-color: #0f172a; color: #ffffff; font-weight: bold; text-align: left; padding: 10px; border: 1px solid #334155; }
          td { padding: 8px; border: 1px solid #e2e8f0; vertical-align: middle; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .highlight { font-weight: bold; color: #0284c7; }
        </style>
      </head>
      <body>
        <h2>${activeNetworkTab === 'ihs' ? 'IHS FCT Optical Fiber Ring Dataset' : activeNetworkTab === 'huawei' ? 'Huawei National Fiber Infrastructure' : 'FCT & Nationwide TNL Transmission Links'}</h2>
        <p>Export Date: ${new Date().toLocaleString()} | Total Exported: ${links.length}</p>
        <table>
          <thead>
            ${activeNetworkTab === 'ihs' ? `
              <tr>
                <th>#</th>
                <th>Cluster Ref</th>
                <th>Segment ID (A-B)</th>
                <th>Site A</th>
                <th>Site B</th>
                <th>Fibre Length (m)</th>
                <th>Distance (km)</th>
                <th>State</th>
              </tr>
            ` : activeNetworkTab === 'huawei' ? `
              <tr>
                <th>#</th>
                <th>State</th>
                <th>Region</th>
                <th>Segment Name</th>
                <th>Site A</th>
                <th>Site B</th>
                <th>Distance (km)</th>
                <th>Network Type</th>
                <th>Maintenance FMP</th>
                <th>Huawei FSDM</th>
              </tr>
            ` : `
              <tr>
                <th>#</th>
                <th>State</th>
                <th>Region</th>
                <th>Segment Name</th>
                <th>Site A</th>
                <th>Site B</th>
                <th>Distance (km)</th>
                <th>Network Type</th>
                <th>Maintenance FMP</th>
                <th>Old FMP</th>
              </tr>
            `}
          </thead>
          <tbody>
            ${links.map((l, idx) => activeNetworkTab === 'ihs' ? `
              <tr>
                <td>${idx + 1}</td>
                <td>${l.cluster_ref || 'FCT'}</td>
                <td class="highlight">${l.segment_id}</td>
                <td>${l.site_a || ''}</td>
                <td>${l.site_b || ''}</td>
                <td>${l.fibre_length_m || 0}</td>
                <td>${l.distance_km || 0}</td>
                <td>${l.state || 'FCT'}</td>
              </tr>
            ` : `
              <tr>
                <td>${idx + 1}</td>
                <td>${l.state || ''}</td>
                <td>${l.region || ''}</td>
                <td class="highlight">${l.segment_name || ''}</td>
                <td>${l.site_a || ''}</td>
                <td>${l.site_b || ''}</td>
                <td>${l.distance_km || 0}</td>
                <td>${l.network_type || ''}</td>
                <td>${l.maintenance_fmp || ''}</td>
                <td>${activeNetworkTab === 'huawei' ? (l.huawei_fsdm || '') : (l.old_fmp || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', exportFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Exported ${links.length} link(s) to Excel!`);
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white font-bold text-xs px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-emerald-400 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-cyan-500/20 via-purple-500/20 to-teal-500/20 border border-cyan-500/30 rounded-2xl text-cyan-300">
              <Network className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
                {activeNetworkTab === 'ihs' ? 'IHS FCT Optical Fiber Ring Directory' : activeNetworkTab === 'huawei' ? 'Huawei National Fiber Directory' : 'TNL Transmission Network Directory'}
                <span className="px-2.5 py-0.5 text-xs bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-500/30 font-mono">
                  {activeNetworkTab === 'ihs' ? '340 Fiber Links' : activeNetworkTab === 'huawei' ? '1,416 Fiber Links' : '926 Transmission Links'}
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeNetworkTab === 'ihs' 
                  ? 'Master index of IHS FCT fiber rings, cluster segments, and distance specifications.'
                  : activeNetworkTab === 'huawei'
                  ? 'Comprehensive Huawei Maintenance Fiber link catalog (2025 NOC Copy distribution).'
                  : 'Click any TNL Segment Name below to inspect the Fiber Failure Impact & Risk Blast Radius.'}
              </p>
            </div>
          </div>
        </div>

        {/* Top Summary Stats */}
        {stats && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-900/90 px-3.5 py-2 rounded-xl border border-slate-800 text-xs flex items-center space-x-2">
              <span className="text-slate-400 font-medium">Total Cataloged:</span>
              <b className="text-cyan-300 font-mono text-sm">{(stats.total_links || totalCount).toLocaleString()}</b>
            </div>
            <div className="bg-cyan-500/10 px-3.5 py-2 rounded-xl border border-cyan-500/30 text-xs text-cyan-300 font-semibold flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              <span>{activeNetworkTab === 'ihs' ? 'Clusters: ' + (stats.clusters?.length || 48) : 'States: ' + (stats.states?.length || 10)}</span>
            </div>
            <div className="bg-emerald-500/10 px-3.5 py-2 rounded-xl border border-emerald-500/30 text-xs text-emerald-300 font-semibold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>Total Distance: {stats.total_distance_km ? stats.total_distance_km.toLocaleString() : '10,903'} km</span>
            </div>
          </div>
        )}
      </div>

      {/* Network Directory 3-Way Sub-Tab Switcher */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 w-fit">
        <button
          onClick={() => { setActiveNetworkTab('ihs'); setPage(1); setSearch(''); }}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all ${
            activeNetworkTab === 'ihs'
              ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-lg border border-cyan-400/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Network className="w-4 h-4" />
          <span>🔌 IHS FCT Fiber Ring (340)</span>
        </button>

        <button
          onClick={() => { setActiveNetworkTab('huawei'); setPage(1); setSearch(''); }}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all ${
            activeNetworkTab === 'huawei'
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg border border-purple-400/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>📡 Huawei Fiber (1,416)</span>
        </button>

        <button
          onClick={() => { setActiveNetworkTab('tnl'); setPage(1); setSearch(''); }}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all ${
            activeNetworkTab === 'tnl'
              ? 'bg-gradient-to-r from-blue-600 to-sky-600 text-white shadow-lg border border-blue-400/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>🌐 TNL Transmission (926)</span>
        </button>
      </div>

      {/* Main Table Card */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        
        {/* Controls Bar: Filters, Search, Export */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {activeNetworkTab === 'ihs' ? (
              <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
                <Filter className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-slate-400 font-semibold">Cluster:</span>
                <select
                  value={selectedCluster}
                  onChange={(e) => { setSelectedCluster(e.target.value); setPage(1); }}
                  className="bg-transparent text-cyan-300 font-bold focus:outline-none cursor-pointer"
                >
                  <option value="All" className="bg-slate-900 text-white">All FCT Clusters</option>
                  {stats?.clusters && stats.clusters.map((c) => (
                    <option key={c.cluster_ref} value={c.cluster_ref} className="bg-slate-900 text-white">
                      {c.cluster_ref} ({c.count} links)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
                <Filter className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-slate-400 font-semibold">State:</span>
                <select
                  value={selectedState}
                  onChange={(e) => { setSelectedState(e.target.value); setPage(1); }}
                  className="bg-transparent text-cyan-300 font-bold focus:outline-none cursor-pointer"
                >
                  <option value="All" className="bg-slate-900 text-white">All States</option>
                  {stats?.states && stats.states.map((st) => (
                    <option key={st.state} value={st.state} className="bg-slate-900 text-white">
                      {st.state} ({st.count})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => { setSelectedState('All'); setSelectedCluster('All'); setSelectedNetType('All'); setSearch(''); setPage(1); }}
              className="px-2.5 py-1 text-slate-400 hover:text-cyan-300 text-[11px] underline"
            >
              Reset Filters
            </button>
          </div>

          {/* Search & Export Excel Buttons */}
          <div className="flex items-center space-x-3">
            <form onSubmit={handleSearchSubmit} className="flex items-center bg-slate-900/90 border border-slate-700 rounded-xl px-3 py-1.5 text-xs flex-1 sm:flex-initial">
              <Search className="w-4 h-4 text-slate-400 mr-2" />
              <input
                type="text"
                placeholder={activeNetworkTab === 'ihs' ? "Search Segment ID or Site..." : "Search Segment or Site ID..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-white placeholder-slate-400 focus:outline-none w-48"
              />
              {search && (
                <button type="button" onClick={() => { setSearch(''); setPage(1); }} className="text-slate-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            <button
              onClick={handleExportToExcel}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center space-x-1.5 transition-all shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-900/90 text-slate-300 font-bold border-b border-slate-800 uppercase tracking-wider text-[11px]">
              {activeNetworkTab === 'ihs' ? (
                <tr>
                  <th className="p-3 w-10 text-center text-slate-500">#</th>
                  <th className="p-3">Cluster</th>
                  <th className="p-3">Segment ID (A-B)</th>
                  <th className="p-3">Endpoint Site A</th>
                  <th className="p-3">Endpoint Site B</th>
                  <th className="p-3 text-center">Fibre Length</th>
                  <th className="p-3 text-center">Distance</th>
                  <th className="p-3 text-center">State</th>
                </tr>
              ) : activeNetworkTab === 'huawei' ? (
                <tr>
                  <th className="p-3 w-10 text-center text-slate-500">#</th>
                  <th className="p-3">State / Region</th>
                  <th className="p-3">Huawei Segment Name</th>
                  <th className="p-3">Site A</th>
                  <th className="p-3">Site B</th>
                  <th className="p-3 text-center">Distance (km)</th>
                  <th className="p-3 text-center">FMP Provider</th>
                  <th className="p-3">Huawei FSDM Contact</th>
                </tr>
              ) : (
                <tr>
                  <th className="p-3 w-10 text-center text-slate-500">#</th>
                  <th className="p-3">State / Region</th>
                  <th className="p-3">TNL Segment Name (Click for Failure Impact)</th>
                  <th className="p-3">Site A</th>
                  <th className="p-3">Site B</th>
                  <th className="p-3 text-center">Distance (km)</th>
                  <th className="p-3 text-center">Network Type</th>
                  <th className="p-3 text-center">Maintenance FMP</th>
                  <th className="p-3 text-center">Old FMP</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-medium">
                    <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin mx-auto mb-2" />
                    Fetching transmission records...
                  </td>
                </tr>
              ) : links.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-medium">
                    No transmission links found matching query parameters.
                  </td>
                </tr>
              ) : activeNetworkTab === 'ihs' ? (
                links.map((l, idx) => (
                  <tr key={l.id} className="hover:bg-slate-800/50 transition-all">
                    <td className="p-3 text-center font-mono text-slate-500">
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td className="p-3">
                      <span className="px-2.5 py-1 bg-cyan-500/10 text-cyan-300 rounded font-bold text-[11px] border border-cyan-500/20">
                        {l.cluster_ref || 'FCT'}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-white">
                      {l.segment_id}
                    </td>
                    <td className="p-3">
                      {l.site_a ? (
                        <button
                          onClick={() => onSelectSite && onSelectSite(l.site_a)}
                          className="font-mono text-xs font-bold text-cyan-300 hover:underline flex items-center gap-1"
                        >
                          <span>{l.site_a}</span>
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                        </button>
                      ) : (
                        <span className="text-slate-500 font-mono">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      {l.site_b ? (
                        <button
                          onClick={() => onSelectSite && onSelectSite(l.site_b)}
                          className="font-mono text-xs font-bold text-cyan-300 hover:underline flex items-center gap-1"
                        >
                          <span>{l.site_b}</span>
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                        </button>
                      ) : (
                        <span className="text-slate-500 font-mono">-</span>
                      )}
                    </td>
                    <td className="p-3 text-center font-mono text-slate-300">
                      {l.fibre_length_m ? `${l.fibre_length_m.toLocaleString()} m` : '0 m'}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 rounded-full font-mono font-bold text-[11px] border border-amber-500/30">
                        {l.distance_km ? `${l.distance_km.toFixed(3)} km` : '0 km'}
                      </span>
                    </td>
                    <td className="p-3 text-center text-slate-400 font-medium">
                      {l.state || 'FCT'}
                    </td>
                  </tr>
                ))
              ) : activeNetworkTab === 'huawei' ? (
                links.map((l, idx) => (
                  <tr key={l.id} className="hover:bg-slate-800/50 transition-all">
                    <td className="p-3 text-center font-mono text-slate-500">
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td className="p-3">
                      <div className="font-extrabold text-purple-300">{l.state}</div>
                      <div className="text-[10px] text-slate-400">{l.region || 'Region N/A'}</div>
                    </td>
                    <td className="p-3 font-bold text-white font-mono">
                      {l.segment_name}
                    </td>
                    <td className="p-3">
                      {l.site_a ? (
                        <button
                          onClick={() => onSelectSite && onSelectSite(l.site_a)}
                          className="font-mono text-xs font-bold text-purple-300 hover:underline flex items-center gap-1"
                        >
                          <span>{l.site_a}</span>
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                        </button>
                      ) : (
                        <span className="text-slate-500 font-mono">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      {l.site_b ? (
                        <button
                          onClick={() => onSelectSite && onSelectSite(l.site_b)}
                          className="font-mono text-xs font-bold text-purple-300 hover:underline flex items-center gap-1"
                        >
                          <span>{l.site_b}</span>
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                        </button>
                      ) : (
                        <span className="text-slate-500 font-mono">-</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 rounded-full font-mono font-bold text-[11px] border border-amber-500/30">
                        {l.distance_km ? `${l.distance_km.toFixed(2)} km` : '0 km'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-0.5 bg-purple-500/20 text-purple-300 rounded-full font-bold text-[11px] border border-purple-500/30">
                        {l.maintenance_fmp || 'Huawei'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300 font-medium text-[11px]">
                      <div>{l.huawei_fsdm || 'Huawei FSDM'}</div>
                      {l.huawei_fsdm_number && <div className="text-[10px] text-slate-500 font-mono">{l.huawei_fsdm_number}</div>}
                    </td>
                  </tr>
                ))
              ) : (
                links.map((l, idx) => (
                  <tr key={l.id} className="hover:bg-slate-800/50 transition-all">
                    <td className="p-3 text-center font-mono text-slate-500">
                      {(page - 1) * pageSize + idx + 1}
                    </td>

                    {/* State / Region */}
                    <td className="p-3">
                      <div className="font-extrabold text-cyan-300">{l.state}</div>
                      <div className="text-[10px] text-slate-400">{l.region || 'Region N/A'}</div>
                    </td>

                    {/* CLICKABLE Segment Name -> Opens Fiber Outage Blast Radius Impact Modal */}
                    <td className="p-3">
                      <button
                        onClick={() => handleOpenImpactModal(l)}
                        className="font-bold text-cyan-400 hover:text-cyan-200 text-xs flex items-center gap-1.5 group text-left transition-all"
                        title="Click to calculate sites that will go down if fiber fails"
                      >
                        <Network className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform shrink-0" />
                        <span className="underline decoration-cyan-500/40 underline-offset-4 group-hover:decoration-cyan-300">
                          {l.segment_name}
                        </span>
                        <AlertTriangle className="w-3 h-3 text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                      </button>
                    </td>

                    {/* Site A */}
                    <td className="p-3">
                      {l.site_a ? (
                        <button
                          onClick={() => onSelectSite && onSelectSite(l.site_a)}
                          className="font-mono text-xs font-bold text-cyan-300 hover:underline flex items-center gap-1"
                        >
                          <span>{l.site_a}</span>
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                        </button>
                      ) : (
                        <span className="text-slate-500 font-mono">N/A</span>
                      )}
                    </td>

                    {/* Site B */}
                    <td className="p-3">
                      {l.site_b ? (
                        <button
                          onClick={() => onSelectSite && onSelectSite(l.site_b)}
                          className="font-mono text-xs font-bold text-cyan-300 hover:underline flex items-center gap-1"
                        >
                          <span>{l.site_b}</span>
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                        </button>
                      ) : (
                        <span className="text-slate-500 font-mono">N/A</span>
                      )}
                    </td>

                    {/* Link Distance */}
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded-full font-mono font-bold text-[11px] border border-cyan-500/30">
                        {l.distance_km ? `${l.distance_km} km` : '0 km'}
                      </span>
                    </td>

                    {/* Network Type */}
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full font-bold text-[11px] border border-emerald-500/30">
                        {l.network_type || 'NFE'}
                      </span>
                    </td>

                    {/* Maintenance FMP */}
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 rounded-full font-bold text-[11px] border border-amber-500/30">
                        {l.maintenance_fmp || 'TNL'}
                      </span>
                    </td>

                    {/* Old FMP */}
                    <td className="p-3 text-center text-slate-400 font-medium text-[11px]">
                      {l.old_fmp || 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 gap-3 pt-2">
          <div>
            Showing <b className="text-cyan-300">{links.length > 0 ? (page - 1) * pageSize + 1 : 0}</b> to <b className="text-cyan-300">{Math.min(page * pageSize, totalCount)}</b> of <b className="text-slate-200">{totalCount.toLocaleString()}</b> links.
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 disabled:opacity-40 text-slate-300 hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="font-semibold text-slate-300">
              Page {page} of {totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 disabled:opacity-40 text-slate-300 hover:text-white"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

      {/* 🚨 FIBER OUTAGE IMPACT & RISK BLAST RADIUS MODAL */}
      {selectedLink && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            
            {/* Modal Close Button */}
            <button 
              onClick={() => setSelectedLink(null)} 
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 border border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
              <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-400 rounded-2xl">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  Fiber Outage Risk Analysis
                  <span className="text-xs bg-red-500/20 text-red-400 font-mono px-2 py-0.5 rounded border border-red-500/30">
                    BLAST RADIUS
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  State: <b className="text-cyan-300">{selectedLink.state}</b> &bull; Region: {selectedLink.region || 'N/A'} &bull; Fiber Link Distance: <b className="text-amber-300">{selectedLink.distance_km} km</b>
                </p>
              </div>
            </div>

            {/* Modal Body */}
            {impactLoading ? (
              <div className="py-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
                <p className="font-semibold text-xs text-slate-300">Calculating fiber cut blast radius & downstream dependent sites...</p>
              </div>
            ) : impactData ? (
              <div className="space-y-4">
                
                {/* Executive Impact Alert Banner */}
                <div className="p-4 bg-gradient-to-r from-red-950/80 to-rose-950/80 border border-red-500/40 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-red-300 text-sm font-extrabold">
                    <AlertTriangle className="w-5 h-5 text-red-400 animate-bounce" />
                    <span>
                      Fiber Cut Risk: {impactData.total_sites_at_risk} Telecom Site(s) At High Risk
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    If a physical fiber break occurs on segment <b className="text-white">{impactData.segment_name}</b> ({impactData.distance_km} km), the direct transmission endpoints, downstream backhaul links, and <b>{impactData.proximate_sites_count || 0} nearby corridor site(s) (within 1.5km)</b> will experience backhaul failure or severe interference.
                  </p>
                </div>

                {/* Impact Summary Statistics Grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Direct Endpoints</div>
                    <div className="text-xl font-black text-cyan-400 font-mono mt-1">{impactData.direct_sites_count} Sites</div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Cascading Microwave</div>
                    <div className="text-xl font-black text-amber-400 font-mono mt-1">{impactData.cascading_sites_count} Sites</div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Corridor Proximity</div>
                    <div className="text-xl font-black text-rose-400 font-mono mt-1">{impactData.proximate_sites_count} Sites</div>
                  </div>
                </div>

                {/* List of Affected Sites */}
                <div>
                  <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center justify-between">
                    <span>Impacted Site Directory ({impactData.impacted_sites.length})</span>
                    <span className="text-[10px] text-slate-400 font-normal">Click site ID to view profile</span>
                  </h4>
                  
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1 border border-slate-800 rounded-xl p-2 bg-slate-950/60">
                    {impactData.impacted_sites.map((st, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-900 rounded-lg border border-slate-800/80 flex items-center justify-between text-xs hover:border-cyan-500/40 transition-all">
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => { setSelectedLink(null); onSelectSite && onSelectSite(st.ihs_site_id); }}
                            className="font-mono font-black text-cyan-300 hover:underline flex items-center gap-1"
                          >
                            <span>{st.ihs_site_id}</span>
                            <ExternalLink className="w-3 h-3 text-slate-500" />
                          </button>
                          
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            st.role === 'DIRECT_ENDPOINT' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' :
                            st.role === 'CASCADING_HOPS' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                            'bg-slate-800 text-slate-300'
                          }`}>
                            {st.role.replace('_', ' ')}
                          </span>
                        </div>

                        <div className="flex items-center space-x-4 text-[11px] text-slate-400">
                          {st.smc && <span>SMC: <b className="text-slate-200">{st.smc}</b></span>}
                          {st.priority && <span className="font-bold text-red-400">{st.priority}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="py-8 text-center text-slate-500">Failed to analyze blast radius impact for this segment.</div>
            )}

            {/* Modal Footer */}
            <div className="pt-2 flex justify-end border-t border-slate-800">
              <button
                onClick={() => setSelectedLink(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all"
              >
                Close Risk Modal
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
