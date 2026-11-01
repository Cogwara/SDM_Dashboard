import React, { useState } from 'react';
import { 
  UserCheck, Search, Download, Copy, RefreshCw, FileText, FileSpreadsheet, 
  CheckCircle2, AlertTriangle, Building2, PhoneCall, ShieldAlert, Sparkles, MapPin
} from 'lucide-react';
import { lookupSiteFSE, exportSiteFSEExcel } from '../api';
import { getSDMStateInfo } from '../utils/userUtils';

export default function SiteFSELookupView({ currentUser, onSelectSite }) {
  const [siteInput, setSiteInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingTxt, setIsExportingTxt] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [lookupData, setLookupData] = useState(null);

  const stateInfo = getSDMStateInfo(currentUser);
  const userState = stateInfo?.code || 'FCT';

  const sampleSites = `FC3137
FC5891
FC0124
T1296
FC2070
T1460
FC2269
T1338
FC0061
FC2001
T1412
FC2676
T5830
FC0066
FC2478
T0124`;

  const handleLoadSample = () => {
    setSiteInput(sampleSites);
    setErrorMsg('');
  };

  const handleLookup = async () => {
    if (!siteInput.trim()) {
      setErrorMsg('Please enter or paste at least one Site ID.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const data = await lookupSiteFSE({
        site_ids: siteInput,
        state: userState
      });
      setLookupData(data);
    } catch (err) {
      console.error('FSE Lookup error:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to lookup Field Service Engineers (FSE). Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyTxt = () => {
    if (!lookupData?.txt_report) return;
    navigator.clipboard.writeText(lookupData.txt_report);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 3000);
  };

  const handleDownloadTxt = () => {
    if (!lookupData?.txt_report) return;
    setIsExportingTxt(true);
    try {
      const blob = new Blob([lookupData.txt_report], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `Site_FSE_Mapping_${userState}_${dateStr}.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading TXT file:', err);
    } finally {
      setIsExportingTxt(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!siteInput.trim()) return;
    setIsExportingExcel(true);
    try {
      const blob = await exportSiteFSEExcel({
        site_ids: siteInput,
        state: userState
      });
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `Site_FSE_Mapping_${userState}_${dateStr}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading Excel file:', err);
      alert('Error generating Excel export. Please try again.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const filteredResults = (lookupData?.results || []).filter(item => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      (item.matched_site_id || '').toLowerCase().includes(q) ||
      (item.fse_name || '').toLowerCase().includes(q) ||
      (item.fse_phone || '').toLowerCase().includes(q) ||
      (item.site_name || '').toLowerCase().includes(q) ||
      (item.state || '').toLowerCase().includes(q) ||
      (item.lga || '').toLowerCase().includes(q) ||
      (item.tower_co || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-12">
      
      {/* Header Banner */}
      <div className="glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-8 border border-cyan-500/30 shadow-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                Site to FSE Directory & Engineer Mapping
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                WSD October 2026 Engine
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Field Service Engineer (FSE) Site Finder
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
              Paste or input multiple Site IDs below to automatically cross-reference <span className="text-cyan-300 font-mono">WSD OCTOBER 2026</span> database records and extract the assigned Field Service Engineer (FSE) Name, Phone Number, SDM, LGA, and Site Classification. Export formatted reports in TXT or Excel.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLoadSample}
              className="px-4 py-3 bg-slate-800/80 hover:bg-slate-700 text-cyan-300 text-xs font-bold rounded-2xl border border-slate-700 transition-all flex items-center gap-2 shadow-md hover:scale-105"
            >
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Load Sample Sites</span>
            </button>
          </div>
        </div>
      </div>

      {/* Input Box & Controller Section */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 shadow-xl bg-slate-900/60 backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-extrabold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            Input Site IDs (One per line or comma-separated)
          </label>
          <span className="text-[11px] text-slate-400 font-mono">
            {siteInput ? `${siteInput.split('\n').filter(x => x.trim()).length} site IDs entered` : 'Ready for input'}
          </span>
        </div>

        <textarea
          value={siteInput}
          onChange={(e) => setSiteInput(e.target.value)}
          placeholder={`Enter or paste Site IDs here...\nExample:\nFC3137\nFC5891\nFC0124\nT1296\nFC2070`}
          rows={6}
          className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-cyan-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-all resize-y shadow-inner"
        />

        {errorMsg && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs text-red-300 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            onClick={handleLookup}
            disabled={loading || !siteInput.trim()}
            className="px-6 py-3.5 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 text-xs font-black rounded-2xl transition-all flex items-center gap-2 shadow-lg shadow-cyan-950/50 hover:scale-105 disabled:opacity-50 disabled:pointer-events-none"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Searching WSD Records...' : 'Identify FSE Engineers'}</span>
          </button>

          {lookupData && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleCopyTxt}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-2xl border border-slate-700 transition-all flex items-center gap-2"
              >
                <Copy className="w-4 h-4 text-cyan-400" />
                <span>{copySuccess ? 'Copied TXT!' : 'Copy TXT Report'}</span>
              </button>

              <button
                onClick={handleDownloadTxt}
                disabled={isExportingTxt}
                className="px-4 py-3 bg-slate-800/90 hover:bg-slate-700 text-cyan-300 text-xs font-bold rounded-2xl border border-cyan-500/30 transition-all flex items-center gap-2"
              >
                <Download className="w-4 h-4 text-cyan-400" />
                <span>Export TXT (.txt)</span>
              </button>

              <button
                onClick={handleDownloadExcel}
                disabled={isExportingExcel}
                className="px-4 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-black rounded-2xl border border-emerald-500/40 transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/40 hover:scale-105"
              >
                <FileSpreadsheet className={`w-4 h-4 text-emerald-400 ${isExportingExcel ? 'animate-bounce' : ''}`} />
                <span>{isExportingExcel ? 'Exporting...' : 'Export Excel (.xlsx)'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results Breakdown Section */}
      {lookupData && (
        <div className="space-y-6">
          
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/40">
              <span className="text-[10px] font-extrabold uppercase text-slate-400">Total Input Sites</span>
              <p className="text-2xl font-black text-white mt-1">{lookupData.total_input}</p>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/10">
              <span className="text-[10px] font-extrabold uppercase text-emerald-400">Found FSE Records</span>
              <p className="text-2xl font-black text-emerald-400 mt-1">{lookupData.found_count}</p>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/40">
              <span className="text-[10px] font-extrabold uppercase text-slate-400">Unmatched Sites</span>
              <p className="text-2xl font-black text-slate-300 mt-1">{lookupData.missing_count}</p>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-cyan-500/30 bg-cyan-950/10">
              <span className="text-[10px] font-extrabold uppercase text-cyan-400">Hub Sites Identified</span>
              <p className="text-2xl font-black text-cyan-400 mt-1">
                {lookupData.results.filter(r => r.classification?.toLowerCase().includes('hub') || r.downstream_count > 0).length}
              </p>
            </div>
          </div>

          {/* Results Table & Filter Bar */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 shadow-xl bg-slate-900/60 backdrop-blur-md space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                Site to FSE Engineer Mapping Matrix ({filteredResults.length} records)
              </h3>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Filter site, FSE name, phone..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Table Container */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/90 text-[10px] uppercase font-extrabold text-slate-400 tracking-wider border-b border-slate-800">
                    <th className="py-3.5 px-4">#</th>
                    <th className="py-3.5 px-4">Site ID</th>
                    <th className="py-3.5 px-4">Site Name</th>
                    <th className="py-3.5 px-4">FSE Name</th>
                    <th className="py-3.5 px-4">FSE Contact</th>
                    <th className="py-3.5 px-4">State & LGA</th>
                    <th className="py-3.5 px-4">Cluster</th>
                    <th className="py-3.5 px-4">Tower Co</th>
                    <th className="py-3.5 px-4 text-center">Classification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs font-medium">
                  {filteredResults.map((item, idx) => {
                    const isHub = item.classification?.toLowerCase().includes('hub') || item.downstream_count > 0;
                    return (
                      <tr 
                        key={idx}
                        className="hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                        
                        <td className="py-3 px-4 font-mono font-bold text-cyan-400">
                          <button
                            onClick={() => onSelectSite && onSelectSite(item.matched_site_id)}
                            className="hover:underline text-left"
                          >
                            {item.matched_site_id}
                          </button>
                        </td>

                        <td className="py-3 px-4 text-slate-200 font-medium max-w-xs truncate" title={item.site_name}>
                          {item.site_name}
                        </td>

                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 w-fit ${
                            item.is_found 
                              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' 
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{item.fse_name}</span>
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono">
                          {item.fse_phone !== 'N/A' ? (
                            <a 
                              href={`tel:${item.fse_phone}`}
                              className="px-2.5 py-1 rounded-xl text-xs font-extrabold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all inline-flex items-center gap-1.5"
                            >
                              <PhoneCall className="w-3 h-3 text-cyan-400" />
                              <span>{item.fse_phone}</span>
                            </a>
                          ) : (
                            <span className="text-slate-500">N/A</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-slate-300">
                          <div>
                            <span className="font-bold text-white">{item.state}</span>
                            {item.lga && item.lga !== 'N/A' && (
                              <span className="text-[11px] text-slate-400 block">{item.lga}</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {item.cluster}
                        </td>

                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-lg text-[11px] font-extrabold bg-slate-800 text-slate-300 border border-slate-700">
                            {item.tower_co}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                            isHub 
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}>
                            {isHub ? `Hub (+${item.downstream_count})` : 'Terminal'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Formatted TXT Report Preview Modal/Box */}
            {lookupData.txt_report && (
              <div className="mt-6 pt-4 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-cyan-400" />
                    TXT Report Format Output Preview
                  </span>
                  <button
                    onClick={handleCopyTxt}
                    className="text-xs text-cyan-400 hover:underline font-bold"
                  >
                    {copySuccess ? 'Copied!' : 'Copy Preview'}
                  </button>
                </div>
                <pre className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed shadow-inner">
                  {lookupData.txt_report}
                </pre>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
