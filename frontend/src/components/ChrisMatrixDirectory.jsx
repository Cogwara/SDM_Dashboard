import React, { useState, useEffect } from 'react';
import { 
  Search, Phone, PhoneCall, Radio, FileSpreadsheet, MapPin, Zap, UserCheck, 
  ChevronRight, Building2, Filter, Copy, Check, ExternalLink, Shield, RefreshCw
} from 'lucide-react';
import { fetchSites } from '../api';

export default function ChrisMatrixDirectory({ onSelectSite, currentUser }) {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [smcFilter, setSmcFilter] = useState('All');
  const [clusterFilter, setClusterFilter] = useState('All');
  const [copiedPhone, setCopiedPhone] = useState(null);

  const loadMatrixSites = async () => {
    setLoading(true);
    try {
      // Fetch sites for FCT/Matrix portfolio
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

  const smcOptions = ['All', ...new Set(sites.map(s => s.smc).filter(Boolean))];
  const clusterOptions = ['All', ...new Set(sites.map(s => s.cluster_name).filter(Boolean))];

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 border border-slate-800">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-gradient-to-tr from-cyan-600 to-indigo-600 rounded-xl shadow-lg">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
                Matrix Directory & Site Call Center
                <span className="px-2.5 py-0.5 text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-full">
                  1,007 Matrix Sites Loaded
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Search FCT Site Matrix, instant personnel directory, EFS/FSE contacts & direct dial calling
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
            <span>Refresh Directory</span>
          </button>
        </div>
      </div>

      {/* Stats Quick Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 rounded-xl border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400">Total Matrix Sites</div>
          <div className="text-xl font-extrabold text-white mt-1 font-mono">{filteredSites.length}</div>
          <div className="text-[10px] text-cyan-400 mt-0.5">FCT Network Directory</div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400">SMC Vendors</div>
          <div className="text-xl font-extrabold text-purple-400 mt-1 font-mono">{smcOptions.length - 1}</div>
          <div className="text-[10px] text-purple-300 mt-0.5">Huawei, IHS, ATC, PAT</div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400">Clusters Covered</div>
          <div className="text-xl font-extrabold text-emerald-400 mt-1 font-mono">{clusterOptions.length - 1}</div>
          <div className="text-[10px] text-emerald-300 mt-0.5">Apo, Maitama, Wuse, etc.</div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400">Direct Personnel Dial</div>
          <div className="text-xl font-extrabold text-amber-400 mt-1 font-mono">100% Active</div>
          <div className="text-[10px] text-amber-300 mt-0.5">One-click EFS / FSE Call</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="glass-panel p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 border border-slate-800">
        
        {/* Search Input */}
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search site by ID (e.g. FC2063), EFS, FSE Name, Phone, Address, Cluster..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900/90 text-xs text-white placeholder-slate-500 pl-9 pr-4 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 font-medium"
          />
        </div>

        {/* SMC Vendor Filter */}
        <div className="flex items-center space-x-1.5 text-xs">
          <span className="text-slate-400 font-semibold flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-purple-400" /> SMC Vendor:
          </span>
          <select
            value={smcFilter}
            onChange={(e) => setSmcFilter(e.target.value)}
            className="bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500 font-bold"
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
            onChange={(e) => setClusterFilter(e.target.value)}
            className="bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500 font-bold max-w-[180px]"
          >
            {clusterOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Directory Results Table / List */}
      <div className="space-y-4">
        {loading ? (
          <div className="glass-panel p-12 text-center text-slate-400 text-xs border border-slate-800">
            <Radio className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-2" />
            Loading Chris Matrix Site Directory & Contact Records...
          </div>
        ) : filteredSites.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSites.map((site) => {
              const siteId = site.ihs_site_id || site.mtn_id || 'UNKNOWN';
              const altId = site.mtn_id && site.mtn_id !== siteId ? site.mtn_id : (site.ihs_site_id !== siteId ? site.ihs_site_id : '');

              return (
                <div
                  key={site.id}
                  className="glass-card p-4 rounded-2xl border border-slate-800 hover:border-cyan-500/50 transition-all flex flex-col justify-between space-y-3 group shadow-lg"
                >
                  <div>
                    {/* Header: Site ID & Action Button */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                      <div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => onSelectSite(siteId)}
                            className="px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-mono font-extrabold text-sm rounded-lg border border-cyan-500/40 transition-all flex items-center space-x-1"
                            title="Click to view full site profile"
                          >
                            <span>{siteId}</span>
                            <ExternalLink className="w-3 h-3 text-cyan-400" />
                          </button>
                          {altId && (
                            <span className="text-[11px] text-slate-400 font-mono">({altId})</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-300 font-semibold mt-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-cyan-400" />
                          <span>{site.cluster_name || 'No Cluster'}</span> &bull; <span className="text-purple-300">{site.smc || 'IHS'}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => onSelectSite(siteId)}
                        className="px-2 py-1 bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center space-x-1"
                      >
                        <span>Profile</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Operational Details */}
                    <div className="py-2 grid grid-cols-2 gap-2 text-[11px] border-b border-slate-800/80">
                      <div>
                        <span className="text-slate-400">Power Solution:</span>
                        <div className="font-semibold text-slate-200 truncate">{site.power_solution || 'N/A'}</div>
                      </div>
                      <div>
                        <span className="text-slate-400">DG Capacity:</span>
                        <div className="font-semibold text-amber-300 truncate">{site.dg_capacity || 'N/A'}</div>
                      </div>
                      <div>
                        <span className="text-slate-400">Category:</span>
                        <div className="font-semibold text-cyan-300 truncate">{site.solution_category || 'N/A'}</div>
                      </div>
                      <div>
                        <span className="text-slate-400">Function Mode:</span>
                        <div className="font-semibold text-emerald-300 truncate">{site.functionality_mode || 'Auto'}</div>
                      </div>
                    </div>

                    {/* Direct Call & Personnel Directory */}
                    <div className="pt-2.5 space-y-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Directory Contacts</span>
                        <span className="text-cyan-400 flex items-center gap-0.5"><PhoneCall className="w-2.5 h-2.5" /> Direct Call</span>
                      </div>

                      {/* EFS Contact */}
                      {site.efs_name && (
                        <div className="flex items-center justify-between bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                          <div>
                            <div className="text-[10px] text-cyan-400 font-semibold">EFS (Emergency Field Specs)</div>
                            <div className="text-xs font-bold text-white">{site.efs_name}</div>
                          </div>
                          {site.efs_phone && (
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handleCopyPhone(site.efs_phone, `EFS ${site.efs_name}`)}
                                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded"
                                title="Copy phone number"
                              >
                                {copiedPhone === `EFS ${site.efs_name}:${site.efs_phone}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <a
                                href={`tel:${site.efs_phone}`}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center space-x-1 shadow-md transition-all"
                                title={`Call EFS ${site.efs_name} (${site.efs_phone})`}
                              >
                                <Phone className="w-3 h-3" />
                                <span>Call</span>
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      {/* SMC FSE Contact */}
                      {site.smc_fse_name && (
                        <div className="flex items-center justify-between bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                          <div>
                            <div className="text-[10px] text-purple-400 font-semibold">SMC FSE Engineer</div>
                            <div className="text-xs font-bold text-white">{site.smc_fse_name}</div>
                          </div>
                          {site.smc_fse_phone && (
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handleCopyPhone(site.smc_fse_phone, `FSE ${site.smc_fse_name}`)}
                                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded"
                                title="Copy phone number"
                              >
                                {copiedPhone === `FSE ${site.smc_fse_name}:${site.smc_fse_phone}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <a
                                href={`tel:${site.smc_fse_phone}`}
                                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg flex items-center space-x-1 shadow-md transition-all"
                                title={`Call FSE ${site.smc_fse_name} (${site.smc_fse_phone})`}
                              >
                                <Phone className="w-3 h-3" />
                                <span>Call</span>
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      {/* RTO Contact */}
                      {site.rto_name && (
                        <div className="flex items-center justify-between bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                          <div>
                            <div className="text-[10px] text-amber-400 font-semibold">RTO Officer</div>
                            <div className="text-xs font-bold text-slate-200">{site.rto_name}</div>
                          </div>
                          {site.rto_phone && (
                            <a
                              href={`tel:${site.rto_phone}`}
                              className="px-2 py-1 bg-slate-800 hover:bg-amber-600/80 text-amber-300 hover:text-white font-bold text-xs rounded-lg flex items-center space-x-1 transition-all"
                              title={`Call RTO ${site.rto_name} (${site.rto_phone})`}
                            >
                              <Phone className="w-3 h-3" />
                              <span>Call</span>
                            </a>
                          )}
                        </div>
                      )}

                    </div>
                  </div>

                  {/* Address Footer */}
                  {site.site_address && (
                    <div className="pt-2 text-[10px] text-slate-400 border-t border-slate-800/60 flex items-start gap-1">
                      <MapPin className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{site.site_address}</span>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-panel p-12 text-center text-slate-500 text-xs border border-slate-800">
            No sites found in Chris Matrix matching search query "{search}". Try searching by Site ID, FSE Name, Phone number, or Cluster.
          </div>
        )}
      </div>

    </div>
  );
}
