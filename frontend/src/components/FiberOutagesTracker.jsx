import React, { useState, useEffect } from 'react';
import { 
  Network, Search, Plus, FileSpreadsheet, MapPin, RefreshCw, X, 
  AlertTriangle, CheckCircle2, Clock, ShieldAlert, Edit2, Trash2,
  ExternalLink, Filter, Phone, UserCheck, ArrowRight, Activity, Cpu, Layers, Check, Eye, Calendar
} from 'lucide-react';
import { 
  fetchFiberOutageNotes, fetchFiberOutageStats, createFiberOutageNote, 
  updateFiberOutageNote, deleteFiberOutageNote,
  fetchIHSFiberLinks, fetchHuaweiFiberLinks, fetchTNLLinks
} from '../api';

export default function FiberOutagesTracker({ currentUser, onSelectSite }) {
  const sdmName = currentUser?.full_name || currentUser?.username || 'State Delivery Manager';

  const [notes, setNotes] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedPriority, setSelectedPriority] = useState('All');
  const [selectedState, setSelectedState] = useState('All');
  const [selectedDay, setSelectedDay] = useState('All');
  const [customDate, setCustomDate] = useState('');

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [selectedDetailNote, setSelectedDetailNote] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    ticket_number: '',
    site_id: '',
    site_a: '',
    site_b: '',
    fiber_route: '',
    provider: 'Huawei',
    title: '',
    description: '',
    location: '',
    state: 'FCT',
    priority: 'High',
    status: 'Open',
    reported_by: sdmName,
    contact_number: '',
    eta_time: '',
    distance_km: 0.0
  });

  // Fiber Link Auto-Complete Suggestions State
  const [linkQuery, setLinkQuery] = useState('');
  const [linkSuggestions, setLinkSuggestions] = useState([]);
  const [searchingLinks, setSearchingLinks] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {
        search: search.trim() || undefined,
        provider: selectedProvider !== 'All' ? selectedProvider : undefined,
        status: selectedStatus !== 'All' ? selectedStatus : undefined,
        priority: selectedPriority !== 'All' ? selectedPriority : undefined,
        state: selectedState !== 'All' ? selectedState : undefined,
        day: selectedDay !== 'All' && selectedDay !== 'custom' ? selectedDay : undefined,
        date: customDate ? customDate : undefined,
      };
      const [listData, statsData] = await Promise.all([
        fetchFiberOutageNotes(params),
        fetchFiberOutageStats(params)
      ]);
      setNotes(Array.isArray(listData) ? listData : listData.results || []);
      setTotalCount(listData.count || (Array.isArray(listData) ? listData.length : 0));
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load fiber outage notes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedProvider, selectedStatus, selectedPriority, selectedState, selectedDay, customDate]);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  // Search links from DB as user types for auto-fill
  useEffect(() => {
    if (!linkQuery || linkQuery.trim().length < 2) {
      setLinkSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingLinks(true);
      try {
        const q = linkQuery.trim();
        const [ihsRes, hwRes, tnlRes] = await Promise.all([
          fetchIHSFiberLinks({ search: q, page_size: 4 }),
          fetchHuaweiFiberLinks({ search: q, page_size: 4 }),
          fetchTNLLinks({ search: q, page_size: 4 })
        ]);

        const combined = [];
        (ihsRes?.results || (Array.isArray(ihsRes) ? ihsRes : [])).forEach((l) => {
          combined.push({
            route: l.segment_id,
            site_a: l.site_a,
            site_b: l.site_b,
            distance_km: l.distance_km,
            state: l.state || 'FCT',
            provider: 'IHS'
          });
        });

        (hwRes?.results || (Array.isArray(hwRes) ? hwRes : [])).forEach((l) => {
          combined.push({
            route: l.segment_name,
            site_a: l.site_a,
            site_b: l.site_b,
            distance_km: l.distance_km,
            state: l.state || 'FCT',
            provider: l.maintenance_fmp || 'Huawei'
          });
        });

        (tnlRes?.results || (Array.isArray(tnlRes) ? tnlRes : [])).forEach((l) => {
          combined.push({
            route: l.segment_name,
            site_a: l.site_a,
            site_b: l.site_b,
            distance_km: l.distance_km,
            state: l.state || 'FCT',
            provider: l.maintenance_fmp || 'TNL'
          });
        });

        setLinkSuggestions(combined.slice(0, 6));
      } catch (err) {
        console.error('Failed to suggest links:', err);
      } finally {
        setSearchingLinks(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [linkQuery]);

  const selectLinkSuggestion = (s) => {
    setFormData((prev) => ({
      ...prev,
      fiber_route: s.route,
      site_a: s.site_a || prev.site_a,
      site_b: s.site_b || prev.site_b,
      site_id: prev.site_id || s.site_a || s.site_b || '',
      distance_km: s.distance_km || prev.distance_km,
      state: s.state || prev.state,
      provider: s.provider || prev.provider
    }));
    setLinkQuery('');
    setLinkSuggestions([]);
    showToast(`Auto-filled route: ${s.route}`);
  };

  const handleOpenCreate = () => {
    setEditingNote(null);
    setFormData({
      ticket_number: '',
      site_id: '',
      site_a: '',
      site_b: '',
      fiber_route: '',
      provider: 'Huawei',
      title: '',
      description: '',
      location: '',
      state: 'FCT',
      priority: 'High',
      status: 'Open',
      reported_by: sdmName,
      contact_number: '',
      eta_time: '',
      distance_km: 0.0
    });
    setLinkQuery('');
    setShowCreateModal(true);
  };

  const handleOpenEdit = (note) => {
    setEditingNote(note);
    setFormData({
      ticket_number: note.ticket_number || '',
      site_id: note.site_id || '',
      site_a: note.site_a || '',
      site_b: note.site_b || '',
      fiber_route: note.fiber_route || '',
      provider: note.provider || 'Huawei',
      title: note.title || '',
      description: note.description || '',
      location: note.location || '',
      state: note.state || 'FCT',
      priority: note.priority || 'High',
      status: note.status || 'Open',
      reported_by: note.reported_by || sdmName,
      contact_number: note.contact_number || '',
      eta_time: note.eta_time || '',
      distance_km: note.distance_km || 0.0
    });
    setShowCreateModal(true);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.description.trim()) {
      showToast('Please enter both Title and Outage Description.');
      return;
    }
    try {
      if (editingNote) {
        await updateFiberOutageNote(editingNote.id, formData);
        showToast(`Updated Fiber Outage ticket #${editingNote.ticket_number}`);
      } else {
        const created = await createFiberOutageNote(formData);
        showToast(`Created Fiber Outage #${created.ticket_number || 'FIB-001'} & automatically generated SDM Field Note!`);
      }
      setShowCreateModal(false);
      loadData();
    } catch (err) {
      console.error('Failed to save fiber outage note:', err);
      showToast('Error saving note. Please try again.');
    }
  };

  const handleMarkResolved = async (note) => {
    try {
      await updateFiberOutageNote(note.id, { status: 'Resolved' });
      showToast(`Marked Outage Ticket #${note.ticket_number} as RESTORED`);
      loadData();
    } catch (err) {
      console.error('Failed to resolve note:', err);
    }
  };

  const handleDeleteNote = async (id, ticketNo) => {
    if (!window.confirm(`Delete Fiber Outage record #${ticketNo}?`)) return;
    try {
      await deleteFiberOutageNote(id);
      showToast(`Deleted Outage record #${ticketNo}`);
      loadData();
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  // Export Outages to Excel (.xls)
  const handleExportToExcel = () => {
    if (!notes || notes.length === 0) {
      showToast('No outage notes to export.');
      return;
    }
    const exportFileName = `Fiber_Outage_Notes_${new Date().toISOString().split('T')[0]}.xls`;

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 11pt; }
          th { background-color: #0f172a; color: #ffffff; font-weight: bold; text-align: left; padding: 10px; border: 1px solid #334155; }
          td { padding: 8px; border: 1px solid #e2e8f0; vertical-align: middle; }
          tr:nth-child(even) { background-color: #f8fafc; }
        </style>
      </head>
      <body>
        <h2>Fiber Outages & Field RCA Log Report</h2>
        <p>Export Date: ${new Date().toLocaleString()} | Total Records: ${notes.length}</p>
        <table>
          <thead>
            <tr>
              <th>Ticket #</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Provider</th>
              <th>Fiber Route</th>
              <th>Site ID</th>
              <th>Site A</th>
              <th>Site B</th>
              <th>Location</th>
              <th>State</th>
              <th>Title</th>
              <th>Outage RCA Description</th>
              <th>Reported By</th>
              <th>Contact #</th>
              <th>ETA</th>
              <th>Logged Date</th>
            </tr>
          </thead>
          <tbody>
            ${notes.map((n) => `
              <tr>
                <td><b>${n.ticket_number}</b></td>
                <td>${n.status}</td>
                <td>${n.priority}</td>
                <td>${n.provider}</td>
                <td>${n.fiber_route || ''}</td>
                <td>${n.site_id || ''}</td>
                <td>${n.site_a || ''}</td>
                <td>${n.site_b || ''}</td>
                <td>${n.location || ''}</td>
                <td>${n.state || ''}</td>
                <td>${n.title || ''}</td>
                <td>${n.description || ''}</td>
                <td>${n.reported_by || ''}</td>
                <td>${n.contact_number || ''}</td>
                <td>${n.eta_time || ''}</td>
                <td>${n.created_at ? new Date(n.created_at).toLocaleString() : ''}</td>
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

    showToast(`Exported ${notes.length} outage record(s) to Excel!`);
  };

  const providersList = ['All', 'Huawei', 'IHS', 'TNL', 'CPNL', 'MainOne', 'Glo', 'MTN', 'Airtel', 'Other'];
  const statesList = ['All', 'FCT', 'LAGOS', 'RIVERS', 'EDO', 'AKWA IBOM', 'KADUNA', 'DELTA', 'CROSS RIVER', 'KATSINA', 'OYO', 'ENUGU', 'ANAMBRA', 'KANOS'];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white font-bold text-xs px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-emerald-400 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Banner & Action Header */}
      <div className="glass-panel p-6 rounded-2xl border border-red-500/30 bg-gradient-to-r from-slate-900 via-slate-900 to-red-950/40 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden shadow-2xl">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-red-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div>
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-400 rounded-2xl">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
                Fiber Outage & Field RCA Log Tracker
                <span className="inline-block w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Log, track, and search fiber cuts, route interruptions, and field restoration notes across all providers (Huawei, IHS, TNL, etc.).
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportToExcel}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center space-x-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center space-x-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>+ Log New Fiber Outage</span>
          </button>
        </div>
      </div>

      {/* Analytics Summary Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 font-semibold">Total Logged Outages</div>
            <div className="text-2xl font-black text-white font-mono mt-1">{stats?.total_outages || totalCount}</div>
          </div>
          <div className="p-2.5 bg-slate-800 text-cyan-400 rounded-xl">
            <Network className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-red-500/30 bg-red-950/20 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-red-300 font-semibold">Active Cuts (Open)</div>
            <div className="text-2xl font-black text-red-400 font-mono mt-1">{stats?.active_outages || 0}</div>
          </div>
          <div className="p-2.5 bg-red-500/20 text-red-400 rounded-xl border border-red-500/30">
            <AlertTriangle className="w-5 h-5 animate-bounce" />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-amber-300 font-semibold">Under Resolution</div>
            <div className="text-2xl font-black text-amber-400 font-mono mt-1">{stats?.in_progress_outages || 0}</div>
          </div>
          <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-emerald-300 font-semibold">Restored Outages</div>
            <div className="text-2xl font-black text-emerald-400 font-mono mt-1">{stats?.restored_outages || 0}</div>
          </div>
          <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Multi-Field Search & Filter Controls Bar */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Main Comprehensive Search Box */}
          <div className="flex-1 relative">
            <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs">
              <Search className="w-4 h-4 text-red-400 mr-2.5 shrink-0" />
              <input
                type="text"
                placeholder="Search by Site ID, Fiber Route / Segment, Provider, Title, Location, Name, or Ticket #..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-white placeholder-slate-400 focus:outline-none w-full text-xs"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            
            {/* Provider Filter */}
            <div className="flex items-center space-x-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
              <span className="text-slate-400 font-semibold">Provider:</span>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="bg-transparent text-cyan-300 font-bold focus:outline-none cursor-pointer"
              >
                {providersList.map((p) => (
                  <option key={p} value={p} className="bg-slate-900 text-white">{p}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center space-x-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
              <span className="text-slate-400 font-semibold">Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent text-amber-300 font-bold focus:outline-none cursor-pointer"
              >
                <option value="All" className="bg-slate-900 text-white">All Statuses</option>
                <option value="Open" className="bg-slate-900 text-white">Open (Active Cut)</option>
                <option value="In Progress" className="bg-slate-900 text-white">In Progress</option>
                <option value="Resolved" className="bg-slate-900 text-white">Resolved (Restored)</option>
              </select>
            </div>

            {/* Priority Filter */}
            <div className="flex items-center space-x-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
              <span className="text-slate-400 font-semibold">Priority:</span>
              <select
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
                className="bg-transparent text-red-300 font-bold focus:outline-none cursor-pointer"
              >
                <option value="All" className="bg-slate-900 text-white">All Priorities</option>
                <option value="Critical" className="bg-slate-900 text-white">Critical</option>
                <option value="High" className="bg-slate-900 text-white">High</option>
                <option value="Medium" className="bg-slate-900 text-white">Medium</option>
                <option value="Low" className="bg-slate-900 text-white">Low</option>
              </select>
            </div>

            {/* State Filter */}
            <div className="flex items-center space-x-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
              <span className="text-slate-400 font-semibold">State:</span>
              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="bg-transparent text-purple-300 font-bold focus:outline-none cursor-pointer"
              >
                {statesList.map((st) => (
                  <option key={st} value={st} className="bg-slate-900 text-white">{st}</option>
                ))}
              </select>
            </div>

            {/* Day / Date Filter */}
            <div className="flex items-center space-x-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400 font-semibold">Day:</span>
              <select
                value={selectedDay}
                onChange={(e) => {
                  setSelectedDay(e.target.value);
                  if (e.target.value !== 'custom') setCustomDate('');
                }}
                className="bg-transparent text-cyan-300 font-bold focus:outline-none cursor-pointer"
              >
                <option value="All" className="bg-slate-900 text-white">All Time</option>
                <option value="today" className="bg-slate-900 text-white">Today</option>
                <option value="yesterday" className="bg-slate-900 text-white">Yesterday</option>
                <option value="last_7_days" className="bg-slate-900 text-white">Last 7 Days</option>
                <option value="last_30_days" className="bg-slate-900 text-white">Last 30 Days</option>
                <option value="custom" className="bg-slate-900 text-white">Specific Date...</option>
              </select>

              {selectedDay === 'custom' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="bg-slate-950 text-xs text-cyan-300 p-1 rounded border border-slate-700 focus:outline-none font-mono"
                />
              )}
            </div>

            <button
              onClick={() => {
                setSearch('');
                setSelectedProvider('All');
                setSelectedStatus('All');
                setSelectedPriority('All');
                setSelectedState('All');
                setSelectedDay('All');
                setCustomDate('');
              }}
              className="px-2.5 py-1 text-slate-400 hover:text-cyan-300 text-[11px] underline"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Outage Cards Feed Grid */}
      {loading ? (
        <div className="glass-panel p-12 text-center text-slate-400 font-medium rounded-2xl border border-slate-800">
          <RefreshCw className="w-6 h-6 text-red-400 animate-spin mx-auto mb-3" />
          <span>Loading fiber outage notes & field intelligence...</span>
        </div>
      ) : notes.length === 0 ? (
        <div className="glass-panel p-12 text-center text-slate-400 rounded-2xl border border-slate-800 space-y-3">
          <ShieldAlert className="w-10 h-10 text-slate-600 mx-auto" />
          <div className="text-sm font-bold text-slate-300">No Fiber Outages Found</div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            No active or historical fiber outage notes match your search filters. Click <b>"+ Log New Fiber Outage"</b> to report a fiber cut or route incident.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {notes.map((note) => (
            <div 
              key={note.id} 
              onClick={() => setSelectedDetailNote(note)}
              className={`glass-panel p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer group hover:scale-[1.01] ${
                note.status === 'Resolved' 
                  ? 'border-emerald-500/30 bg-slate-900/60 hover:border-emerald-500/60' 
                  : note.priority === 'Critical' 
                  ? 'border-red-500/50 bg-slate-900/90 shadow-xl shadow-red-950/20 hover:border-red-500/80' 
                  : 'border-slate-800 bg-slate-900/80 hover:border-cyan-500/50 hover:bg-slate-900'
              }`}
            >
              {/* Card Header: Ticket #, Status, Priority */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                    <span className="px-2 py-0.5 text-[11px] font-mono font-black bg-slate-800 text-cyan-300 rounded border border-slate-700">
                      #{note.ticket_number}
                    </span>
                    <span className={`px-2 py-0.5 text-[9px] font-extrabold rounded-full border ${
                      note.status === 'Resolved'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : note.status === 'In Progress'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                    }`}>
                      {note.status === 'Resolved' ? 'RESTORED' : note.status === 'In Progress' ? 'IN PROGRESS' : 'ACTIVE CUT'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <span className={`px-1.5 py-0.5 text-[9px] font-extrabold rounded border ${
                      note.priority === 'Critical' ? 'bg-red-500/20 text-red-400 border-red-500/40' :
                      note.priority === 'High' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                      'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {note.priority}
                    </span>

                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
                      {note.provider}
                    </span>
                  </div>
                </div>

                {/* Fiber Route & Sites */}
                <div className="mb-2">
                  <h3 className="text-xs font-extrabold text-white group-hover:text-cyan-300 transition-colors flex items-center gap-1.5 line-clamp-1">
                    <Network className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="truncate">{note.fiber_route || note.title}</span>
                  </h3>
                  
                  {(note.site_a || note.site_b || note.site_id) && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] text-slate-400">
                      {note.site_id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onSelectSite && onSelectSite(note.site_id); }}
                          className="font-mono text-cyan-300 font-bold hover:underline flex items-center gap-1 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/20"
                        >
                          <MapPin className="w-3 h-3 text-cyan-400" />
                          <span>{note.site_id}</span>
                        </button>
                      )}
                      {note.site_a && (
                        <span className="font-mono text-slate-300 text-[10px]">
                          A: <b>{note.site_a}</b>
                        </span>
                      )}
                      {note.site_b && (
                        <span className="font-mono text-slate-300 text-[10px]">
                          B: <b>{note.site_b}</b>
                        </span>
                      )}
                      {note.distance_km > 0 && (
                        <span className="font-mono text-amber-300 font-bold text-[10px]">
                          ({note.distance_km} km)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Location & Title */}
                <div className="text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{note.location || note.state}</span>
                </div>

                {/* Description RCA snippet */}
                <p className="text-[11px] text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 leading-snug line-clamp-3 mt-1.5">
                  {note.description}
                </p>
              </div>

              {/* Card Footer: Metadata & Action Buttons */}
              <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
                <div className="text-[10px] text-slate-400 truncate">
                  <div className="truncate">By: <b className="text-slate-200">{note.reported_by}</b></div>
                  <div className="text-slate-500">{new Date(note.created_at).toLocaleDateString()}</div>
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedDetailNote(note); }}
                    className="p-1 bg-cyan-950/60 hover:bg-cyan-600 text-cyan-300 hover:text-white rounded-md border border-cyan-500/30 transition-all"
                    title="View Full Outage Details & RCA"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>

                  {note.status !== 'Resolved' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMarkResolved(note); }}
                      className="px-2 py-1 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-md transition-all flex items-center gap-0.5 shadow-sm"
                      title="Mark Restored"
                    >
                      <Check className="w-3 h-3" />
                      <span className="hidden sm:inline">Restored</span>
                    </button>
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation(); handleOpenEdit(note); }}
                    className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md border border-slate-700 transition-all"
                    title="Edit Outage Note"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id, note.ticket_number); }}
                    className="p-1 bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white rounded-md border border-slate-700 transition-all"
                    title="Delete Note"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* 📝 LOG / EDIT FIBER OUTAGE NOTE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-red-500/40 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative my-8 animate-in fade-in zoom-in duration-200">
            
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 border border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
              <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-400 rounded-2xl">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">
                  {editingNote ? `Edit Outage Note #${editingNote.ticket_number}` : 'Log New Fiber Outage & Field Incident'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Record fiber route break, cut location, provider details, and restoration progress.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4">
              
              {/* Route Search Auto-Complete Helper */}
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-2">
                <label className="text-xs font-bold text-cyan-300 flex items-center justify-between">
                  <span>⚡ Quick Fiber Link Auto-Fill</span>
                  <span className="text-[10px] text-slate-400 font-normal">Search 2,682 links from DB to auto-populate</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Type Route Name or Site ID (e.g. T0369, Borbit, Kuchingoro)..."
                    value={linkQuery}
                    onChange={(e) => setLinkQuery(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                  {searchingLinks && (
                    <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin absolute right-3 top-2.5" />
                  )}
                  {linkSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-cyan-500/40 rounded-xl shadow-2xl z-30 max-h-48 overflow-y-auto divide-y divide-slate-800">
                      {linkSuggestions.map((s, idx) => (
                        <div
                          key={idx}
                          onClick={() => selectLinkSuggestion(s)}
                          className="p-2.5 hover:bg-cyan-950/40 cursor-pointer text-xs flex items-center justify-between transition-all"
                        >
                          <div>
                            <div className="font-mono font-bold text-white">{s.route}</div>
                            <div className="text-[10px] text-slate-400">
                              Site A: {s.site_a || 'N/A'} &bull; Site B: {s.site_b || 'N/A'} &bull; State: {s.state}
                            </div>
                          </div>
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] rounded font-bold">
                            {s.provider}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Fiber Route Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Fiber Route / Segment Name</label>
                  <input
                    type="text"
                    placeholder="Example: T0369_Borbit_Ogo Oluwa"
                    value={formData.fiber_route}
                    onChange={(e) => setFormData({ ...formData, fiber_route: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>

                {/* Primary Site ID */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Affected Primary Site ID</label>
                  <input
                    type="text"
                    placeholder="Example: FC2700"
                    value={formData.site_id}
                    onChange={(e) => setFormData({ ...formData, site_id: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono uppercase"
                  />
                </div>

                {/* Site A */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Endpoint Site A</label>
                  <input
                    type="text"
                    placeholder="Site A ID"
                    value={formData.site_a}
                    onChange={(e) => setFormData({ ...formData, site_a: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono uppercase"
                  />
                </div>

                {/* Site B */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Endpoint Site B</label>
                  <input
                    type="text"
                    placeholder="Site B ID"
                    value={formData.site_b}
                    onChange={(e) => setFormData({ ...formData, site_b: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono uppercase"
                  />
                </div>

                {/* Provider */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Fiber Provider / FMP</label>
                  <select
                    value={formData.provider}
                    onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="Huawei">Huawei</option>
                    <option value="IHS">IHS</option>
                    <option value="TNL">TNL</option>
                    <option value="CPNL">CPNL</option>
                    <option value="MainOne">MainOne</option>
                    <option value="Glo">Glo</option>
                    <option value="MTN">MTN</option>
                    <option value="Airtel">Airtel</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Location / Landmark */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Location / Landmark Cut Point</label>
                  <input
                    type="text"
                    placeholder="Example: Kuchingoro Flyover, Airport Road"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                  />
                </div>

                {/* State */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">State</label>
                  <input
                    type="text"
                    placeholder="Example: FCT"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 uppercase"
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Priority / Severity</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="Critical">Critical (High Blast Radius)</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Outage Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="Open">Open (Active Fiber Cut)</option>
                    <option value="In Progress">In Progress (Splicing Ongoing)</option>
                    <option value="Resolved">Resolved (Restored)</option>
                  </select>
                </div>

                {/* ETA */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Estimated Restoration Time (ETA)</label>
                  <input
                    type="text"
                    placeholder="Example: 14:30 GMT or 2 hours"
                    value={formData.eta_time}
                    onChange={(e) => setFormData({ ...formData, eta_time: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                  />
                </div>

              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Outage Title / Headline *</label>
                <input
                  type="text"
                  placeholder="Example: Dual Fiber Cut on Kuchingoro Corridor"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Description / RCA */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Detailed Outage RCA & Field Notes *</label>
                <textarea
                  rows="4"
                  placeholder="Enter details: excavation damage, OTDR distance measurement, fiber team dispatched, joint enclosure location, splicing progress..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 leading-relaxed"
                ></textarea>
              </div>

              {/* Reporter Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Logged By</label>
                  <input
                    type="text"
                    value={formData.reported_by}
                    onChange={(e) => setFormData({ ...formData, reported_by: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Field Contact Phone Number</label>
                  <input
                    type="text"
                    placeholder="Example: 08012345678"
                    value={formData.contact_number}
                    onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>
              </div>

              {/* Form Buttons */}
              <div className="pt-3 flex justify-end space-x-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center space-x-1.5"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>{editingNote ? 'Update Outage Note' : 'Save Fiber Outage Ticket'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* 🔍 FIBER OUTAGE & FIELD RCA DETAIL MODAL */}
      {selectedDetailNote && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl max-w-3xl w-full p-6 space-y-6 shadow-2xl relative my-8 animate-in fade-in zoom-in duration-200 text-slate-100">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-400 rounded-2xl shrink-0">
                  <ShieldAlert className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <span className="px-2.5 py-0.5 text-xs font-mono font-black bg-slate-800 text-cyan-300 rounded border border-slate-700">
                      #{selectedDetailNote.ticket_number}
                    </span>
                    <span className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded-full border ${
                      selectedDetailNote.status === 'Resolved'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : selectedDetailNote.status === 'In Progress'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                    }`}>
                      {selectedDetailNote.status === 'Resolved' ? 'RESTORED' : selectedDetailNote.status === 'In Progress' ? 'IN PROGRESS' : 'ACTIVE CUT'}
                    </span>
                    <span className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded border ${
                      selectedDetailNote.priority === 'Critical' ? 'bg-red-500/20 text-red-400 border-red-500/40' :
                      selectedDetailNote.priority === 'High' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                      'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {selectedDetailNote.priority} Priority
                    </span>
                    <span className="px-2.5 py-0.5 text-[10px] font-bold bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
                      {selectedDetailNote.provider}
                    </span>
                  </div>
                  <h2 className="text-xl font-black text-white mt-1.5 flex items-center gap-2">
                    <Network className="w-5 h-5 text-cyan-400" />
                    <span>{selectedDetailNote.fiber_route || selectedDetailNote.title}</span>
                  </h2>
                </div>
              </div>

              <button
                onClick={() => setSelectedDetailNote(null)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 border border-slate-700 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid Information Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800/80">
                <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Site ID / Span</div>
                <div className="text-sm font-extrabold text-cyan-300 mt-1 font-mono flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-cyan-400" />
                  <span>{selectedDetailNote.site_id || 'N/A'}</span>
                </div>
                {(selectedDetailNote.site_a || selectedDetailNote.site_b) && (
                  <div className="text-xs text-slate-300 mt-1">
                    {selectedDetailNote.site_a} &rarr; {selectedDetailNote.site_b}
                  </div>
                )}
              </div>

              <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800/80">
                <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Location & State</div>
                <div className="text-sm font-bold text-slate-100 mt-1">
                  {selectedDetailNote.location || selectedDetailNote.state}
                </div>
                <div className="text-xs text-slate-400">State: <b className="text-purple-300">{selectedDetailNote.state}</b></div>
              </div>

              <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800/80">
                <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Impacted Span Distance</div>
                <div className="text-sm font-black text-amber-400 mt-1 font-mono">
                  {selectedDetailNote.distance_km > 0 ? `${selectedDetailNote.distance_km} KM` : 'Unspecified Length'}
                </div>
              </div>

              <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800/80">
                <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Reported By</div>
                <div className="text-sm font-bold text-slate-200 mt-1 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <span>{selectedDetailNote.reported_by}</span>
                </div>
                {selectedDetailNote.contact_number && (
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span>{selectedDetailNote.contact_number}</span>
                  </div>
                )}
              </div>

              <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800/80">
                <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Restoration ETA</div>
                <div className="text-sm font-bold text-amber-300 mt-1 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>{selectedDetailNote.eta_time || 'Pending Update'}</span>
                </div>
              </div>

              <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800/80">
                <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Logged Timestamp</div>
                <div className="text-xs font-medium text-slate-300 mt-1">
                  {new Date(selectedDetailNote.created_at).toLocaleString()}
                </div>
                {selectedDetailNote.resolved_at && (
                  <div className="text-xs text-emerald-400 font-bold mt-1">
                    Restored: {new Date(selectedDetailNote.resolved_at).toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            {/* Field Description / Root Cause Analysis (RCA) Box */}
            <div className="space-y-2">
              <div className="text-xs font-extrabold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-red-400" />
                <span>Detailed Field Description & Root Cause Analysis (RCA)</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                {selectedDetailNote.description}
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                {selectedDetailNote.status !== 'Resolved' && (
                  <button
                    onClick={() => {
                      handleMarkResolved(selectedDetailNote);
                      setSelectedDetailNote(null);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-950/30"
                  >
                    <Check className="w-4 h-4" />
                    <span>Mark Outage Restored</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    const n = selectedDetailNote;
                    setSelectedDetailNote(null);
                    handleOpenEdit(n);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
                >
                  <Edit2 className="w-4 h-4 text-cyan-400" />
                  <span>Edit Outage Note</span>
                </button>

                <button
                  onClick={() => {
                    const n = selectedDetailNote;
                    setSelectedDetailNote(null);
                    handleDeleteNote(n.id, n.ticket_number);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              </div>

              <button
                onClick={() => setSelectedDetailNote(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition-all"
              >
                Close Detail
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
