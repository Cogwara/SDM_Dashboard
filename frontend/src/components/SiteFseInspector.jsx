import React, { useState } from 'react';
import { 
  Search, FileSpreadsheet, Download, User, Phone, MapPin, 
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp, RefreshCw, 
  Building2, Layers, ExternalLink, FileText, Sparkles, Filter, X
} from 'lucide-react';
import { bulkSiteLookup } from '../api';

export default function SiteFseInspector({ currentUser, onSelectSite }) {
  const [inputText, setInputText] = useState('FC2700, FC2437, FC1090, FC2588');
  const [loading, setLoading] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [filterText, setFilterText] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all', 'has_notes', 'found', 'not_found'
  const [expandedRow, setExpandedRow] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  const handleLookup = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) {
      setErrorMsg('Please enter at least one Site ID (e.g. FC2700, FC2437).');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await bulkSiteLookup(inputText);
      setResultData(res);
      setExpandedRow(null);
    } catch (err) {
      console.error('Bulk site lookup error:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to query site records. Please check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setInputText('');
    setResultData(null);
    setErrorMsg('');
    setFilterText('');
  };

  const handleLoadSample = () => {
    setInputText('FC2700, FC2437, FC1090, FC2588, FC1234_INVALID');
  };

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const toggleExpand = (queryId) => {
    setExpandedRow((prev) => (prev === queryId ? null : queryId));
  };

  // Export to Excel with Executive HTML styling, colors, and badge formatting
  const handleExportToExcel = () => {
    if (!resultData || !resultData.results || resultData.results.length === 0) {
      showToast('No site data available to export.');
      return;
    }

    const dateStr = new Date().toLocaleString();
    const exportFileName = `FCT_Site_FSE_and_Notes_Report_${new Date().toISOString().split('T')[0]}.xls`;

    // Construct Executive Formatted HTML Spreadsheet for Microsoft Excel
    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Site FSE & Notes Report</x:Name>
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
          .banner { background-color: #0f172a; color: #ffffff; padding: 18px; border-radius: 8px; font-family: 'Segoe UI', Arial, sans-serif; margin-bottom: 15px; }
          .banner-title { font-size: 18pt; font-weight: bold; color: #38bdf8; margin-bottom: 4px; }
          .banner-subtitle { font-size: 10pt; color: #94a3b8; }
          .meta-bar { font-size: 10pt; margin-top: 10px; color: #e2e8f0; font-weight: 600; }
          .meta-item { display: inline-block; margin-right: 20px; padding: 4px 10px; background-color: #1e293b; border-radius: 4px; border: 1px solid #334155; }
          .excel-table { border-collapse: collapse; width: 100%; font-size: 10pt; font-family: 'Segoe UI', Arial, sans-serif; }
          .excel-table th { background-color: #0284c7; color: #ffffff; font-weight: bold; text-align: left; padding: 10px 12px; border: 1px solid #0369a1; font-size: 10pt; }
          .excel-table td { padding: 9px 12px; border: 1px solid #cbd5e1; vertical-align: top; }
          .row-even { background-color: #f8fafc; }
          .row-odd { background-color: #ffffff; }
          .site-id { font-family: 'Courier New', Courier, monospace; font-weight: bold; color: #0284c7; font-size: 10.5pt; }
          .badge-working { background-color: #d1fae5; color: #065f46; font-weight: bold; padding: 3px 8px; border-radius: 12px; border: 1px solid #a7f3d0; text-align: center; }
          .badge-down { background-color: #fee2e2; color: #991b1b; font-weight: bold; padding: 3px 8px; border-radius: 12px; border: 1px solid #fecaca; text-align: center; }
          .fse-name { font-weight: bold; color: #0f172a; }
          .fse-phone { font-family: 'Courier New', Courier, monospace; color: #059669; font-size: 9.5pt; }
          .sdm-name { font-weight: bold; color: #b45309; }
          .notes-container { font-size: 9.5pt; line-height: 1.4; color: #334155; }
          .note-card { background-color: #f1f5f9; border-left: 3px solid #0284c7; padding: 6px 10px; margin-bottom: 6px; border-radius: 0 4px 4px 0; }
          .note-header { font-weight: bold; color: #0f172a; margin-bottom: 2px; }
          .note-meta { font-size: 8.5pt; color: #64748b; margin-bottom: 3px; }
          .note-desc { color: #1e293b; font-size: 9pt; }
          .summary-row td { background-color: #0f172a; color: #ffffff; font-weight: bold; padding: 10px; border-top: 2px solid #0284c7; }
        </style>
      </head>
      <body>
        <table class="excel-table">
          <thead>
            <tr>
              <th style="width: 45px;">#</th>
              <th>Queried Site ID</th>
              <th>IHS Site ID</th>
              <th>MTN ID</th>
              <th>Cascade</th>
              <th>State</th>
              <th>Cluster</th>
              <th>Priority</th>
              <th>Operational Status</th>
              <th>Field Engineer (FSE)</th>
              <th>FSE Phone</th>
              <th>Project Manager (EFS)</th>
              <th>RTO Engineer</th>
              <th>SDM Manager</th>
              <th>SDM Contact</th>
              <th>TNL Segment</th>
              <th>TNL Link Distance (km)</th>
              <th>Maintenance FMP</th>
              <th>Notes Count</th>
              <th style="width: 320px;">Operational Site Notes & History</th>
            </tr>
          </thead>
          <tbody>
    `;

    resultData.results.forEach((r, idx) => {
      const rowClass = idx % 2 === 0 ? 'row-even' : 'row-odd';
      const statusClass = r.is_down || !r.found ? 'badge-down' : 'badge-working';

      let notesHtml = '';
      if (r.notes && r.notes.length > 0) {
        notesHtml = r.notes.map(n => `
          <div class="note-card">
            <div class="note-header">${n.title}</div>
            <div class="note-meta">[${n.created_at}] &bull; <b>${n.category}</b> &bull; Priority: ${n.priority} &bull; Status: <b>${n.status}</b> &bull; By: ${n.created_by}</div>
            <div class="note-desc">${n.description}</div>
          </div>
        `).join('');
      } else {
        notesHtml = '<span style="color: #94a3b8; font-style: italic;">No operational notes logged</span>';
      }

      html += `
        <tr class="${rowClass}">
          <td style="text-align: center; font-weight: bold; color: #64748b;">${idx + 1}</td>
          <td class="site-id">${r.query_id}</td>
          <td class="site-id">${r.ihs_site_id}</td>
          <td>${r.mtn_id || 'N/A'}</td>
          <td>${r.cascade || 'N/A'}</td>
          <td><b>${r.state}</b></td>
          <td>${r.cluster_name || 'FCT Cluster'}</td>
          <td><b>${r.priority}</b></td>
          <td><span class="${statusClass}">${r.operational_status}</span></td>
          <td class="fse-name">${r.fse_name}</td>
          <td class="fse-phone">${r.fse_phone}</td>
          <td>${r.efs_name}</td>
          <td>${r.rto_name}</td>
          <td class="sdm-name">${r.sdm_name}</td>
          <td class="fse-phone">${r.sdm_phone}</td>
          <td><b>${r.tnl_segment || 'N/A'}</b></td>
          <td style="text-align: center; font-weight: bold; color: #0284c7;">${r.tnl_distance_km ? `${r.tnl_distance_km} km` : 'N/A'}</td>
          <td><b>${r.maintenance_fmp || 'TNL'}</b></td>
          <td style="text-align: center; font-weight: bold; color: #0284c7;">${r.notes_count}</td>
          <td class="notes-container">${notesHtml}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
          <tfoot>
            <tr class="summary-row">
              <td colspan="8">TOTAL EXPORT SUMMARY: ${resultData.results.length} SITES REPORTED</td>
              <td>Found: ${resultData.found_count}</td>
              <td colspan="6">Generated from FCT State Delivery Management Dashboard</td>
              <td style="text-align: center;">${resultData.results.reduce((acc, curr) => acc + (curr.notes_count || 0), 0)} Notes</td>
              <td>Official FCT Telecom Document</td>
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

    showToast(`Exported beautiful styled Excel report (${resultData.results.length} sites)!`);
  };

  // Filtered Results
  const filteredResults = resultData?.results ? resultData.results.filter((item) => {
    if (filterTab === 'has_notes' && item.notes_count === 0) return false;
    if (filterTab === 'found' && !item.found) return false;
    if (filterTab === 'not_found' && item.found) return false;

    if (!filterText.trim()) return true;
    const q = filterText.toLowerCase();

    const notesMatch = item.notes?.some((n) => 
      (n.title && n.title.toLowerCase().includes(q)) || 
      (n.description && n.description.toLowerCase().includes(q)) ||
      (n.category && n.category.toLowerCase().includes(q))
    );

    return (
      (item.query_id && item.query_id.toLowerCase().includes(q)) ||
      (item.ihs_site_id && item.ihs_site_id.toLowerCase().includes(q)) ||
      (item.mtn_id && item.mtn_id.toLowerCase().includes(q)) ||
      (item.fse_name && item.fse_name.toLowerCase().includes(q)) ||
      (item.sdm_name && item.sdm_name.toLowerCase().includes(q)) ||
      (item.state && item.state.toLowerCase().includes(q)) ||
      (item.cluster_name && item.cluster_name.toLowerCase().includes(q)) ||
      notesMatch
    );
  }) : [];

  return (
    <div className="space-y-6">
      {/* Notification Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white font-bold text-xs px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-emerald-400 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Header Panel */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-2xl text-cyan-300">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
                Site FSE & Operational Notes Inspector
                <span className="px-2.5 py-0.5 text-xs bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-500/30 font-mono">
                  Bulk Multi-Site Query
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Type single or multiple Site IDs (e.g. FC2700, FC2437) to pull Field Engineer (FSE) details, SDM manager portfolios, and historical site notes.
              </p>
            </div>
          </div>
        </div>

        {/* Top Summary Stats */}
        {resultData && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-900/90 px-3.5 py-2 rounded-xl border border-slate-800 text-xs flex items-center space-x-2">
              <span className="text-slate-400 font-medium">Total Queried:</span>
              <b className="text-cyan-300 font-mono text-sm">{resultData.total_queried}</b>
            </div>
            <div className="bg-emerald-500/10 px-3.5 py-2 rounded-xl border border-emerald-500/30 text-xs text-emerald-300 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Found: {resultData.found_count}</span>
            </div>
            {resultData.not_found_count > 0 && (
              <div className="bg-red-500/10 px-3.5 py-2 rounded-xl border border-red-500/30 text-xs text-red-400 font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Not Found: {resultData.not_found_count}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Box Card */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Search className="w-4 h-4 text-cyan-400" />
            Enter Single or Multiple Site IDs
          </label>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleLoadSample}
              className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-2.5 py-1 rounded-lg border border-cyan-500/30 transition-all flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" /> Load Sample FCT Sites
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="text-[11px] font-semibold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 transition-all"
            >
              Clear
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-500/10 border border-red-500/40 text-red-300 text-xs rounded-xl flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLookup} className="space-y-3">
          <textarea
            rows={3}
            placeholder="Type or paste Site IDs here separated by commas, spaces, or newlines (e.g. FC2700, FC2437, FC1090, FC2588)..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="w-full bg-slate-950/90 text-white text-xs font-mono p-3.5 rounded-xl border border-slate-800 focus:border-cyan-500 focus:outline-none placeholder-slate-600 transition-all leading-relaxed"
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-slate-400">
              Supports IHS Site IDs (`FC2700`), MTN IDs (`IHS_ABJ_0025B`), or Cascade codes (`ABHRNC7`).
            </p>

            <div className="flex items-center space-x-3 w-full sm:w-auto">
              {resultData && resultData.results.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportToExcel}
                  className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-2 transition-all border border-emerald-500/30"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                  <span>Export to Excel (.xlsx)</span>
                </button>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-2 transition-all"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-cyan-200 animate-spin" />
                    <span>Querying Sites & Notes...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Lookup FSE & Notes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Results Table Section */}
      {resultData && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          
          {/* Controls Bar: Filter Pills & Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            
            {/* Filter Pills */}
            <div className="flex items-center space-x-2 text-xs overflow-x-auto no-scrollbar">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                  filterTab === 'all'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                All Queried ({resultData.results.length})
              </button>

              <button
                onClick={() => setFilterTab('has_notes')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                  filterTab === 'has_notes'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                With Operational Notes ({resultData.results.filter(r => r.notes_count > 0).length})
              </button>

              <button
                onClick={() => setFilterTab('found')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                  filterTab === 'found'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                Found Sites ({resultData.found_count})
              </button>

              {resultData.not_found_count > 0 && (
                <button
                  onClick={() => setFilterTab('not_found')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    filterTab === 'not_found'
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  Not Found ({resultData.not_found_count})
                </button>
              )}
            </div>

            {/* Live Filter Search Input */}
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter Site ID, FSE, SDM, Note..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full bg-slate-900 text-xs text-white placeholder-slate-500 pl-8 pr-8 py-1.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 font-medium"
              />
              {filterText && (
                <button
                  onClick={() => setFilterText('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-900/90 text-slate-300 font-bold border-b border-slate-800 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3 w-10 text-center text-slate-500">#</th>
                  <th className="p-3">Site ID / MTN ID</th>
                  <th className="p-3">State / Cluster</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Field Engineer (FSE)</th>
                  <th className="p-3">SDM Manager</th>
                  <th className="p-3 text-center">Operational Notes</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredResults.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 font-medium">
                      No matching site records found. Try adjusting your query or filter keywords.
                    </td>
                  </tr>
                ) : (
                  filteredResults.map((item, idx) => {
                    const isExpanded = expandedRow === item.query_id;
                    return (
                      <React.Fragment key={item.query_id}>
                        <tr className={`hover:bg-slate-800/50 transition-all ${isExpanded ? 'bg-slate-800/40' : ''}`}>
                          <td className="p-3 text-center font-mono text-slate-500">
                            {idx + 1}
                          </td>

                          {/* Site ID / MTN ID */}
                          <td className="p-3 font-mono">
                            <div className="font-extrabold text-cyan-300 text-xs flex items-center gap-1.5">
                              {item.ihs_site_id}
                              {item.mtn_id && item.mtn_id !== 'N/A' && (
                                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-normal">
                                  {item.mtn_id}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400">Cascade: {item.cascade || 'N/A'}</div>
                          </td>

                          {/* State / Cluster */}
                          <td className="p-3">
                            <div className="font-bold text-white text-xs">{item.state}</div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                              {item.cluster_name || 'FCT Cluster'} &bull; {item.priority}
                            </div>
                          </td>

                          {/* Operational Status */}
                          <td className="p-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold inline-flex items-center gap-1 ${
                              !item.found ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                              item.is_down ? 'bg-red-500/20 text-red-400 border border-red-500/40 glow-badge-red' :
                              'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${item.is_down || !item.found ? 'bg-red-400' : 'bg-emerald-400'}`} />
                              {item.operational_status}
                            </span>
                          </td>

                          {/* FSE Engineer */}
                          <td className="p-3">
                            <div className="font-bold text-slate-100 flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span className="truncate max-w-[150px]">{item.fse_name}</span>
                            </div>
                            {item.fse_phone && item.fse_phone !== 'N/A' ? (
                              <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                                <a href={`tel:${item.fse_phone}`} className="hover:underline font-mono text-emerald-300">
                                  {item.fse_phone}
                                </a>
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-500">Phone N/A</div>
                            )}
                          </td>

                          {/* SDM Manager */}
                          <td className="p-3">
                            <div className="font-bold text-amber-300 text-xs truncate max-w-[150px]">
                              {item.sdm_name}
                            </div>
                            {item.sdm_phone && item.sdm_phone !== 'N/A' && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                {item.sdm_phone}
                              </div>
                            )}
                          </td>

                          {/* Notes Count & Badge */}
                          <td className="p-3 text-center">
                            {item.notes_count > 0 ? (
                              <button
                                onClick={() => toggleExpand(item.query_id)}
                                className="px-2.5 py-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 rounded-xl font-bold text-[11px] inline-flex items-center gap-1.5 transition-all"
                              >
                                <FileText className="w-3.5 h-3.5 text-amber-400" />
                                <span>{item.notes_count} Note{item.notes_count > 1 ? 's' : ''}</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-500 font-medium">No Notes</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="p-3 text-right">
                            {item.found && (
                              <button
                                onClick={() => onSelectSite && onSelectSite(item.ihs_site_id)}
                                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 hover:border-cyan-500 rounded-xl font-bold text-[11px] inline-flex items-center gap-1 transition-all"
                              >
                                <span>Site Profile</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Expanded Operational Notes Row */}
                        {isExpanded && item.notes && item.notes.length > 0 && (
                          <tr className="bg-slate-950/90 border-b border-slate-800">
                            <td colSpan={8} className="p-4">
                              <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-3">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                  <div className="flex items-center space-x-2 text-xs font-bold text-amber-300">
                                    <FileText className="w-4 h-4 text-amber-400" />
                                    <span>Operational Notes History for Site {item.ihs_site_id}</span>
                                  </div>
                                  <span className="text-[11px] text-slate-400 font-mono">
                                    Total {item.notes.length} note(s) logged
                                  </span>
                                </div>

                                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                                  {item.notes.map((note) => (
                                    <div key={note.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center space-x-2">
                                          <h4 className="text-xs font-extrabold text-white">{note.title}</h4>
                                          <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-800 text-cyan-300 rounded border border-slate-700">
                                            {note.category}
                                          </span>
                                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                                            note.priority === 'Critical' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                                            note.priority === 'High' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                                            'bg-slate-800 text-slate-300'
                                          }`}>
                                            {note.priority} Priority
                                          </span>
                                          <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                                            {note.status}
                                          </span>
                                        </div>
                                        <span className="text-[11px] text-slate-400 font-mono">{note.created_at}</span>
                                      </div>

                                      <p className="text-xs text-slate-300 leading-relaxed font-sans bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                                        {note.description}
                                      </p>

                                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                                        <span>Logged by: <b className="text-slate-200">{note.created_by}</b></span>
                                        {note.attachments_count > 0 && (
                                          <span className="text-cyan-400 font-semibold">{note.attachments_count} attachment(s)</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 gap-2 pt-1">
            <div>
              Showing <b className="text-cyan-300">{filteredResults.length}</b> of <b className="text-slate-200">{resultData.results.length}</b> queried site records.
            </div>
            <button
              onClick={handleExportToExcel}
              className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 text-xs"
            >
              <Download className="w-3.5 h-3.5" /> Export full report to Excel (.csv/.xlsx)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
