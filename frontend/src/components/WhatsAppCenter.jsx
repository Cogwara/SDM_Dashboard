import React, { useState, useEffect } from 'react';
import { MessageSquare, Upload, Search, Filter, Clock, Zap, Wrench, BatteryCharging, Signal, User, CheckCircle, Lock, FileText, PlusCircle, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { fetchWhatsAppMessages, importWhatsAppChat, createNote } from '../api';

export default function WhatsAppCenter({ onSelectSite, currentUser }) {
  const isSuperuser = currentUser?.is_superuser;
  const userSdmName = currentUser?.full_name || '';

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIssue, setSelectedIssue] = useState('All');
  const [statusBanner, setStatusBanner] = useState(null);
  
  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [rawText, setRawText] = useState('');
  const [senderGroup, setSenderGroup] = useState('FCT Operations WhatsApp Group');
  const [importing, setImporting] = useState(false);

  // Turn to Note modal
  const [showTurnToNoteModal, setShowTurnToNoteModal] = useState(false);
  const [selectedWm, setSelectedWm] = useState(null);
  const [noteSiteId, setNoteSiteId] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteCategory, setNoteCategory] = useState('Generator');
  const [notePriority, setNotePriority] = useState('High');
  const [noteStatus, setNoteStatus] = useState('In Progress');
  const [noteDescription, setNoteDescription] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const sdmParam = !isSuperuser ? userSdmName : undefined;
      const data = await fetchWhatsAppMessages({
        sdm: sdmParam,
        search,
        issue: selectedIssue !== 'All' ? selectedIssue : undefined
      });
      setMessages(data.results || data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [search, selectedIssue, userSdmName, isSuperuser]);

  const handleOpenTurnToNote = (wm) => {
    setSelectedWm(wm);
    const siteId = wm.site_id_str || '';
    setNoteSiteId(siteId);
    setNoteTitle(`WhatsApp Intel: ${siteId ? `${siteId} - ` : ''}${wm.extracted_customer_update || wm.sender_name}`);
    
    // Auto detect category
    let cat = 'General';
    if (wm.has_generator_issue) cat = 'Generator';
    else if (wm.has_battery_issue) cat = 'Battery';
    else if (wm.has_power_issue) cat = 'Power';
    else if (wm.has_transmission_issue) cat = 'Transmission';
    setNoteCategory(cat);

    setNotePriority(wm.has_generator_issue || wm.has_power_issue ? 'Critical' : 'High');
    setNoteStatus('In Progress');

    const desc = `[WhatsApp Field Operational Intel Log]\nSender: ${wm.sender_name}\nTimestamp: ${new Date(wm.created_at).toLocaleString()}\nDispatched Engineer: ${wm.extracted_engineer || 'N/A'}\nETA / Restoration: ${wm.extracted_eta || 'N/A'}\n\nOriginal WhatsApp Intel Message:\n${wm.message_text}`;
    setNoteDescription(desc);
    setShowTurnToNoteModal(true);
  };

  const handleSaveTurnToNote = async (e) => {
    e.preventDefault();
    if (!noteSiteId.trim()) {
      alert('Please enter or select a valid Site ID (e.g. FC2700).');
      return;
    }

    setSubmittingNote(true);
    try {
      await createNote({
        site_id_input: noteSiteId.trim(),
        title: noteTitle.trim(),
        category: noteCategory,
        priority: notePriority,
        status: noteStatus,
        description: noteDescription,
        created_by: currentUser?.full_name || 'State Delivery Manager'
      });

      setShowTurnToNoteModal(false);
      setStatusBanner({
        type: 'success',
        text: `🟢 Successfully converted WhatsApp Intel into an official Operational Site Note for ${noteSiteId.trim()}!`
      });
    } catch (err) {
      alert('Failed to create site note: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!rawText.trim()) return;
    setImporting(true);
    try {
      await importWhatsAppChat(rawText, senderGroup);
      setShowImportModal(false);
      setRawText('');
      loadMessages();
    } catch (err) {
      alert('Failed to parse WhatsApp chat log: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-400" />
            WhatsApp Field Operational Intelligence Center
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {!isSuperuser ? (
              <span className="text-emerald-300 font-semibold flex items-center gap-1 mt-0.5">
                <Lock className="w-3 h-3 text-emerald-400" /> Scoped to SDM Portfolio: <b>{userSdmName}</b> ({messages.length} Field Messages Parsed)
              </span>
            ) : (
              'Super Administrator Access &bull; Automated Site Detection, Engineer ETA Tracking, and Field Escalation Parsing'
            )}
          </p>
        </div>

        <button
          onClick={() => setShowImportModal(true)}
          className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/40 flex items-center space-x-2 transition-all"
        >
          <Upload className="w-4 h-4" />
          <span>Import WhatsApp Operational Chat</span>
        </button>
      </div>

      {/* Search & Issue Filter */}
      <div className="glass-panel p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 border border-slate-800">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filter by Site ID (e.g. FC2700), Engineer, or message text..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900/80 text-xs text-white placeholder-slate-500 pl-9 pr-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-400">Fault Category:</span>
          {['All', 'Power', 'Generator', 'Fuel', 'Battery', 'Transmission'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedIssue(cat)}
              className={`px-3 py-1 rounded-lg border text-xs font-semibold transition-all ${
                selectedIssue === cat
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Notification Banner */}
      {statusBanner && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-semibold flex items-center justify-between shadow-lg animate-fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{statusBanner.text}</span>
          </div>
          <button onClick={() => setStatusBanner(null)} className="text-slate-400 hover:text-white font-bold text-xs ml-2">✕</button>
        </div>
      )}

      {/* WhatsApp Message Feed */}
      <div className="space-y-3">
        {loading ? (
          <div className="glass-panel p-12 text-center text-slate-400 text-xs border border-slate-800">
            Loading field WhatsApp updates for your portfolio...
          </div>
        ) : messages.length > 0 ? (
          messages.map((wm) => (
            <div
              key={wm.id}
              className="glass-card p-4 rounded-xl border border-slate-800/80 hover:border-emerald-500/40 transition-all"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2 mb-2">
                <div className="flex items-center space-x-3">
                  {wm.site_id_str && (
                    <button
                      onClick={() => onSelectSite(wm.site_id_str)}
                      className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 font-mono font-bold text-xs rounded border border-emerald-500/30 hover:bg-emerald-500/30 transition-all"
                    >
                      {wm.site_id_str}
                    </button>
                  )}
                  <span className="text-xs font-semibold text-slate-200">{wm.sender_name}</span>
                </div>

                <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                  <span>📅 {new Date(wm.created_at).toLocaleString()}</span>
                  <button
                    onClick={() => handleOpenTurnToNote(wm)}
                    className="px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                    title="Convert this WhatsApp intel into an official Operational Site Note"
                  >
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Turn to Note</span>
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-200 font-sans leading-relaxed whitespace-pre-line">{wm.message_text}</p>

              {/* Extracted Intel Badges & Action */}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-[10px]">
                <div className="flex flex-wrap items-center gap-2">
                  {wm.extracted_engineer && (
                    <span className="px-2 py-0.5 bg-cyan-950 text-cyan-300 border border-cyan-800 rounded flex items-center gap-1 font-medium">
                      <User className="w-3 h-3" /> Engineer: {wm.extracted_engineer}
                    </span>
                  )}
                  {wm.extracted_eta && (
                    <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 rounded flex items-center gap-1 font-medium">
                      <Clock className="w-3 h-3" /> ETA: {wm.extracted_eta}
                    </span>
                  )}
                  {wm.has_generator_issue && (
                    <span className="px-2 py-0.5 bg-purple-950 text-purple-300 border border-purple-800 rounded">
                      Generator Issue
                    </span>
                  )}
                  {wm.has_power_issue && (
                    <span className="px-2 py-0.5 bg-yellow-950 text-yellow-300 border border-yellow-800 rounded">
                      Commercial Power Outage
                    </span>
                  )}
                  {wm.has_battery_issue && (
                    <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded">
                      Battery Issue
                    </span>
                  )}
                </div>

                <button
                  onClick={() => handleOpenTurnToNote(wm)}
                  className="px-2.5 py-0.5 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 rounded text-[10px] font-semibold flex items-center gap-1 transition-all"
                >
                  <Sparkles className="w-3 h-3 text-cyan-400" /> Convert to Note
                </button>
              </div>

            </div>
          ))
        ) : (
          <div className="glass-panel p-12 text-center text-slate-500 text-xs border border-slate-800">
            No WhatsApp chat records found for your portfolio. Click "Import WhatsApp Operational Chat" above to paste and extract chat logs.
          </div>
        )}
      </div>

      {/* Turn to Note Modal */}
      {showTurnToNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="glass-panel max-w-2xl w-full p-6 rounded-2xl border border-cyan-500/30 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                Turn WhatsApp Intel into Operational Site Note
              </h3>
              <button onClick={() => setShowTurnToNoteModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveTurnToNote} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Site ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. FC2700"
                    value={noteSiteId}
                    onChange={(e) => setNoteSiteId(e.target.value.toUpperCase())}
                    className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 font-mono font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Fault Category</label>
                  <select
                    value={noteCategory}
                    onChange={(e) => setNoteCategory(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 font-semibold"
                  >
                    {['Generator', 'Power', 'Battery', 'Transmission', 'Fuel', 'Microwave', 'RAN', 'General', 'Preventive Maintenance', 'Corrective Maintenance'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Operational Note Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. WhatsApp Intel: FC2700 Generator Battery Failure"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Priority Level</label>
                  <select
                    value={notePriority}
                    onChange={(e) => setNotePriority(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none"
                  >
                    {['Critical', 'High', 'Medium', 'Low'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Current Status</label>
                  <select
                    value={noteStatus}
                    onChange={(e) => setNoteStatus(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none"
                  >
                    {['In Progress', 'Open', 'Escalated', 'Resolved'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Pre-populated Note Description & Intel Log</label>
                <textarea
                  required
                  rows={7}
                  value={noteDescription}
                  onChange={(e) => setNoteDescription(e.target.value)}
                  className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTurnToNoteModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingNote}
                  className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center space-x-1.5"
                >
                  <FileText className="w-4 h-4" />
                  <span>{submittingNote ? 'Creating Site Note...' : 'Create & Save Operational Site Note'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel max-w-xl w-full p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
                Import WhatsApp Operational Chat Log
              </h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">WhatsApp Group / Channel Name</label>
                <input
                  type="text"
                  value={senderGroup}
                  onChange={(e) => setSenderGroup(e.target.value)}
                  className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Paste Raw WhatsApp Chat Messages</label>
                <textarea
                  required
                  rows={8}
                  placeholder={`Example:\n[08:45 AM] FSE Engr Ibrahim: FC2700 down due to DG battery failure. Arrived 08:40 AM. ETA restoration 09:15 AM.\n[09:10 AM] Engr Musa: FC2437 microwave link flapping. RTO team en route.`}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importing}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg flex items-center space-x-1"
                >
                  <span>{importing ? 'Extracting & Parsing...' : 'Parse & Import Chat'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
