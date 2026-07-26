import React, { useState, useEffect } from 'react';
import { 
  Network, Search, FileSpreadsheet, MapPin, RefreshCw, X, 
  ExternalLink, Layers, CheckCircle2, ChevronLeft, ChevronRight, Zap, Filter,
  AlertTriangle, Phone, ShieldAlert, Radio, UserCheck, ArrowRight, Activity
} from 'lucide-react';
import { fetchTNLLinks, fetchTNLLinkStats, fetchTNLLinkImpact } from '../api';

export default function TNLLinksDirectory({ currentUser, onSelectSite }) {
  const isSuperuser = currentUser?.is_superuser;
  const sdmName = currentUser?.full_name || currentUser?.username || '';

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
  const [selectedNetType, setSelectedNetType] = useState('All');
  const [toastMsg, setToastMsg] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
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
    } catch (err) {
      console.error('Failed to load TNL Links:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, pageSize, selectedState, selectedNetType]);

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

  // Export TNL Links to Excel (.xls)
  const handleExportToExcel = () => {
    if (!links || links.length === 0) {
      showToast('No TNL transmission links available to export.');
      return;
    }

    const exportFileName = `FCT_TNL_Transmission_Links_Report_${new Date().toISOString().split('T')[0]}.xls`;

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>TNL Transmission Links</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 15px; background-color: #ffffff; }
          .excel-table { border-collapse: collapse; width: 100%; font-size: 10pt; font-family: 'Segoe UI', Arial, sans-serif; }
          .excel-table th { background-color: #0284c7; color: #ffffff; font-weight: bold; text-align: left; padding: 10px 12px; border: 1px solid #0369a1; font-size: 10pt; }
          .excel-table td { padding: 9px 12px; border: 1px solid #cbd5e1; vertical-align: top; }
          .row-even { background-color: #f8fafc; }
          .row-odd { background-color: #ffffff; }
          .site-id { font-family: 'Courier New', Courier, monospace; font-weight: bold; color: #0284c7; font-size: 10.5pt; }
          .dist-badge { font-weight: bold; color: #0284c7; background-color: #e0f2fe; padding: 2px 6px; border-radius: 4px; }
          .net-badge { font-weight: bold; color: #065f46; background-color: #d1fae5; padding: 2px 6px; border-radius: 4px; }
          .fmp-badge { font-weight: bold; color: #b45309; background-color: #fef3c7; padding: 2px 6px; border-radius: 4px; }
          .summary-row td { background-color: #0f172a; color: #ffffff; font-weight: bold; padding: 10px; border-top: 2px solid #0284c7; }
        </style>
      </head>
      <body>
        <table class="excel-table">
          <thead>
            <tr>
              <th style="width: 45px;">#</th>
              <th>State</th>
              <th>Region</th>
              <th>Segment Name</th>
              <th>Site A</th>
              <th>Site B</th>
              <th>Link Distance (km)</th>
              <th>Network Type</th>
              <th>Maintenance FMP</th>
              <th>Old FMP</th>
            </tr>
          </thead>
          <tbody>
    `;

    links.forEach((l, idx) => {
      const rowClass = idx % 2 === 0 ? 'row-even' : 'row-odd';
      html += `
        <tr class="${rowClass}">
          <td style="text-align: center; font-weight: bold; color: #64748b;">${(page - 1) * pageSize + idx + 1}</td>
          <td><b>${l.state}</b></td>
          <td>${l.region || 'N/A'}</td>
          <td><b>${l.segment_name}</b></td>
          <td class="site-id">${l.site_a || 'N/A'}</td>
          <td class="site-id">${l.site_b || 'N/A'}</td>
          <td style="text-align: center;"><span class="dist-badge">${l.distance_km ? `${l.distance_km} km` : '0 km'}</span></td>
          <td style="text-align: center;"><span class="net-badge">${l.network_type || 'NFE'}</span></td>
          <td style="text-align: center;"><span class="fmp-badge">${l.maintenance_fmp || 'TNL'}</span></td>
          <td>${l.old_fmp || 'N/A'}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
          <tfoot>
            <tr class="summary-row">
              <td colspan="6">TOTAL TNL LINKS REPORTED: ${links.length} LINKS</td>
              <td style="text-align: center;">${links.reduce((acc, curr) => acc + (curr.distance_km || 0), 0).toFixed(2)} km</td>
              <td colspan="3">FCT State Delivery Management Official Directory</td>
            </tr>
          </tfoot>
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

    showToast(`Exported ${links.length} TNL transmission link(s) to Excel!`);
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
            <div className="p-2.5 bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 rounded-2xl text-cyan-300">
              <Network className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
                TNL Transmission Network Links Directory
                <span className="px-2.5 py-0.5 text-xs bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-500/30 font-mono">
                  1,169 Transmission Links
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Click any <b>TNL Segment Name</b> below to inspect the Fiber Failure Impact & Risk Blast Radius.
              </p>
            </div>
          </div>
        </div>

        {/* Top Summary Stats */}
        {stats && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-900/90 px-3.5 py-2 rounded-xl border border-slate-800 text-xs flex items-center space-x-2">
              <span className="text-slate-400 font-medium">Total Links:</span>
              <b className="text-cyan-300 font-mono text-sm">{stats.total_links.toLocaleString()}</b>
            </div>
            <div className="bg-cyan-500/10 px-3.5 py-2 rounded-xl border border-cyan-500/30 text-xs text-cyan-300 font-semibold flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              <span>FCT Links: {stats.fct_links}</span>
            </div>
            <div className="bg-indigo-500/10 px-3.5 py-2 rounded-xl border border-indigo-500/30 text-xs text-indigo-300 font-semibold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>Total Distance: {stats.total_distance_km.toLocaleString()} km</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Table Card */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        
        {/* Controls Bar: Filters, Search, Export */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          
          {/* State Filter Pills */}
          <div className="flex items-center space-x-1.5 text-xs overflow-x-auto no-scrollbar">
            {isSuperuser && (
              <button
                onClick={() => { setSelectedState('All'); setPage(1); }}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap ${
                  selectedState === 'All'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                All States ({stats?.total_links || 1169})
              </button>
            )}

            {(isSuperuser 
              ? ['FCT', 'LAGOS', 'IMO', 'ANAMBRA', 'KANO', 'OYO', 'OGUN', 'BENUE', 'ENUGU']
              : (stats?.sdm_assigned_states && stats.sdm_assigned_states.length > 0 ? stats.sdm_assigned_states : ['FCT'])
            ).map((st) => {
              const stateObj = stats?.states?.find(s => s.state === st);
              const cnt = stateObj ? stateObj.count : 0;
              const isActive = selectedState === st;
              return (
                <button
                  key={st}
                  onClick={() => { setSelectedState(st); setPage(1); }}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  {st} {cnt > 0 ? `(${cnt})` : ''}
                </button>
              );
            })}
          </div>

          {/* Search Input & Export Button */}
          <div className="flex items-center space-x-3">
            <form onSubmit={handleSearchSubmit} className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search segment, Site A, Site B..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-900 text-xs text-white placeholder-slate-500 pl-8 pr-8 py-1.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 font-medium"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setPage(1); loadData(); }}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            <button
              onClick={handleExportToExcel}
              className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow flex items-center gap-1.5 transition-all whitespace-nowrap"
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
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-medium">
                    <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin mx-auto mb-2" />
                    Fetching TNL Transmission Links...
                  </td>
                </tr>
              ) : links.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-medium">
                    No TNL transmission links found matching query parameters.
                  </td>
                </tr>
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
            Showing <b className="text-cyan-300">{links.length > 0 ? (page - 1) * pageSize + 1 : 0}</b> to <b className="text-cyan-300">{Math.min(page * pageSize, totalCount)}</b> of <b className="text-slate-200">{totalCount.toLocaleString()}</b> TNL Transmission Links.
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page === 1 || loading}
              className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-700 disabled:opacity-50 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-xl font-mono text-cyan-300 font-bold">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={page >= totalPages || loading}
              className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-700 disabled:opacity-50 transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 🚨 FIBER OUTAGE IMPACT & RISK BLAST RADIUS MODAL */}
      {selectedLink && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200">
            
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-red-950/60 via-slate-900 to-slate-900 border-b border-slate-800 flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-2xl text-red-400 shrink-0">
                  <ShieldAlert className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 bg-red-500/20 text-red-300 font-extrabold text-[10px] uppercase rounded-full border border-red-500/30">
                      Fiber Outage Risk Analysis
                    </span>
                    <span className="text-xs text-slate-400 font-mono">ID #{selectedLink.id}</span>
                  </div>
                  <h2 className="text-lg font-extrabold text-white mt-1">
                    {selectedLink.segment_name}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    State: <b className="text-cyan-300">{selectedLink.state}</b> &bull; Region: {selectedLink.region || 'N/A'} &bull; Fiber Link Distance: <b className="text-amber-300">{selectedLink.distance_km} km</b>
                  </p>
                </div>
              </div>

              <button
                onClick={() => { setSelectedLink(null); setImpactData(null); }}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              
              {impactLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 text-red-400 animate-spin mx-auto mb-3" />
                  <p className="font-semibold text-xs text-slate-300">Calculating fiber cut blast radius & downstream dependent sites...</p>
                </div>
              ) : impactData ? (
                <>
                  {/* Alert Banner */}
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-start space-x-3 text-xs">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-red-200 text-sm">
                        Fiber Cut Risk: {impactData.total_sites_at_risk} Telecom Site(s) At High Risk
                      </h4>
                      <p className="text-slate-300 mt-1 leading-relaxed">
                        If a physical fiber break occurs on segment <b className="text-white">{impactData.segment_name}</b> ({impactData.distance_km} km), the direct transmission endpoints, downstream backhaul links, and <b>{impactData.proximate_sites_count || 0} nearby corridor site(s) (within 1.5km)</b> will experience backhaul failure or severe interference.
                      </p>
                      
                      <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-red-500/20 text-[11px]">
                        <span className="px-2.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded-full font-bold border border-cyan-500/30">
                          Direct Nodes: {impactData.direct_sites_count || 2}
                        </span>
                        {impactData.cascading_sites_count > 0 && (
                          <span className="px-2.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full font-bold border border-indigo-500/30">
                            Cascading Backhaul: {impactData.cascading_sites_count}
                          </span>
                        )}
                        {impactData.proximate_sites_count > 0 && (
                          <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full font-bold border border-emerald-500/30">
                            📍 Geographically Proximate (&le;1.5km): {impactData.proximate_sites_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Impacted Sites List */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center justify-between">
                      <span>Affected Telecom Sites ({impactData.total_sites_at_risk})</span>
                      <span className="text-[10px] text-cyan-400">GPS Proximity & Backhaul Topology</span>
                    </h3>

                    <div className="space-y-3">
                      {impactData.impacted_sites.map((site, sIdx) => {
                        const isDown = site.is_down || !site.found;
                        const isProximate = site.role.includes('Geographical Proximity');
                        return (
                          <div 
                            key={sIdx}
                            className={`p-4 rounded-2xl border transition-all ${
                              isDown 
                                ? 'bg-red-950/20 border-red-500/30' 
                                : isProximate
                                ? 'bg-slate-900/90 border-emerald-500/30 hover:border-emerald-500/50'
                                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              
                              {/* Site Identifiers & Role */}
                              <div className="flex items-center space-x-3">
                                <div className={`p-2.5 rounded-xl border font-mono font-bold text-xs ${
                                  site.role.includes('Site A')
                                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                                    : site.role.includes('Site B')
                                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                    : isProximate
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                }`}>
                                  {site.ihs_site_id}
                                </div>

                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-white text-sm">
                                      {site.ihs_site_id}
                                    </span>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                      site.role.includes('Site A')
                                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                        : site.role.includes('Site B')
                                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                        : isProximate
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono'
                                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    }`}>
                                      {isProximate ? `📍 ${site.role}` : site.role}
                                    </span>
                                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-bold rounded-full border border-slate-700">
                                      {site.priority}
                                    </span>
                                  </div>

                                  <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                                    <span>MTN ID: <b className="text-slate-200">{site.mtn_id}</b></span>
                                    <span>Cascade: <b className="text-slate-200">{site.cascade}</b></span>
                                    <span>Cluster: <b className="text-slate-200">{site.cluster_name}</b></span>
                                  </div>
                                </div>
                              </div>

                              {/* Action Button */}
                              {site.found && (
                                <button
                                  onClick={() => {
                                    setSelectedLink(null);
                                    if (onSelectSite) onSelectSite(site.ihs_site_id);
                                  }}
                                  className="px-3.5 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shrink-0"
                                >
                                  <span>View Profile</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {/* Personnel Directory & Contact Bar */}
                            <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Assigned Field Engineer (FSE)</span>
                                  <b className="text-white text-xs">{site.fse_name}</b>
                                </div>
                                {site.fse_phone && site.fse_phone !== 'N/A' && (
                                  <a
                                    href={`tel:${site.fse_phone}`}
                                    className="p-1.5 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 rounded-lg border border-emerald-500/30 flex items-center gap-1 text-[11px] font-bold transition-all"
                                  >
                                    <Phone className="w-3 h-3 text-emerald-400" />
                                    <span>{site.fse_phone}</span>
                                  </a>
                                )}
                              </div>

                              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] text-slate-500 uppercase font-bold block">State Delivery Manager (SDM)</span>
                                  <b className="text-amber-400 text-xs">{site.sdm_name}</b>
                                </div>
                                {site.sdm_phone && site.sdm_phone !== 'N/A' && (
                                  <a
                                    href={`tel:${site.sdm_phone}`}
                                    className="p-1.5 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 rounded-lg border border-amber-500/30 flex items-center gap-1 text-[11px] font-bold transition-all"
                                  >
                                    <Phone className="w-3 h-3 text-amber-400" />
                                    <span>{site.sdm_phone}</span>
                                  </a>
                                )}
                              </div>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Official FCT State Delivery Management Transmission Topology</span>
              <button
                onClick={() => { setSelectedLink(null); setImpactData(null); }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all"
              >
                Close Analysis
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
