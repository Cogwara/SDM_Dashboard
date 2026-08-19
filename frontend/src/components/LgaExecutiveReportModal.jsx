import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, X, Sparkles, AlertTriangle, Wrench, RefreshCw, 
  Copy, Check, Printer, Search, ShieldAlert, CheckCircle2, Clock, User,
  FileSpreadsheet, Download, FileDown
} from 'lucide-react';
import { fetchAvailabilityRecords, fetchNotes } from '../api';

export default function LgaExecutiveReportModal({ lgaItem, onClose, onSelectSite }) {
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState([]);
  const [lowest3Elements, setLowest3Elements] = useState([]);
  const [notes, setNotes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadLgaData() {
      if (!lgaItem || !lgaItem.lga) return;
      setLoading(true);

      try {
        const cleanLga = lgaItem.lga.trim().toUpperCase();
        const firstWordLga = cleanLga.split(' ')[0];

        // Perform consolidated parallel requests
        const [sitesRes, notesResLga, notesResAll] = await Promise.all([
          fetchAvailabilityRecords({ lga: cleanLga, page_size: 1000 }),
          fetchNotes({ lga: cleanLga, page_size: 5000 }),
          fetchNotes({ page_size: 5000 })
        ]);

        if (!isMounted) return;

        // Process sites
        const rawSitesList = Array.isArray(sitesRes) ? sitesRes : (sitesRes?.results || []);
        const siteMap = new Map();
        rawSitesList.forEach(s => {
          if (s.site_id && !siteMap.has(s.site_id)) {
            siteMap.set(s.site_id, s);
          }
        });
        const uniqueSites = Array.from(siteMap.values());
        uniqueSites.sort((a, b) => {
          const availA = a.period_availability ?? a.avg_availability ?? 100;
          const availB = b.period_availability ?? b.avg_availability ?? 100;
          return availA - availB;
        });

        setSites(uniqueSites);

        // Pick lowest performing 3 elements
        let lowest3 = uniqueSites.slice(0, 3);
        if (lowest3.length < 3 && lgaItem.lowest_3_sites && lgaItem.lowest_3_sites.length > 0) {
          lgaItem.lowest_3_sites.forEach(ls => {
            if (lowest3.length < 3 && !lowest3.some(e => e.site_id === ls.site_id)) {
              lowest3.push(ls);
            }
          });
        }
        setLowest3Elements(lowest3);

        // Build set of site IDs for matching
        const lgaSiteIds = new Set(uniqueSites.map(s => (s.site_id || '').trim().toUpperCase()).filter(Boolean));
        if (lgaItem.worst_site_id) lgaSiteIds.add(lgaItem.worst_site_id.trim().toUpperCase());
        if (lgaItem.lowest_3_sites) {
          lgaItem.lowest_3_sites.forEach(ls => ls.site_id && lgaSiteIds.add(ls.site_id.trim().toUpperCase()));
        }

        // Process notes
        const notesMap = new Map();
        const combinedNotes = [
          ...(Array.isArray(notesResLga) ? notesResLga : (notesResLga?.results || [])),
          ...(Array.isArray(notesResAll) ? notesResAll : (notesResAll?.results || []))
        ];

        combinedNotes.forEach(n => {
          if (n && n.id) {
            const textContent = `${n.title || ''} ${n.description || ''}`.toUpperCase();
            const extractedMatch = textContent.match(/\b(FC\d{3,5}|ABJ\d{3,5}|FCT\d{3,5}|T\d{3,5})\b/i);
            const noteSiteId = (n.site_ihs_id || (extractedMatch ? extractedMatch[1] : null) || (typeof n.site === 'string' ? n.site : null) || n.site_id || '').toString().trim().toUpperCase();
            const noteLgaUpper = (n.lga || n.site?.lga || '').toUpperCase();

            const isMatch = (noteSiteId && lgaSiteIds.has(noteSiteId)) ||
                            (cleanLga && noteLgaUpper.includes(cleanLga)) ||
                            (firstWordLga && firstWordLga.length > 2 && noteLgaUpper.includes(firstWordLga)) ||
                            (cleanLga && textContent.includes(cleanLga)) ||
                            (firstWordLga && firstWordLga.length > 2 && textContent.includes(firstWordLga));

            if (isMatch) {
              notesMap.set(n.id, {
                ...n,
                site_id: noteSiteId || n.site_id || 'N/A'
              });
            }
          }
        });

        const notesList = Array.from(notesMap.values());
        notesList.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        setNotes(notesList);
      } catch (err) {
        console.error("Error loading LGA report data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadLgaData();

    return () => { isMounted = false; };
  }, [lgaItem]);

  // Dynamic RCA categories string
  const rcaCategories = useMemo(() => {
    const cats = Array.from(new Set(notes.map(n => n.category).filter(Boolean)));
    return cats.length > 0 ? cats.join(', ') : 'Routine Interventions';
  }, [notes]);

  // Filter notes by search query
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter(n => {
      const sId = (n.site_id || n.site_ihs_id || '').toLowerCase();
      const cat = (n.category || '').toLowerCase();
      const title = (n.title || '').toLowerCase();
      const desc = (n.description || '').toLowerCase();
      const fse = (n.smc_fse_name || n.fse_name || '').toLowerCase();
      return sId.includes(q) || cat.includes(q) || title.includes(q) || desc.includes(q) || fse.includes(q);
    });
  }, [notes, searchQuery]);

  // Copy Executive Report to Clipboard
  const handleCopyReport = () => {
    const lowest3Text = lowest3Elements.length > 0
      ? lowest3Elements.map((e, idx) => {
          const avail = e.period_availability ?? e.avg_availability ?? 0;
          const sNotes = notes.filter(n => (n.site_id || '').toUpperCase() === (e.site_id || '').toUpperCase());
          const snippet = sNotes.length > 0 ? ` | Latest RCA: [${sNotes[0].category || 'Incident'}] ${sNotes[0].title || sNotes[0].description}` : ' | No notes logged';
          return `  #${idx + 1}. Site ID: ${e.site_id} (${avail}% Avail | ${e.tech || 'Multi-Tech'} | ${e.tower_co || 'IHS'} | ${sNotes.length} Note(s)${snippet})`;
        }).join('\n')
      : (lgaItem.worst_site_id ? `  #1. Site ID: ${lgaItem.worst_site_id} (${lgaItem.worst_site_avail}% Avail)` : '  None identified');

    const notesText = notes.length > 0
      ? notes.map(n => `  • [Site ID: ${n.site_id}] [${n.category || 'General'} | Priority: ${n.priority || 'Normal'} | Status: ${n.status || 'Active'} | Date: ${n.created_at ? new Date(n.created_at).toLocaleString() : 'N/A'}] (FSE: ${n.smc_fse_name || n.fse_name || 'N/A'}) - ${n.title || ''} ${n.description ? `- Details: ${n.description}` : ''}`).join('\n')
      : '  No operational notes recorded for sites in this LGA.';

    const textToCopy = `SDM OPERATIONAL & NETWORK AVAILABILITY EXECUTIVE REPORT
==================================================
LGA: ${lgaItem.lga} LGA (FCT Territory)
Report Generated: ${new Date().toLocaleDateString()}
Target SLA Benchmark: 98.5%

KEY PERFORMANCE INDICATORS (KPIs):
- LGA Avg Availability: ${lgaItem.avg}% (${lgaItem.avg >= 98.5 ? 'SLA Target Met' : 'SLA Breached'})
- Monitored Cell Sites: ${lgaItem.count} Sites
- SLA Compliance: ${lgaItem.sla_compliant_count} Met / ${lgaItem.sla_breached_count} Breached (${Math.round((lgaItem.sla_compliant_count / (lgaItem.count || 1)) * 100)}%)
- Total SDM Site Operational Notes: ${notes.length} Incidents

WORST PERFORMING 3 CELL SITES IN ${lgaItem.lga} LGA:
${lowest3Text}

SDM OPERATIONAL NOTES & DETAILED SITE LOGS FOR ${lgaItem.lga} LGA:
${notesText}
==================================================`;

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Export Notes as TXT File
  const handleExportTxt = () => {
    const cleanLgaName = (lgaItem.lga || 'LGA').replace(/\s+/g, '_');
    const filename = `SDM_Notes_${cleanLgaName}_LGA_${new Date().toISOString().split('T')[0]}.txt`;

    const lowest3Text = lowest3Elements.length > 0
      ? lowest3Elements.map((e, idx) => {
          const avail = e.period_availability ?? e.avg_availability ?? 0;
          const sNotes = notes.filter(n => (n.site_id || '').toUpperCase() === (e.site_id || '').toUpperCase());
          const snippet = sNotes.length > 0 ? ` | Latest RCA: [${sNotes[0].category || 'Incident'}] ${sNotes[0].title || sNotes[0].description}` : ' | No notes logged';
          return `  #${idx + 1}. Site ID: ${e.site_id} (${avail}% Avail | ${e.tech || 'Multi-Tech'} | ${e.tower_co || 'IHS'} | ${sNotes.length} Note(s)${snippet})`;
        }).join('\n')
      : '  None identified';

    const notesText = filteredNotes.length > 0
      ? filteredNotes.map((n, idx) => {
          const sId = n.site_id || n.site_ihs_id || 'N/A';
          const cat = n.category || 'General';
          const prio = n.priority || 'Normal';
          const status = n.status || 'Active';
          const fse = n.smc_fse_name || n.fse_name || n.created_by || 'Unassigned FSE';
          const dateStr = n.created_at ? new Date(n.created_at).toLocaleString() : 'N/A';
          const titleStr = n.title ? `Title: ${n.title}` : '';
          const descStr = n.description ? `Description / RCA: ${n.description}` : '';
          const resStr = n.resolution_summary ? `Resolution Summary: ${n.resolution_summary}` : '';
          return `[LOG #${idx + 1}] Site ID: ${sId} | Category: ${cat} | Priority: ${prio} | Status: ${status}\nAssigned FSE: ${fse} | Date: ${dateStr}\n${titleStr}\n${descStr}\n${resStr}`.trim();
        }).join('\n\n--------------------------------------------------\n\n')
      : 'No operational notes recorded.';

    const fileContent = `SDM OPERATIONAL NOTES & DETAILED SITE LOGS REPORT
==================================================
LGA: ${lgaItem.lga} LGA (FCT Territory)
Report Generated: ${new Date().toLocaleString()}
Target SLA Benchmark: 98.5%

KEY PERFORMANCE INDICATORS (KPIs):
- LGA Avg Availability: ${lgaItem.avg}%
- Monitored Cell Sites: ${lgaItem.count} Sites
- SLA Compliance: ${lgaItem.sla_compliant_count} Met / ${lgaItem.sla_breached_count} Breached (${Math.round((lgaItem.sla_compliant_count / (lgaItem.count || 1)) * 100)}%)
- Total SDM Site Operational Notes: ${notes.length} Incidents

WORST PERFORMING 3 CELL SITES IN ${lgaItem.lga} LGA:
${lowest3Text}

DETAILED SDM OPERATIONAL SITE LOGS (${filteredNotes.length} Notes):
==================================================
${notesText}
==================================================`;

    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export Notes as Excel (CSV) File
  const handleExportExcel = () => {
    const cleanLgaName = (lgaItem.lga || 'LGA').replace(/\s+/g, '_');
    const filename = `SDM_Operational_Notes_${cleanLgaName}_LGA_${new Date().toISOString().split('T')[0]}.csv`;

    const headers = [
      'Site ID',
      'LGA',
      'Category',
      'Priority',
      'Status',
      'Assigned FSE',
      'Logged Date',
      'Logged Time',
      'Title / RCA Headline',
      'Description / RCA Details',
      'Resolution Summary'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [headers.map(escapeCsv).join(',')];

    filteredNotes.forEach(n => {
      const sId = n.site_id || n.site_ihs_id || 'N/A';
      const lga = lgaItem.lga || 'N/A';
      const cat = n.category || 'General';
      const prio = n.priority || 'Normal';
      const status = n.status || 'Resolved';
      const fse = n.smc_fse_name || n.fse_name || n.created_by || 'Unassigned FSE';
      const dateObj = n.created_at ? new Date(n.created_at) : null;
      const dateStr = dateObj ? dateObj.toLocaleDateString('en-GB') : 'N/A';
      const timeStr = dateObj ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
      const titleStr = n.title || 'N/A';
      const descStr = n.description || 'N/A';
      const resStr = n.resolution_summary || 'N/A';

      const row = [
        sId,
        lga,
        cat,
        prio,
        status,
        fse,
        dateStr,
        timeStr,
        titleStr,
        descStr,
        resStr
      ].map(escapeCsv).join(',');

      csvRows.push(row);
    });

    const csvContent = '\uFEFF' + csvRows.join('\n'); // Add UTF-8 BOM for Excel compatibility
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!lgaItem) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-cyan-500/50 rounded-3xl max-w-6xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative my-6 text-slate-100 animate-in fade-in zoom-in duration-200 max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 rounded-2xl shrink-0">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-3 py-0.5 font-mono font-black text-sm text-cyan-300 bg-cyan-950/70 rounded-md border border-cyan-500/30">
                  {lgaItem.lga} LGA
                </span>
                <span className="px-2.5 py-0.5 bg-purple-500/20 text-purple-300 font-mono font-bold text-xs rounded border border-purple-500/30">
                  FCT Territory
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                SDM Operational & Network Availability Executive Report
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Report Generated: {new Date().toLocaleDateString('en-US', { dateStyle: 'full' })} • Target SLA: <b className="text-emerald-400">98.5%</b>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="overflow-y-auto space-y-6 pr-1 custom-scrollbar">

          {/* KPI Scorecard */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block tracking-wider">LGA Avg Availability</span>
              <div className={`text-2xl sm:text-3xl font-black font-mono mt-1 ${
                lgaItem.avg >= 98.5 ? 'text-emerald-400' : lgaItem.avg >= 95.0 ? 'text-amber-400' : 'text-red-400 animate-pulse'
              }`}>
                {lgaItem.avg}%
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block font-mono">
                {lgaItem.avg >= 98.5 ? '🟢 SLA Target Met' : '🟡 SLA Breached (< 98.5%)'}
              </span>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block tracking-wider">Monitored Sites</span>
              <div className="text-2xl sm:text-3xl font-black text-cyan-300 font-mono mt-1">
                {sites.length || lgaItem.count}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Active Network Elements</span>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block tracking-wider">SLA Compliance</span>
              <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono mt-1">
                {lgaItem.sla_compliant_count} / {lgaItem.count}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block font-mono">
                ({Math.round((lgaItem.sla_compliant_count / (lgaItem.count || 1)) * 100)}% Sites Met 98.5%)
              </span>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block tracking-wider">SDM Operational Notes</span>
              <div className="text-2xl sm:text-3xl font-black text-purple-400 font-mono mt-1">
                {notes.length}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Recorded Site Incidents</span>
            </div>
          </div>

          {/* Executive Summary & Worst 3 Sites */}
          <div className="bg-slate-950 p-5 sm:p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-black uppercase text-cyan-300 tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                Executive SDM Operational Summary for {lgaItem.lga} LGA
              </h3>
              <span className="text-[10px] font-mono bg-purple-950/60 text-purple-300 px-2.5 py-0.5 rounded-full border border-purple-500/30">
                Automated SDM Intelligence
              </span>
            </div>

            <div className="text-xs text-slate-300 space-y-3 leading-relaxed font-sans">
              <p>
                <b>Network Status:</b> During the current monitoring period, <b>{lgaItem.lga} LGA</b> achieved an average daily network availability of <b className={lgaItem.avg >= 98.5 ? 'text-emerald-400' : 'text-amber-400'}>{lgaItem.avg}%</b> across <b>{lgaItem.count} monitored cell sites</b>. Total SLA compliance stands at <b>{lgaItem.sla_compliant_count} sites meeting the 98.5% SLA benchmark</b>, with <b>{lgaItem.sla_breached_count} sites breaching target SLA</b>.
              </p>

              {/* Worst 3 Sites Section */}
              {lowest3Elements && lowest3Elements.length > 0 ? (
                <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <span>Primary Outage Focus (Lowest Performing 3 Sites in {lgaItem.lga} LGA):</span>
                    </p>
                    <span className="text-[10px] font-mono text-slate-400">Target SLA: 98.5%</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 my-2">
                    {lowest3Elements.map((elem, idx) => {
                      const avail = elem.period_availability ?? elem.avg_availability ?? 0;
                      const elemSiteUpper = (elem.site_id || '').toUpperCase();
                      const siteNotes = notes.filter(n => (n.site_id || '').toUpperCase() === elemSiteUpper);
                      const latestNote = siteNotes[0];

                      return (
                        <div key={elem.site_id || idx} className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 hover:border-cyan-500/50 transition-all flex flex-col justify-between space-y-2.5 shadow-md">
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 font-mono text-xs font-black flex items-center justify-center border border-red-500/40 shrink-0">
                                #{idx + 1}
                              </span>
                              <button
                                onClick={() => {
                                  onClose();
                                  if (onSelectSite) onSelectSite(elem.site_id);
                                }}
                                className="font-mono font-black text-sm text-cyan-300 hover:underline text-left cursor-pointer"
                              >
                                {elem.site_id}
                              </button>
                            </div>

                            <span className={`font-mono font-black text-xs px-2.5 py-0.5 rounded-lg border shrink-0 ${
                              avail >= 98.5 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'
                            }`}>
                              {avail}%
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-400 font-sans flex items-center justify-between">
                            <span>{elem.tech || 'Multi-Tech'} • {elem.tower_co || 'IHS'}</span>
                            <span className="font-mono font-bold text-purple-300 bg-purple-950/50 px-2 py-0.5 rounded border border-purple-500/20">
                              {siteNotes.length} note{siteNotes.length !== 1 ? 's' : ''}
                            </span>
                          </div>

                          {latestNote ? (
                            <div className="mt-1 pt-2 border-t border-slate-800/80 text-[11px] space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                                <span className="text-amber-400 font-bold">Latest RCA:</span>
                                <span>{latestNote.created_at ? new Date(latestNote.created_at).toLocaleDateString() : ''}</span>
                              </div>
                              <p className="text-slate-300 font-sans text-xs line-clamp-3 leading-snug" title={latestNote.description || latestNote.title}>
                                <b className="text-cyan-300">[{latestNote.category || 'Incident'}]:</b> {latestNote.title || latestNote.description}
                              </p>
                            </div>
                          ) : (
                            <div className="mt-1 pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 italic font-sans">
                              No open operational notes recorded for {elem.site_id}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : lgaItem.worst_site_id ? (
                <p>
                  <b>Primary SLA Outage Focus:</b> The lowest performing element in this LGA is site <b className="text-cyan-300 font-mono">{lgaItem.worst_site_id}</b> with <b className="text-red-400 font-mono">{lgaItem.worst_site_avail}% availability</b> requiring immediate field engineering support.
                </p>
              ) : null}

              {loading ? (
                <div className="py-4 text-center text-cyan-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading SDM site notes for {lgaItem.lga} LGA...</span>
                </div>
              ) : notes && notes.length > 0 ? (
                <p>
                  <b>Field Operations & Incident RCA:</b> A total of <b>{notes.length} SDM operational notes</b> were logged across cell sites involved in <b>{lgaItem.lga} LGA</b>. Key field issues recorded across sites include: <b className="text-cyan-300">{rcaCategories}</b> interventions.
                </p>
              ) : (
                <p className="text-slate-400 italic">
                  No active open critical site notes currently recorded for sites in this LGA. All sites operating under standard maintenance routine.
                </p>
              )}
            </div>
          </div>

          {/* Operational Site Notes Table with Complete Details */}
          <div className="space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-black uppercase text-slate-200 tracking-wider">
                  SDM Operational Notes & Detailed Site Logs ({lgaItem.lga} LGA)
                </h3>
              </div>

              {/* Action Tools: Search + Export TXT + Export Excel */}
              <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search Site ID, FSE, Category, or RCA..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-slate-950 text-slate-200 text-xs pl-9 pr-3 py-1.5 rounded-xl border border-slate-800 focus:outline-none focus:border-cyan-500/50 w-56 sm:w-64 font-mono shadow-inner"
                  />
                </div>

                <button
                  onClick={handleExportExcel}
                  className="px-3 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer shrink-0"
                  title="Export notes log to Excel / CSV spreadsheet"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>Export Excel</span>
                </button>

                <button
                  onClick={handleExportTxt}
                  className="px-3 py-1.5 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer shrink-0"
                  title="Export notes log to plain text file"
                >
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span>Export TXT</span>
                </button>

                <span className="text-xs font-mono font-bold text-purple-300 bg-purple-950/70 border border-purple-500/30 px-3 py-1.5 rounded-xl shrink-0">
                  {filteredNotes.length} / {notes.length} Notes
                </span>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-cyan-400 flex items-center justify-center gap-3 bg-slate-950 border border-slate-800 rounded-2xl">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span className="text-sm font-semibold">Fetching complete operational site logs for {lgaItem.lga} LGA...</span>
              </div>
            ) : filteredNotes && filteredNotes.length > 0 ? (
              <div className="max-h-[480px] overflow-y-auto border border-slate-800 rounded-2xl shadow-inner bg-slate-950/50">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 text-[10px] uppercase font-black sticky top-0 border-b border-slate-800 tracking-wider z-10">
                      <th className="py-3 px-4 w-32">Site ID</th>
                      <th className="py-3 px-4 w-36">Category & Status</th>
                      <th className="py-3 px-4 w-28">Priority</th>
                      <th className="py-3 px-4 w-44">Assigned FSE</th>
                      <th className="py-3 px-4 w-36">Logged Date / Time</th>
                      <th className="py-3 px-4">Complete Operational Note & Root Cause Analysis (RCA) Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-900/60 font-mono">
                    {filteredNotes.map((n) => {
                      const noteSiteUpper = (n.site_id || n.site_ihs_id || '').toUpperCase();
                      const lowestRank = (lowest3Elements || []).findIndex(
                        elem => elem.site_id && elem.site_id.toUpperCase() === noteSiteUpper
                      );
                      const fseName = n.smc_fse_name || n.fse_name || n.created_by || 'Unassigned FSE';

                      return (
                        <tr key={n.id} className="hover:bg-slate-800/50 transition-colors align-top">
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <button
                                onClick={() => {
                                  onClose();
                                  if (onSelectSite) onSelectSite(n.site_id || n.site_ihs_id);
                                }}
                                className="font-mono font-black text-sm text-cyan-300 hover:underline hover:text-cyan-200 block text-left cursor-pointer"
                              >
                                {n.site_id || n.site_ihs_id || n.site || 'N/A'}
                              </button>
                              {lowestRank >= 0 && (
                                <span className="inline-block px-2 py-0.5 text-[9px] font-extrabold rounded-md bg-red-500/20 text-red-300 border border-red-500/40 font-mono">
                                  #{lowestRank + 1} Lowest
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 space-y-1 font-sans">
                            <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-cyan-300 border border-slate-700 block w-fit">
                              {n.category || 'General'}
                            </span>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              n.status === 'Resolved' || n.status === 'Closed' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30' : 'bg-amber-950/80 text-amber-300 border border-amber-500/30'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${n.status === 'Resolved' || n.status === 'Closed' ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'}`} />
                              <span>{n.status || 'Resolved'}</span>
                            </span>
                          </td>

                          <td className="py-3.5 px-4 font-sans">
                            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold inline-block ${
                              n.priority === 'Critical' ? 'bg-red-500/20 text-red-300 border border-red-500/40' : n.priority === 'High' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}>
                              {n.priority || 'Normal'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-slate-200 font-sans">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span className="font-bold text-xs">{fseName}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-slate-400 text-[11px] font-mono whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                              <span>{n.created_at ? new Date(n.created_at).toLocaleDateString('en-GB') : 'N/A'}</span>
                            </div>
                            {n.created_at && (
                              <span className="text-[10px] text-slate-500 block mt-0.5">
                                {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-slate-200 font-sans text-xs space-y-1.5 leading-relaxed">
                            {n.title && (
                              <div className="font-black text-cyan-200 text-xs">
                                {n.title}
                              </div>
                            )}
                            {n.description && n.description !== n.title && (
                              <div className="text-slate-300 text-xs font-sans whitespace-pre-wrap bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 text-left">
                                {n.description}
                              </div>
                            )}
                            {n.resolution_summary && (
                              <div className="text-[11px] text-emerald-300 font-mono bg-emerald-950/40 p-2 rounded-lg border border-emerald-500/20 flex items-start gap-1.5 mt-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                <div>
                                  <b className="text-emerald-400">Resolution Summary:</b> {n.resolution_summary}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 text-center text-slate-400 text-xs italic space-y-1">
                <p className="font-semibold text-slate-300 text-sm">
                  No active open SDM operational notes recorded for sites in {lgaItem.lga} LGA
                </p>
                {lowest3Elements && lowest3Elements.length > 0 && (
                  <p className="font-mono text-xs text-cyan-400 mt-1">
                    Lowest performing 3 sites in LGA: {lowest3Elements.map(e => `${e.site_id} (${e.period_availability ?? e.avg_availability}%)`).join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center space-x-2.5">
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 font-bold text-xs rounded-xl border border-emerald-500/40 transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Export Excel</span>
            </button>

            <button
              onClick={handleExportTxt}
              className="px-3.5 py-2 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 font-bold text-xs rounded-xl border border-cyan-500/40 transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <FileText className="w-4 h-4 text-cyan-400" />
              <span>Export TXT</span>
            </button>

            <button
              onClick={handleCopyReport}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-cyan-400" />}
              <span>{copied ? 'Copied Full Report!' : 'Copy Executive Report'}</span>
            </button>

            <button
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Printer className="w-4 h-4 text-slate-400" />
              <span>Print Report</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer"
          >
            Close Report
          </button>
        </div>

      </div>
    </div>
  );
}
