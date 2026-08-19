import React, { useState } from 'react';
import { 
  Server, Search, FileText, Copy, Check, Download, AlertTriangle, 
  CheckCircle2, Radio, Database, ArrowUpRight, Sparkles, RefreshCw
} from 'lucide-react';
import { identifyHubSites } from '../api';

export default function HubSiteAnalyzerView({ currentUser, onSelectSite }) {
  const [siteInput, setSiteInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [copiedTxt, setCopiedTxt] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'hubs', 'terminals'

  const sampleSites = `FC3137\nFC5981\nFC5891\nFC0009\nFC0190\nFC2196\nFC0124\nFC2070\nT1460\nFC2001\nT1412\nFC2676\nFC0066\nT1296 + 3\nT0124 + 6\nFC2478\nFC2209\nFC2528`;

  const handleLoadSample = () => {
    setSiteInput(sampleSites);
  };

  const handleAnalyze = async (e) => {
    if (e) e.preventDefault();
    if (!siteInput.trim()) return;

    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const userState = currentUser?.state || 'FCT';
      const res = await identifyHubSites(siteInput, userState);
      setAnalysisResult(res);
    } catch (err) {
      console.error('Hub identification error:', err);
      alert('Failed to analyze site list for hubs: ' + (err.message || 'Error occurred'));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCopyTxt = () => {
    if (!analysisResult?.txt_report) return;
    navigator.clipboard.writeText(analysisResult.txt_report);
    setCopiedTxt(true);
    setTimeout(() => setCopiedTxt(false), 2500);
  };

  const handleDownloadTxt = () => {
    if (!analysisResult?.txt_report) return;
    const blob = new Blob([analysisResult.txt_report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const stateStr = currentUser?.state || 'FCT';
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `${stateStr}_Hub_Sites_Report_${dateStr}.txt`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const filteredResults = (analysisResult?.results || []).filter((r) => {
    if (filterMode === 'hubs') return r.is_hub;
    if (filterMode === 'terminals') return !r.is_hub;
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-12">
      
      {/* Header Banner */}
      <div className="glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-8 border border-purple-500/30 shadow-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-purple-950/40">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-purple-400" />
                Network Infrastructure Intelligence
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {currentUser?.state || 'FCT'} Scope
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Hub Site Identification & Report Analyzer
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
              Input or paste a list of Site IDs below. The system cross-references all available data sources (TNL transmission topology, WSD database records, and SDM operational notes) to identify Hub sites, count connected downstream nodes (<code className="text-cyan-300 font-mono">+ N</code>), and generate formatted TXT reports.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLoadSample}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-bold rounded-2xl border border-purple-500/30 transition-all flex items-center gap-1.5 shadow-md"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Load Sample Site List</span>
            </button>
          </div>
        </div>
      </div>


      {/* Site Input Form */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 shadow-xl bg-slate-900/60 backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-400" />
              Input List of Site IDs
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Paste site IDs separated by lines, commas, or spaces (e.g. <code className="text-cyan-300 font-mono">FC3137, FC5981, T1296 + 3, T0124 + 6</code>)
            </p>
          </div>
        </div>

        <form onSubmit={handleAnalyze} className="space-y-4">
          <textarea
            rows={5}
            value={siteInput}
            onChange={(e) => setSiteInput(e.target.value)}
            placeholder="Paste site IDs here... (e.g. FC3137, FC5981, FC5891, FC0009, T1296 + 3, T0124 + 6)"
            className="w-full bg-slate-950 text-xs font-mono text-cyan-200 placeholder-slate-600 p-4 rounded-2xl border border-slate-800 focus:outline-none focus:border-purple-500 transition-all leading-relaxed"
          />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSiteInput('')}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Clear Input
            </button>

            <button
              type="submit"
              disabled={analyzing || !siteInput.trim()}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs rounded-2xl shadow-xl flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${analyzing ? 'animate-spin' : ''}`} />
              <span>{analyzing ? 'Identifying Hub Sites...' : 'Identify Hub Sites & Generate Report'}</span>
            </button>
          </div>
        </form>
      </div>


      {/* Analysis Results View */}
      {analysisResult && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/60">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Input Sites</span>
              <div className="text-2xl font-black text-white font-mono mt-1">{analysisResult.total_input}</div>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-purple-500/30 bg-purple-950/20">
              <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">Identified Hub Sites</span>
              <div className="text-2xl font-black text-purple-400 font-mono mt-1">{analysisResult.hub_count}</div>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/60">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Terminal Sites</span>
              <div className="text-2xl font-black text-slate-300 font-mono mt-1">{analysisResult.terminal_count}</div>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/20">
              <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest">Export Status</span>
              <div className="text-sm font-bold text-emerald-400 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Ready for Export
              </div>
            </div>
          </div>


          {/* Export & Copy Toolbar */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300">Filter View:</span>
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterMode === 'all' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                All Sites ({analysisResult.results.length})
              </button>
              <button
                onClick={() => setFilterMode('hubs')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterMode === 'hubs' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                Hub Sites Only ({analysisResult.hub_count})
              </button>
              <button
                onClick={() => setFilterMode('terminals')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterMode === 'terminals' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                Terminal Sites ({analysisResult.terminal_count})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyTxt}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all"
              >
                {copiedTxt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
                <span>{copiedTxt ? 'Report Copied!' : 'Copy TXT Report'}</span>
              </button>

              <button
                onClick={handleDownloadTxt}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-1.5 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export to TXT (.txt)</span>
              </button>
            </div>
          </div>


          {/* Table Breakdown of Identified Hubs */}
          <div className="glass-panel rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                    <th className="p-4 font-bold">Site ID & Hub Status</th>
                    <th className="p-4 font-bold">Category</th>
                    <th className="p-4 font-bold">Tower Co</th>
                    <th className="p-4 font-bold">Status</th>
                    <th className="p-4 font-bold">Formatted TXT Report Line</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {filteredResults.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-4 font-mono font-bold">
                        <div className="flex items-center gap-2">
                          <span 
                            onClick={() => onSelectSite && onSelectSite(r.site_id)}
                            className="text-white hover:text-cyan-400 cursor-pointer underline decoration-cyan-500/30"
                          >
                            {r.formatted_site_id}
                          </span>
                          {r.is_hub ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              HUB SITE ({r.downstream_degree} NODES)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800 text-slate-400">
                              Terminal
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-4">
                        <span className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[11px]">
                          {r.category}
                        </span>
                      </td>

                      <td className="p-4 text-slate-300 font-semibold">{r.tower_co}</td>
                      
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.status.toLowerCase() === 'active' || r.status.toLowerCase() === 'operational'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-red-500/20 text-red-300 border border-red-500/30'
                        }`}>
                          {r.status}
                        </span>
                      </td>

                      <td className="p-4 font-mono text-[11px] text-cyan-200">
                        {r.report_line}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>


          {/* Live TXT Report Preview Box */}
          <div className="glass-panel p-6 rounded-3xl border border-purple-500/30 shadow-2xl bg-slate-950 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" />
                Live Formatted TXT Report Preview
              </h4>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyTxt}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all"
                >
                  {copiedTxt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
                  <span>{copiedTxt ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <pre className="text-xs font-mono text-cyan-200 bg-slate-900/80 p-5 rounded-2xl border border-slate-800/80 overflow-x-auto leading-relaxed whitespace-pre-wrap select-all">
              {analysisResult.txt_report}
            </pre>
          </div>

        </div>
      )}

    </div>
  );
}
