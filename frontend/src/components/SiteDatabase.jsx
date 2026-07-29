import React, { useState, useEffect } from 'react';
import { 
  Search, Filter, ChevronLeft, ChevronRight, Eye, RefreshCw, Radio, 
  MapPin, Shield, Zap, User, FileText, CheckCircle, Database, UserCheck, Lock, Phone
} from 'lucide-react';
import { fetchSites, fetchFilterOptions } from '../api';

export default function SiteDatabase({ 
  onSelectSite, 
  currentUser,
  initialSearch = '', 
  initialStatus = 'All', 
  initialPriority = 'All', 
  initialCluster = 'All' 
}) {
  const isSuperuser = currentUser?.is_superuser;
  const userSdmName = currentUser?.full_name || '';

  const [sites, setSites] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);

  // Filter Options loaded dynamically from Backend
  const [options, setOptions] = useState({
    states: [],
    sdm_names: [],
    fse_names: [],
    rdm_names: []
  });

  // Active Filters
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriority] = useState(initialPriority);
  const [stateFilter, setStateFilter] = useState('All');
  const [sdmFilter, setSdmFilter] = useState(isSuperuser ? 'All' : userSdmName);
  const [fseFilter, setFseFilter] = useState('All');
  const [rdmFilter, setRdmFilter] = useState('All');

  // Quick 87-Column Specs Modal
  const [quickSpecSite, setQuickSpecSite] = useState(null);

  useEffect(() => {
    setSearch(initialSearch);
    setStatus(initialStatus);
    setPriority(initialPriority);
    if (!isSuperuser && userSdmName) {
      setSdmFilter(userSdmName);
    }
  }, [initialSearch, initialStatus, initialPriority, userSdmName, isSuperuser]);

  // Load cascading filter options dynamically
  useEffect(() => {
    fetchFilterOptions({
      search,
      status: status !== 'All' ? status : undefined,
      priority: priority !== 'All' ? priority : undefined,
      state: stateFilter !== 'All' ? stateFilter : undefined,
      sdm: sdmFilter !== 'All' ? sdmFilter : undefined,
      fse: fseFilter !== 'All' ? fseFilter : undefined,
      rdm: rdmFilter !== 'All' ? rdmFilter : undefined,
    })
      .then(res => setOptions(res))
      .catch(err => console.error(err));
  }, [search, status, priority, stateFilter, sdmFilter, fseFilter, rdmFilter]);

  // Load site records matching active filters
  const loadSitesData = async () => {
    setLoading(true);
    try {
      const data = await fetchSites({
        search,
        status: status !== 'All' ? status : undefined,
        priority: priority !== 'All' ? priority : undefined,
        state: stateFilter !== 'All' ? stateFilter : undefined,
        sdm: sdmFilter !== 'All' ? sdmFilter : undefined,
        fse: fseFilter !== 'All' ? fseFilter : undefined,
        rdm: rdmFilter !== 'All' ? rdmFilter : undefined,
        page,
        page_size: pageSize
      });
      setSites(data.results || data);
      setTotalCount(data.count || (data.results ? data.results.length : data.length));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSitesData();
  }, [search, status, priority, stateFilter, sdmFilter, fseFilter, rdmFilter, page]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const handleResetFilters = () => {
    setSearch('');
    setStatus('All');
    setPriority('All');
    setStateFilter('All');
    setSdmFilter(isSuperuser ? 'All' : userSdmName);
    setFseFilter('All');
    setRdmFilter('All');
    setPage(1);
  };

  const hasActiveFilters = search || status !== 'All' || priority !== 'All' || stateFilter !== 'All' || (isSuperuser ? sdmFilter !== 'All' : false) || fseFilter !== 'All' || rdmFilter !== 'All';

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20">
              <Radio className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
                Site Inventory & IHS Matrix Database
                <span className="px-2.5 py-0.5 text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-full font-mono">
                  {totalCount.toLocaleString()} Sites
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Unified network site database with integrated IHS Matrix specs, EFS/FSE contacts & direct dialing
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadSitesData}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition-all flex items-center space-x-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Refresh Table</span>
          </button>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="glass-panel p-4 rounded-xl space-y-4 border border-slate-800">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          
          {/* Quick Search */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search site by ID (FC2063 / IHS_ABJ_0001B), Cluster, EFS, FSE Name, Phone, Address..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full bg-slate-900/80 text-xs text-slate-200 placeholder-slate-500 pl-9 pr-4 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 font-medium"
            />
          </div>

          <button
            onClick={handleResetFilters}
            className="px-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all border border-slate-800"
          >
            Reset Filters
          </button>
        </div>

        {/* Filter Dropdowns Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          
          {/* State Filter */}
          <div>
            <label className="block text-slate-400 font-bold mb-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-cyan-400" /> State
            </label>
            <select
              value={stateFilter}
              onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
              className="w-full bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none"
            >
              <option value="All">All States ({options.states.length})</option>
              {options.states.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* SDM Manager Filter */}
          <div>
            <label className="block text-slate-400 font-bold mb-1 flex items-center gap-1">
              <Shield className="w-3 h-3 text-cyan-400" /> SDM Manager
            </label>
            <select
              value={sdmFilter}
              disabled={!isSuperuser}
              onChange={(e) => { setSdmFilter(e.target.value); setPage(1); }}
              className={`w-full text-white text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none ${
                !isSuperuser ? 'bg-slate-950 border-cyan-500/40 text-cyan-300 font-bold cursor-not-allowed' : 'bg-slate-900 border-slate-700'
              }`}
            >
              {!isSuperuser ? (
                <option value={userSdmName}>{userSdmName} (Your SDM Scope)</option>
              ) : (
                <>
                  <option value="All">All SDMs ({options.sdm_names.length})</option>
                  {options.sdm_names.map((sdm) => (
                    <option key={sdm} value={sdm}>{sdm}</option>
                  ))}
                </>
              )}
            </select>
          </div>

          {/* SMC FSE Engineer Filter */}
          <div>
            <label className="block text-slate-400 font-bold mb-1 flex items-center gap-1">
              <User className="w-3 h-3 text-emerald-400" /> FSE Engineer
            </label>
            <select
              value={fseFilter}
              onChange={(e) => { setFseFilter(e.target.value); setPage(1); }}
              className="w-full bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none"
            >
              <option value="All">All FSEs ({options.fse_names.length})</option>
              {options.fse_names.map((fse) => (
                <option key={fse} value={fse}>{fse}</option>
              ))}
            </select>
          </div>

          {/* MTN RDM Filter */}
          <div>
            <label className="block text-slate-400 font-bold mb-1 flex items-center gap-1">
              <User className="w-3 h-3 text-amber-400" /> MTN RDM
            </label>
            <select
              value={rdmFilter}
              onChange={(e) => { setRdmFilter(e.target.value); setPage(1); }}
              className="w-full bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none"
            >
              <option value="All">All RDMs ({options.rdm_names.length})</option>
              {options.rdm_names.map((rdm) => (
                <option key={rdm} value={rdm}>{rdm}</option>
              ))}
            </select>
          </div>

          {/* Operational Status Filter */}
          <div>
            <label className="block text-slate-400 font-bold mb-1 flex items-center gap-1">
              <Zap className="w-3 h-3 text-rose-400" /> Status
            </label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="w-full bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="Operational">Operational</option>
              <option value="Down">Down</option>
            </select>
          </div>

          {/* Site Priority Filter */}
          <div>
            <label className="block text-slate-400 font-bold mb-1 flex items-center gap-1">
              <Shield className="w-3 h-3 text-amber-400" /> Priority
            </label>
            <select
              value={priority}
              onChange={(e) => { setPriority(e.target.value); setPage(1); }}
              className="w-full bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none"
            >
              <option value="All">All Priorities</option>
              <option value="P1">P1 (Critical)</option>
              <option value="P2">P2 (High)</option>
              <option value="P3">P3 (Medium)</option>
              <option value="P4">P4 (Normal)</option>
            </select>
          </div>

        </div>

      </div>

      {/* Main Unified Database Table (IHS Matrix + Site Data) */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-900 text-cyan-300 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3">Site ID / MTN ID</th>
                <th className="p-3">Tower Co & SMC</th>
                <th className="p-3">Cluster Name</th>
                <th className="p-3">Status & Priority</th>
                <th className="p-3">SDM Manager</th>
                <th className="p-3">EFS Contact (IHS Matrix)</th>
                <th className="p-3">SMC FSE Engineer</th>
                <th className="p-3">Power Solution & DG</th>
                <th className="p-3">Location / Address</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-400">
                    <Radio className="w-6 h-6 text-cyan-400 animate-spin mx-auto mb-2" />
                    Fetching site inventory & IHS Matrix records...
                  </td>
                </tr>
              ) : sites.length > 0 ? (
                sites.map((s) => {
                  const raw = s.raw_data || {};
                  const siteId = s.ihs_site_id || s.mtn_id || 'UNKNOWN';
                  const altId = s.mtn_id && s.mtn_id !== siteId ? s.mtn_id : (s.ihs_site_id !== siteId ? s.ihs_site_id : '');

                  return (
                    <tr key={s.id} className="hover:bg-slate-900/60 transition-all">
                      
                      {/* Site ID / MTN ID */}
                      <td className="p-3 font-mono font-extrabold text-cyan-300">
                        <button onClick={() => onSelectSite(siteId)} className="hover:underline text-left">
                          <div>{siteId}</div>
                          {altId && <div className="text-[10px] text-slate-400 font-normal">({altId})</div>}
                        </button>
                      </td>

                      {/* Tower Co & SMC */}
                      <td className="p-3 font-semibold text-slate-200">
                        <div className="flex items-center space-x-1.5">
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] font-bold rounded border border-purple-500/30">
                            {s.tower_co || raw['Tower Co'] || 'IHS'}
                          </span>
                          <span className="text-slate-300 text-[11px] font-bold">({s.smc || raw['SMC'] || 'IHS'})</span>
                        </div>
                      </td>

                      {/* Cluster Name */}
                      <td className="p-3 font-bold text-emerald-300">
                        {s.cluster_name || raw['Cluster Name(SMC)'] || s.hvc_cluster || 'N/A'}
                      </td>

                      {/* Status & Priority */}
                      <td className="p-3">
                        <div className="flex items-center space-x-1.5">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                            s.is_down ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-300'
                          }`}>
                            {s.operational_status || 'Operational'}
                          </span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                            s.priority === 'P1' || s.priority === 'Critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                            s.priority === 'P2' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                            'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {s.priority || 'P2'}
                          </span>
                        </div>
                      </td>

                      {/* SDM Manager */}
                      <td className="p-3 text-slate-200 font-semibold">
                        {s.sdm_name || raw['SDM NAME'] || 'State Delivery Manager'}
                      </td>

                      {/* EFS Contact (IHS Matrix) & Call */}
                      <td className="p-3">
                        {s.efs_name ? (
                          <div>
                            <div className="font-bold text-white leading-none">{s.efs_name}</div>
                            {s.efs_phone && (
                              <a
                                href={`tel:${s.efs_phone}`}
                                className="mt-1 inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] rounded shadow-sm transition-all"
                                title={`Call EFS ${s.efs_name} (${s.efs_phone})`}
                              >
                                <Phone className="w-2.5 h-2.5" />
                                <span>{s.efs_phone}</span>
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">-</span>
                        )}
                      </td>

                      {/* SMC FSE Engineer & Call */}
                      <td className="p-3">
                        {s.smc_fse_name || raw['FSE NAME'] ? (
                          <div>
                            <div className="font-bold text-purple-200 leading-none">{s.smc_fse_name || raw['FSE NAME']}</div>
                            {(s.smc_fse_phone || raw['FSE CONTACT NO.']) && (
                              <a
                                href={`tel:${s.smc_fse_phone || raw['FSE CONTACT NO.']}`}
                                className="mt-1 inline-flex items-center space-x-1 px-2 py-0.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] rounded shadow-sm transition-all"
                                title={`Call FSE ${s.smc_fse_name || raw['FSE NAME']} (${s.smc_fse_phone || raw['FSE CONTACT NO.']})`}
                              >
                                <Phone className="w-2.5 h-2.5" />
                                <span>{s.smc_fse_phone || raw['FSE CONTACT NO.']}</span>
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Power Solution & DG CAP */}
                      <td className="p-3">
                        <div className="font-semibold text-slate-200">{s.power_solution || raw['Power Solution'] || '-'}</div>
                        {(s.dg_capacity || raw['DG CAP']) && (
                          <div className="text-[10px] text-amber-400 font-mono">DG: {s.dg_capacity || raw['DG CAP']}</div>
                        )}
                      </td>

                      {/* Location / Address */}
                      <td className="p-3 text-slate-300 max-w-xs truncate">
                        <div>{s.site_address || s.lga || 'FCT'}</div>
                        <div className="text-[10px] text-slate-400">{s.state || 'FCT'} &bull; {s.region || 'Abuja'}</div>
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right space-x-1.5">
                        <button
                          onClick={() => setQuickSpecSite(s)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-bold rounded-lg border border-slate-700 transition-all inline-flex items-center gap-1"
                          title="View 87 Parameters"
                        >
                          <Database className="w-3 h-3 text-cyan-400" />
                          <span>Specs</span>
                        </button>
                        
                        <button
                          onClick={() => onSelectSite(siteId)}
                          className="px-2 py-1 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 text-[11px] font-bold rounded-lg border border-cyan-500/40 transition-all inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Profile</span>
                        </button>
                      </td>

                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-500">
                    No sites found matching your search parameters for this SDM portfolio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 bg-slate-900/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs gap-3">
          <div className="text-slate-400">
            Showing Page <b className="text-white">{page}</b> of <b className="text-white">{totalPages}</b> &bull; Total Filtered Sites: <b className="text-cyan-300">{totalCount.toLocaleString()}</b>
          </div>

          <div className="flex items-center space-x-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="p-1.5 bg-slate-800 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-700 hover:bg-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 py-1 bg-slate-950 font-mono text-cyan-300 rounded-lg border border-slate-800">
              Page {page}
            </span>

            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="p-1.5 bg-slate-800 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-700 hover:bg-slate-700"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick 87-Specs Modal */}
      {quickSpecSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel max-w-4xl w-full max-h-[85vh] flex flex-col p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <Database className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-base font-extrabold text-white font-mono">
                    {quickSpecSite.ihs_site_id} &bull; All 87 Excel Parameters
                  </h3>
                  <p className="text-xs text-slate-400">{quickSpecSite.site_address || 'Abuja FCT Site'}</p>
                </div>
              </div>
              
              <button
                onClick={() => setQuickSpecSite(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-900 text-cyan-300 font-bold sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="p-2.5 w-10 text-slate-500">#</th>
                    <th className="p-2.5 w-1/3">Excel Column Parameter Name</th>
                    <th className="p-2.5">Parameter Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {Object.entries(quickSpecSite.raw_data || {}).map(([k, v], idx) => (
                    <tr key={k} className="hover:bg-slate-900/50">
                      <td className="p-2.5 text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                      <td className="p-2.5 font-semibold text-slate-300">{k}</td>
                      <td className="p-2.5 font-mono font-bold text-cyan-300 break-all">{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  const sId = quickSpecSite.ihs_site_id;
                  setQuickSpecSite(null);
                  onSelectSite(sId);
                }}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center gap-1.5"
              >
                <Eye className="w-4 h-4" />
                <span>Open Full Site Profile</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
