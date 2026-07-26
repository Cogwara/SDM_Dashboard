import React, { useState, useEffect } from 'react';
import { FileText, Plus, Search, Filter, Clock, Tag, AlertTriangle, CheckCircle, User, Radio, Lock, Edit3, Download, CheckCircle2, Camera, Upload, X, Maximize2, Calendar, Trash2 } from 'lucide-react';
import { fetchNotes, createNote, updateNote, resolveNote, deleteNote, exportNotesExcel } from '../api';

export default function NotesCenter({ onSelectSite, currentUser }) {
  const isSuperuser = currentUser?.is_superuser;
  const userSdmName = currentUser?.full_name || '';

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  
  // Date Filtering State
  const [dateFilter, setDateFilter] = useState('All'); // 'All', 'yesterday', 'today', '7days', '30days', 'custom'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Incident Occurrence Timestamp State
  const toLocalISOString = (d) => {
    if (!d) return '';
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return '';
    const tzOffset = dateObj.getTimezoneOffset() * 60000;
    return new Date(dateObj.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const [incidentTime, setIncidentTime] = useState(() => toLocalISOString(new Date()));

  // Modal State (Create & Edit)
  const [showModal, setShowModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [siteIdInput, setSiteIdInput] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [appendUpdate, setAppendUpdate] = useState('');
  const [category, setCategory] = useState('General');
  const [priority, setPriority] = useState('Medium');
  const [status, setStatus] = useState('Open');
  const [createdBy, setCreatedBy] = useState(userSdmName || 'State Delivery Manager');
  const [submitting, setSubmitting] = useState(false);

  // Photo Upload & Lightbox State
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [lightboxImage, setLightboxImage] = useState(null);

  useEffect(() => {
    if (userSdmName && !editingNote) {
      setCreatedBy(userSdmName);
    }
  }, [userSdmName, editingNote]);

  const categories = [
    'All', 'Power', 'Transmission', 'Generator', 'Battery', 'Fuel', 
    'Microwave', 'RAN', 'Fiber', 'Security', 'SA Alarms', 'Customer', 
    'Preventive Maintenance', 'Corrective Maintenance', 'General'
  ];

  const loadNotes = async () => {
    setLoading(true);
    try {
      const sdmParam = !isSuperuser ? userSdmName : undefined;
      const data = await fetchNotes({
        sdm: sdmParam,
        search,
        category: categoryFilter !== 'All' ? categoryFilter : undefined,
        priority: priorityFilter !== 'All' ? priorityFilter : undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
        date_filter: dateFilter !== 'All' ? dateFilter : undefined,
        start_date: dateFilter === 'custom' && startDate ? startDate : undefined,
        end_date: dateFilter === 'custom' && endDate ? endDate : undefined,
        page_size: 100
      });
      setNotes(data.results || data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, [search, categoryFilter, priorityFilter, statusFilter, dateFilter, startDate, endDate, userSdmName, isSuperuser]);

  const isCreatorOfNote = (note) => {
    if (isSuperuser) return true;
    if (!userSdmName || !note.created_by) return true;
    const cleanUser = userSdmName.trim().toLowerCase();
    const cleanCreator = note.created_by.trim().toLowerCase();
    return cleanUser === cleanCreator || cleanCreator.includes(cleanUser) || cleanUser.includes(cleanCreator) || cleanCreator === 'state delivery manager';
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setSelectedPhotos((prev) => [...prev, ...files]);

    const newPreviews = files.map((file) => URL.createObjectURL(file));
    setPhotoPreviews((prev) => [...prev, ...newPreviews]);
  };

  const handleRemoveSelectedPhoto = (index) => {
    setSelectedPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleOpenCreateModal = () => {
    setEditingNote(null);
    setSiteIdInput('');
    setTitle('');
    setDescription('');
    setAppendUpdate('');
    setCategory('General');
    setPriority('Medium');
    setStatus('Open');
    setCreatedBy(userSdmName || 'State Delivery Manager');
    setIncidentTime(toLocalISOString(new Date()));
    setSelectedPhotos([]);
    setPhotoPreviews([]);
    setShowModal(true);
  };

  const handleOpenEditModal = (note) => {
    setEditingNote(note);
    setSiteIdInput(note.site_ihs_id || '');
    setTitle(note.title || '');
    setDescription(note.description || '');
    setAppendUpdate('');
    setCategory(note.category || 'General');
    setPriority(note.priority || 'Medium');
    setStatus(note.status || 'Open');
    setCreatedBy(note.created_by || userSdmName || 'State Delivery Manager');
    setIncidentTime(note.created_at ? toLocalISOString(note.created_at) : toLocalISOString(new Date()));
    setSelectedPhotos([]);
    setPhotoPreviews([]);
    setShowModal(true);
  };

  const handleQuickResolve = async (note) => {
    if (note.status === 'Resolved') return;
    try {
      await resolveNote(note.id, {
        updated_by: userSdmName,
        sdm: userSdmName,
        is_superuser: isSuperuser
      });
      loadNotes();
    } catch (err) {
      alert('Error resolving note: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteNote = async (note) => {
    if (!window.confirm(`Are you sure you want to delete note "${note.title}" for site ${note.site_ihs_id}?`)) return;
    try {
      await deleteNote(note.id, {
        user: userSdmName,
        sdm: userSdmName,
        is_superuser: isSuperuser
      });
      loadNotes();
    } catch (err) {
      alert('Error deleting note: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleExportExcel = async (overrideDateFilter) => {
    setExporting(true);
    try {
      const activeDateFilter = typeof overrideDateFilter === 'string' ? overrideDateFilter : dateFilter;
      const sdmParam = !isSuperuser ? userSdmName : undefined;
      await exportNotesExcel({
        sdm: sdmParam,
        search: search || undefined,
        category: categoryFilter !== 'All' ? categoryFilter : undefined,
        priority: priorityFilter !== 'All' ? priorityFilter : undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
        date_filter: activeDateFilter !== 'All' ? activeDateFilter : undefined,
        start_date: activeDateFilter === 'custom' && startDate ? startDate : undefined,
        end_date: activeDateFilter === 'custom' && endDate ? endDate : undefined,
      });
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export notes to Excel: ' + (err.message || 'Error occurred'));
    } finally {
      setExporting(false);
    }
  };

  const handleSaveNote = async (e) => {
    e.preventDefault();
    if (!siteIdInput.trim() || !title.trim() || (!description.trim() && !appendUpdate.trim())) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('site_id_input', siteIdInput.trim().toUpperCase());
      formData.append('title', title);
      formData.append('description', description);
      if (appendUpdate.trim()) {
        formData.append('append_update', appendUpdate.trim());
      }
      formData.append('category', category);
      formData.append('priority', priority);
      formData.append('status', status);
      if (incidentTime) {
        formData.append('created_at', incidentTime);
      }

      selectedPhotos.forEach((file) => {
        formData.append('photos', file);
      });

      if (editingNote) {
        formData.append('updated_by', userSdmName);
        formData.append('sdm', userSdmName);
        formData.append('is_superuser', isSuperuser ? 'true' : 'false');
        await updateNote(editingNote.id, formData);
      } else {
        formData.append('created_by', createdBy || userSdmName);
        await createNote(formData);
      }

      setShowModal(false);
      setEditingNote(null);
      setSiteIdInput('');
      setTitle('');
      setDescription('');
      setAppendUpdate('');
      setSelectedPhotos([]);
      setPhotoPreviews([]);
      loadNotes();
    } catch (err) {
      alert((editingNote ? 'Error updating note: ' : 'Error creating note: ') + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            SDM Operational Notes & Incident Records
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {!isSuperuser ? (
              <span className="text-cyan-300 font-semibold flex items-center gap-1 mt-0.5">
                <Lock className="w-3 h-3 text-cyan-400" /> Scoped to SDM Portfolio: <b>{userSdmName}</b> ({notes.length} Portfolio Notes Logged)
              </span>
            ) : (
              'Super Administrator Access &bull; Full Operational Memory Log Across All State Delivery Managers'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Export Yesterday's Notes Shortcut */}
          <button
            onClick={() => {
              setDateFilter('yesterday');
              handleExportExcel('yesterday');
            }}
            disabled={exporting}
            className="px-3.5 py-2.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 font-bold text-xs rounded-xl border border-emerald-500/50 shadow-lg flex items-center space-x-1.5 transition-all disabled:opacity-50"
            title="Instantly download yesterday's SDM operational notes to Excel"
          >
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span>Export Yesterday's Notes</span>
          </button>

          <button
            onClick={() => handleExportExcel()}
            disabled={exporting}
            className="px-4 py-2.5 bg-slate-900 hover:bg-emerald-950/60 text-emerald-400 hover:text-emerald-300 font-bold text-xs rounded-xl border border-emerald-500/40 shadow-lg flex items-center space-x-2 transition-all disabled:opacity-50"
            title="Download notes matching current filters as Microsoft Excel (.xlsx) file"
          >
            <Download className={`w-4 h-4 text-emerald-400 ${exporting ? 'animate-bounce' : ''}`} />
            <span>{exporting ? 'Exporting Excel...' : 'Export Filtered Excel'}</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center space-x-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Record New SDM Operational Note</span>
          </button>
        </div>
      </div>


      {/* Search & Filters Bar */}
      <div className="glass-panel p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 border border-slate-800">
        
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search notes by Site ID, title, description, or author..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900/80 text-xs text-white placeholder-slate-500 pl-9 pr-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Date Filter Dropdown */}
        <div className="flex items-center space-x-1.5 text-xs">
          <span className="text-slate-400 flex items-center gap-1 font-semibold">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" /> Date:
          </span>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500 font-bold"
          >
            <option value="All">All Time</option>
            <option value="yesterday">📅 Yesterday</option>
            <option value="today">☀️ Today</option>
            <option value="7days">🗓️ Last 7 Days</option>
            <option value="30days">📆 Last 30 Days</option>
            <option value="custom">🛠️ Custom Range</option>
          </select>
        </div>

        {dateFilter === 'custom' && (
          <div className="flex items-center space-x-1.5 text-xs bg-slate-900/90 p-1 rounded-lg border border-slate-700">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-950 text-white text-xs px-2 py-1 rounded border border-slate-800 focus:outline-none"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-950 text-white text-xs px-2 py-1 rounded border border-slate-800 focus:outline-none"
            />
          </div>
        )}

        {/* Category Filter */}
        <div className="flex items-center space-x-1 text-xs">
          <span className="text-slate-400">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-900 text-white text-xs px-2 py-1.5 rounded-lg border border-slate-700 focus:outline-none"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Priority Filter */}
        <div className="flex items-center space-x-1 text-xs">
          <span className="text-slate-400">Priority:</span>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-slate-900 text-white text-xs px-2 py-1.5 rounded-lg border border-slate-700 focus:outline-none"
          >
            <option value="All">All Priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center space-x-1 text-xs">
          <span className="text-slate-400">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 text-white text-xs px-2 py-1.5 rounded-lg border border-slate-700 focus:outline-none"
          >
            <option value="All">All Statuses</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Escalated">Escalated</option>
          </select>
        </div>

      </div>

      {/* SDM Notes List */}
      <div className="space-y-4">
        {loading ? (
          <div className="glass-panel p-12 text-center text-slate-400 text-xs border border-slate-800">
            <Radio className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-2" />
            Fetching SDM operational notes for your portfolio...
          </div>
        ) : notes.length > 0 ? (
          notes.map((note) => {
            const dt = new Date(note.created_at);
            const dateStr = dt.toLocaleDateString();
            const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const canEdit = isCreatorOfNote(note);
            const isResolved = note.status === 'Resolved';
            const photos = note.attachments || [];

            return (
              <div
                key={note.id}
                className="glass-card p-5 rounded-2xl border border-slate-800 hover:border-cyan-500/40 transition-all space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => onSelectSite(note.site_ihs_id)}
                      className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-mono font-extrabold text-sm rounded-lg border border-cyan-500/40 transition-all"
                    >
                      {note.site_ihs_id}
                    </button>
                    <h3 className="font-bold text-base text-white">{note.title}</h3>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-0.5 text-xs font-semibold bg-slate-800 text-cyan-300 rounded-md border border-slate-700">
                      {note.category}
                    </span>
                    <span className={`px-2.5 py-0.5 text-xs font-bold rounded-md ${
                      note.priority === 'Critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      note.priority === 'High' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                      'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}>
                      Priority: {note.priority}
                    </span>
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-md ${
                      isResolved ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}>
                      Status: {note.status}
                    </span>

                    {/* Quick Resolve Button for Open/In Progress Notes */}
                    {canEdit && !isResolved && (
                      <button
                        onClick={() => handleQuickResolve(note)}
                        className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-extrabold text-xs rounded-lg border border-emerald-500/40 transition-all flex items-center gap-1.5 shadow-sm"
                        title="Instantly mark issue as Resolved & close note"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Quick Resolve</span>
                      </button>
                    )}

                    {/* Edit & Delete Note Action Buttons */}
                    {canEdit ? (
                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => handleOpenEditModal(note)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 font-semibold text-xs rounded-lg border border-slate-700 hover:border-cyan-500/40 transition-all flex items-center gap-1.5"
                          title="Update your SDM Operational Note"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note)}
                          className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-semibold text-xs rounded-lg border border-rose-500/30 transition-all flex items-center gap-1.5"
                          title={isSuperuser ? "Delete Note (Superuser)" : "Delete your note"}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          <span>Delete</span>
                        </button>
                      </div>
                    ) : (
                      <span className="px-2 py-1 bg-slate-900/60 text-slate-500 text-[11px] rounded-lg border border-slate-800 flex items-center gap-1 cursor-not-allowed" title={`Only creator (${note.created_by}) can edit or delete this note`}>
                        <Lock className="w-3 h-3 text-slate-600" /> Read Only
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line">{note.description}</p>

                {/* Attached Photos Gallery */}
                {photos.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80">
                    <div className="text-[11px] font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Attached Field Photos & Inspection Evidence ({photos.length}):</span>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {photos.map((att) => (
                        <div
                          key={att.id}
                          className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-900 cursor-pointer shadow-lg hover:border-cyan-400 transition-all"
                          onClick={() => setLightboxImage(att.file)}
                          title={`Click to view ${att.file_name}`}
                        >
                          <img
                            src={att.file}
                            alt={att.file_name}
                            className="w-20 h-20 object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Maximize2 className="w-4 h-4 text-white drop-shadow-md" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                  <div className="flex items-center space-x-4">
                    <span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-cyan-400" /> Logged By: <b className="text-slate-200">{note.created_by}</b></span>
                    {note.site_cluster && <span>Cluster: <b className="text-slate-300">{note.site_cluster}</b></span>}
                  </div>
                  <div className="flex items-center space-x-3 text-slate-400">
                    <span>📅 Created Date: <b>{dateStr}</b></span>
                    <span>⏰ Created Time: <b>{timeStr}</b></span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="glass-panel p-12 text-center text-slate-500 text-xs border border-slate-800">
            No SDM notes found matching search filters for your portfolio. Click "Record New SDM Operational Note" to create a note.
          </div>
        )}
      </div>

      {/* Modal: Write / Edit SDM Note */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="glass-panel max-w-xl w-full p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {editingNote ? <Edit3 className="w-5 h-5 text-cyan-400" /> : <FileText className="w-5 h-5 text-cyan-400" />}
                {editingNote ? `Update SDM Operational Note (#${editingNote.id})` : 'Record New SDM Operational Note'}
              </h3>
              <button onClick={() => { setShowModal(false); setEditingNote(null); }} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveNote} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Site ID (IHS / MTN Code)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. FC2700"
                    value={siteIdInput}
                    onChange={(e) => setSiteIdInput(e.target.value.toUpperCase())}
                    className="w-full bg-slate-900 text-white font-mono p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none"
                  >
                    {categories.filter(c => c !== 'All').map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Note Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Commercial Power Outage & Generator Crank Failure"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-cyan-400" /> Incident / Occurrence Date & Time *</span>
                  <span className="text-[10px] text-cyan-300 font-normal">Set exact date & time when event occurred</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={incidentTime}
                  onChange={(e) => setIncidentTime(e.target.value)}
                  className="w-full bg-slate-900 text-white font-mono p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none"
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Escalated">Escalated</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Created By</label>
                  <input
                    type="text"
                    readOnly={!!editingNote}
                    value={createdBy}
                    onChange={(e) => !editingNote && setCreatedBy(e.target.value)}
                    className={`w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none ${editingNote ? 'opacity-60 cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>

              {/* Progress Update Entry / New Data Field */}
              {editingNote && (
                <div className="p-3 bg-cyan-950/40 rounded-xl border border-cyan-500/30 space-y-1">
                  <label className="block text-cyan-300 font-semibold flex items-center justify-between">
                    <span>➕ Append New Progress Update / Field Data</span>
                    <span className="text-[10px] text-cyan-400 font-normal">Appends timestamped entry to RCA history</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. FSE visited site at 18:45; swapped battery bank, power restored..."
                    value={appendUpdate}
                    onChange={(e) => setAppendUpdate(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-400 text-xs"
                  />
                </div>
              )}

              {/* Photo Upload Section */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-slate-300 font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-cyan-400" /> Upload Site Field Photos / Inspection Evidence
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Multiple images supported</span>
                </label>

                <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-xl p-3 text-center bg-slate-900/60 transition-all">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    id="photo-upload-input"
                  />
                  <label htmlFor="photo-upload-input" className="cursor-pointer flex flex-col items-center justify-center space-y-1">
                    <Upload className="w-6 h-6 text-cyan-400" />
                    <span className="text-xs text-slate-200 font-semibold">Click to select site inspection photos</span>
                    <span className="text-[10px] text-slate-400">Upload pictures of fuel levels, batteries, DG, site damage, etc.</span>
                  </label>
                </div>

                {/* Selected Photo Previews */}
                {photoPreviews.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[11px] font-semibold text-cyan-300">Selected New Photos ({photoPreviews.length}):</span>
                    <div className="flex flex-wrap gap-2">
                      {photoPreviews.map((src, index) => (
                        <div key={index} className="relative group rounded-lg overflow-hidden border border-cyan-500/50 bg-slate-900 shadow-md">
                          <img src={src} alt="Preview" className="w-14 h-14 object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemoveSelectedPhoto(index)}
                            className="absolute top-0.5 right-0.5 bg-red-600/90 text-white rounded-full p-0.5 hover:bg-red-500 text-[10px]"
                            title="Remove photo"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Existing Note Photos */}
                {editingNote && editingNote.attachments && editingNote.attachments.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[11px] font-semibold text-slate-400">Previously Attached Photos ({editingNote.attachments.length}):</span>
                    <div className="flex flex-wrap gap-2">
                      {editingNote.attachments.map((att) => (
                        <img key={att.id} src={att.file} alt={att.file_name} className="w-12 h-12 object-cover rounded-lg border border-slate-700" title={att.file_name} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description / Operational Context History</label>
                <textarea
                  required={!appendUpdate.trim()}
                  rows={4}
                  placeholder="Record full operational history, root cause findings, engineer visits, and resolution steps..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditingNote(null); }}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg flex items-center space-x-1"
                >
                  <span>{submitting ? 'Saving...' : editingNote ? 'Update SDM Note' : 'Save SDM Note'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal for High-Res Image Preview */}
      {lightboxImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4" onClick={() => setLightboxImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] p-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-3 -right-3 bg-slate-900 text-white p-2 rounded-full border border-slate-700 hover:bg-red-600 transition-all shadow-xl"
              title="Close image viewer"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={lightboxImage} alt="Site Inspection Evidence" className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain border border-slate-700" />
          </div>
        </div>
      )}

    </div>
  );
}

