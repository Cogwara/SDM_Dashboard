import React, { useState, useEffect } from 'react';
import { 
  Search, Phone, PhoneCall, Radio, FileSpreadsheet, MapPin, Zap, UserCheck, 
  ChevronRight, Building2, Filter, Copy, Check, ExternalLink, Shield, RefreshCw, Eye
} from 'lucide-react';
import { fetchSites } from '../api';

export default function IHSMatrixDirectory({ onSelectSite, currentUser }) {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [smcFilter, setSmcFilter] = useState('All');
  const [clusterFilter, setClusterFilter] = useState('All');
  const [copiedPhone, setCopiedPhone] = useState(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const loadMatrixSites = async () => {
    setLoading(true);
    try {
      const data = await fetchSites({
        page_size: 2500,
        state: 'FCT'
      });
      const results = data.results || data || [];
      setSites(results);
    } catch (err) {
      console.error('Error fetching matrix sites:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatrixSites();
  }, []);

  const handleCopyPhone = (phone, label) => {
    if (!phone) return;
    navigator.clipboard.writeText(phone);
    setCopiedPhone(`${label}:${phone}`);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  // Filter sites matching search query & SMC/Cluster
  const filteredSites = sites.filter((site) => {
    if (smcFilter !== 'All' && site.smc !== smcFilter) return false;
    if (clusterFilter !== 'All' && site.cluster_name !== clusterFilter) return false;

    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();

    return (
      (site.ihs_site_id && site.ihs_site_id.toLowerCase().includes(q)) ||
      (site.mtn_id && site.mtn_id.toLowerCase().includes(q)) ||
      (site.cluster_name && site.cluster_name.toLowerCase().includes(q)) ||
      (site.smc && site.smc.toLowerCase().includes(q)) ||
      (site.sub_sbc && site.sub_sbc.toLowerCase().includes(q)) ||
      (site.efs_name && site.efs_name.toLowerCase().includes(q)) ||
      (site.efs_phone && site.efs_phone.includes(q)) ||
      (site.rto_name && site.rto_name.toLowerCase().includes(q)) ||
      (site.rto_phone && site.rto_phone.includes(q)) ||
      (site.smc_fse_name && site.smc_fse_name.toLowerCase().includes(q)) ||
      (site.smc_fse_phone && site.smc_fse_phone.includes(q)) ||
      (site.smc_rto_name && site.smc_rto_name.toLowerCase().includes(q)) ||
      (site.smc_hoo_name && site.smc_hoo_name.toLowerCase().includes(q)) ||
      (site.site_address && site.site_address.toLowerCase().includes(q)) ||
      (site.power_solution && site.power_solution.toLowerCase().includes(q)) ||
      (site.lga && site.lga.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.ceil(filteredSites.length / pageSize) || 1;
  const paginatedSites = filteredSites.slice((page - 1) * pageSize, page * pageSize);

  const smcOptions = ['All', ...new Set(sites.map(s => s.smc).filter(Boolean))];
  const clusterOptions = ['All', ...new Set(sites.map(s => s.cluster_name).filter(Boolean))];

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 border border-slate-800">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-cyan-600 to-indigo-600 rounded-xl shadow-lg shadow-cyan-500/20">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
                IHS Matrix Directory
                <span className="px-2.5 py-0.5 text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-full">
                  1,007 Sites
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Comprehensive IHS Site Matrix table, engineering contacts, EFS/FSE personnel directory & direct calling
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadMatrixSites}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition-all flex items-center space-x-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Refresh Data</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="glass-panel p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 border border-slate-800">
        
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[280px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search IHS Matrix by Site ID (FC2063), EFS, FSE, Phone, Cluster, Address..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-slate-900/90 text-xs text-white placeholder-slate-500 pl-9 pr-4 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 font-medium"
          />
        </div>

        {/* SMC Vendor Filter */}
        <div className="flex items-center space-x-1.5 text-xs">
          <span className="text-slate-400 font-semibold flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-purple-400" /> SMC Vendor:
          </span>
          <select
            value={smcFilter}
            onChange={(e) => { setSmcFilter(e.target.value); setPage(1); }}
            className="bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none font-bold"
          >
            {smcOptions.map((smc) => (
              <option key={smc} value={smc}>{smc}</option>
            ))}
          </select>
        </div>

        {/* Cluster Filter */}
        <div className="flex items-center space-x-1.5 text-xs">
          <span className="text-slate-400 font-semibold flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-cyan-400" /> Cluster:
          </span>
          <select
            value={clusterFilter}
            onChange={(e) => { setClusterFilter(e.target.value); setPage(1); }}
            className="bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none font-bold max-w-[180px]"
          >
            {clusterOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Full-Width IHS Matrix Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-900 text-cyan-300 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3">Site ID / MTN ID</th>
                <th className="p-3">Tower Co & SMC</th>
                <th className="p-3">Cluster Name</th>
                <th className="p-3">EFS Contact & Call</th>
                <th className="p-3">SMC FSE Engineer & Call</th>
                <th className="p-3">RTO Officer</th>
                <th className="p-3">Power Solution & DG</th>
                <th className="p-3">Site Address / LGA</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400">
                    <Radio className="w-6 h-6 text-cyan-400 animate-spin mx-auto mb-2" />
                    Loading IHS Matrix directory table...
                  </td>
                </tr>
              ) : paginatedSites.length > 0 ? (
                paginatedSites.map((site) => {
                  const siteId = site.ihs_site_id || site.mtn_id || 'UNKNOWN';
                  const altId = site.mtn_id && site.mtn_id !== siteId ? site.mtn_id : (site.ihs_site_id !== siteId ? site.ihs_site_id : '');

                  return (
                    <tr key={site.id} className="hover:bg-slate-900/60 transition-all">
                      
                      {/* Site ID / MTN ID */}
                      <td className="p-3 font-mono font-extrabold text-cyan-300">
                        <button
                          onClick={() => onSelectSite(siteId)}
                          className="hover:underline flex items-center space-x-1"
                        >
                          <span>{siteId}</span>
                          <ExternalLink className="w-3 h-3 text-cyan-400" />
                        </button>
                        {altId && <div className="text-[10px] text-slate-400 font-mono font-normal">({altId})</div>}
                      </td>

                      {/* Tower Co & SMC */}
                      <td className="p-3 font-semibold text-slate-200">
                        <div className="flex items-center space-x-1.5">
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] font-bold rounded border border-purple-500/30">
                            {site.tower_co || 'IHS'}
                          </span>
                          <span className="text-slate-300 text-[11px] font-bold">({site.smc || 'IHS'})</span>
                        </div>
                        {site.sub_sbc && <div className="text-[10px] text-slate-400 mt-0.5">SBC: {site.sub_sbc}</div>}
                      </td>

                      {/* Cluster Name */}
                      <td className="p-3 font-bold text-emerald-300">
                        {site.cluster_name || 'N/A'}
                      </td>

                      {/* EFS Contact & Direct Call */}
                      <td className="p-3">
                        {site.efs_name ? (
                          <div className="space-y-1">
                            <div className="font-bold text-white leading-none">{site.efs_name}</div>
                            {site.efs_phone && (
                              <div className="flex items-center space-x-1.5 pt-0.5">
                                <a
                                  href={`tel:${site.efs_phone}`}
                                  className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] rounded flex items-center space-x-1 shadow-sm transition-all"
                                  title={`Call EFS ${site.efs_name} (${site.efs_phone})`}
                                >
                                  <Phone className="w-2.5 h-2.5" />
                                  <span>{site.efs_phone}</span>
                                </a>
                                <button
                                  onClick={() => handleCopyPhone(site.efs_phone, `EFS ${site.efs_name}`)}
                                  className="text-slate-400 hover:text-white p-0.5"
                                  title="Copy phone number"
                                >
                                  {copiedPhone === `EFS ${site.efs_name}:${site.efs_phone}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Unassigned</span>
                        )}
                      </td>

                      {/* SMC FSE Engineer & Direct Call */}
                      <td className="p-3">
                        {site.smc_fse_name ? (
                          <div className="space-y-1">
                            <div className="font-bold text-purple-200 leading-none">{site.smc_fse_name}</div>
                            {site.smc_fse_phone && (
                              <div className="flex items-center space-x-1.5 pt-0.5">
                                <a
                                  href={`tel:${site.smc_fse_phone}`}
                                  className="px-2 py-0.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] rounded flex items-center space-x-1 shadow-sm transition-all"
                                  title={`Call FSE ${site.smc_fse_name} (${site.smc_fse_phone})`}
                                >
                                  <Phone className="w-2.5 h-2.5" />
                                  <span>{site.smc_fse_phone}</span>
                                </a>
                                <button
                                  onClick={() => handleCopyPhone(site.smc_fse_phone, `FSE ${site.smc_fse_name}`)}
                                  className="text-slate-400 hover:text-white p-0.5"
                                  title="Copy phone number"
                                >
                                  {copiedPhone === `FSE ${site.smc_fse_name}:${site.smc_fse_phone}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Unassigned</span>
                        )}
                      </td>

                      {/* RTO Officer */}
                      <td className="p-3">
                        {site.rto_name ? (
                          <div>
                            <div className="font-semibold text-amber-300">{site.rto_name}</div>
                            {site.rto_phone && (
                              <a href={`tel:${site.rto_phone}`} className="text-[10px] text-slate-400 hover:text-amber-400 font-mono">
                                {site.rto_phone}
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">-</span>
                        )}
                      </td>

                      {/* Power Solution & DG CAP */}
                      <td className="p-3">
                        <div className="font-semibold text-slate-200">{site.power_solution || 'N/A'}</div>
                        {site.dg_capacity && (
                          <div className="text-[10px] text-amber-400 font-mono">DG: {site.dg_capacity}</div>
                        )}
                      </td>

                      {/* Site Address / LGA */}
                      <td className="p-3 max-w-xs truncate text-slate-300">
                        <div>{site.site_address || 'FCT Address'}</div>
                        <div className="text-[10px] text-slate-400 font-semibold">{site.lga || 'AMAC'} &bull; {site.state || 'FCT'}</div>
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right">
                        <button
                          onClick={() => onSelectSite(siteId)}
                          className="px-2.5 py-1 bg-cyan-600/30 hover:bg-cyan-600/60 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ml-auto"
                        >
                          <span>Profile</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>

                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400">
                    No sites found in IHS Matrix matching query "{search}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing <b className="text-white">{filteredSites.length > 0 ? (page - 1) * pageSize + 1 : 0}</b> to <b className="text-white">{Math.min(page * pageSize, filteredSites.length)}</b> of <b className="text-cyan-300 font-mono">{filteredSites.length}</b> IHS Matrix sites
          </div>

          <div className="flex items-center space-x-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 bg-slate-800 disabled:opacity-40 text-slate-200 rounded-lg font-semibold hover:bg-slate-700"
            >
              Previous
            </button>
            <span className="font-bold text-white font-mono">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 bg-slate-800 disabled:opacity-40 text-slate-200 rounded-lg font-semibold hover:bg-slate-700"
            >
              Next
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
