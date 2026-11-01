import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Radio, Zap, Shield, Phone, Mail, User, MapPin, Calendar, Clock, 
  FileText, MessageSquare, AlertTriangle, ChevronRight, CheckCircle2, 
  ExternalLink, Layers, Search, Database, Cpu, Wifi, Edit3, Camera, Upload, X, Maximize2, Trash2,
  Activity, BarChart3, RefreshCw, ArrowRight, Compass
} from 'lucide-react';
import { lookupSite, createNote, updateNote, resolveNote, deleteNote, fetchAvailabilityRecords, getMediaUrl } from '../api';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { getRegionalExecutive } from '../executiveDirectory';

export default function SiteProfile({ siteId, currentUser, onBack, onOpenAIWithPrompt, onNavigateTab, onNavigateToAvailability }) {
  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);

  const isSuperuser = currentUser?.is_superuser;
  const userSdmName = currentUser?.full_name || '';

  // Active Specs Tab
  const [activeSpecTab, setActiveSpecTab] = useState('radio');
  const [specsSearch, setSpecsSearch] = useState('');
  const [sectorSearch, setSectorSearch] = useState('');

  // Note Modal (Create & Edit)
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteCategory, setNoteCategory] = useState('General');
  const [notePriority, setNotePriority] = useState('Medium');
  const [noteStatus, setNoteStatus] = useState('Open');
  const [noteTowerCo, setNoteTowerCo] = useState('IHS');
  const [noteDesc, setNoteDesc] = useState('');
  const [noteAppendUpdate, setNoteAppendUpdate] = useState('');
  const [noteAuthor, setNoteAuthor] = useState(userSdmName || 'State Delivery Manager');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Photo Upload & Lightbox State
  const [noteSelectedPhotos, setNoteSelectedPhotos] = useState([]);
  const [notePhotoPreviews, setNotePhotoPreviews] = useState([]);
  const [lightboxImage, setLightboxImage] = useState(null);

  useEffect(() => {
    if (userSdmName && !editingNote) {
      setNoteAuthor(userSdmName);
    }
  }, [userSdmName, editingNote]);

  const loadSite = async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const data = await lookupSite(siteId);
      setSite(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSite();
  }, [siteId]);

  const isCreatorOfNote = (n) => {
    if (isSuperuser) return true;
    if (!userSdmName || !n.created_by) return true;
    const cleanUser = userSdmName.trim().toLowerCase();
    const cleanCreator = n.created_by.trim().toLowerCase();
    return cleanUser === cleanCreator || cleanCreator.includes(cleanUser) || cleanUser.includes(cleanCreator) || cleanCreator === 'state delivery manager';
  };

  const handleNoteFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setNoteSelectedPhotos((prev) => [...prev, ...files]);

    const newPreviews = files.map((file) => URL.createObjectURL(file));
    setNotePhotoPreviews((prev) => [...prev, ...newPreviews]);
    try { e.target.value = ''; } catch {}
  };

  const handleRemoveNoteSelectedPhoto = (index) => {
    setNoteSelectedPhotos((prev) => prev.filter((_, i) => i !== index));
    setNotePhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleOpenAddNote = () => {
    setEditingNote(null);
    setNoteTitle('');
    setNoteCategory('General');
    setNotePriority('Medium');
    setNoteStatus('Open');
    setNoteTowerCo('IHS');
    setNoteDesc('');
    setNoteAppendUpdate('');
    setNoteAuthor(userSdmName || 'State Delivery Manager');
    setNoteSelectedPhotos([]);
    setNotePhotoPreviews([]);
    setShowNoteModal(true);
  };

  const handleOpenEditNote = (n) => {
    setEditingNote(n);
    setNoteTitle(n.title || '');
    setNoteCategory(n.category || 'General');
    setNotePriority(n.priority || 'Medium');
    setNoteStatus(n.status || 'Open');
    setNoteTowerCo(n.tower_co || 'IHS');
    setNoteDesc(n.description || '');
    setNoteAppendUpdate('');
    setNoteAuthor(n.created_by || userSdmName || 'State Delivery Manager');
    setNoteSelectedPhotos([]);
    setNotePhotoPreviews([]);
    setShowNoteModal(true);
  };

  const handleQuickResolveNote = async (n) => {
    if (n.status === 'Resolved') return;
    try {
      await resolveNote(n.id, {
        updated_by: userSdmName,
        sdm: userSdmName,
        is_superuser: isSuperuser
      });
      loadSite();
    } catch (err) {
      alert('Error resolving note: ' + (err.response?.data?.error || err.message));
    }
  };

  const [noteToDelete, setNoteToDelete] = useState(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);

  const handleDeleteNote = (n) => {
    setNoteToDelete(n);
  };

  const handleConfirmDeleteNote = async () => {
    if (!noteToDelete) return;
    setIsDeletingNote(true);
    try {
      await deleteNote(noteToDelete.id, {
        user: userSdmName,
        sdm: userSdmName,
        is_superuser: isSuperuser
      });
      setNoteToDelete(null);
      loadSite();
    } catch (err) {
      alert('Error deleting note: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsDeletingNote(false);
    }
  };

  const handleSaveNote = async (e) => {
    e.preventDefault();
    if (!noteTitle || (!noteDesc && !noteAppendUpdate.trim())) return;
    setSubmittingNote(true);
    try {
      const formData = new FormData();
      formData.append('site_id_input', siteId);
      formData.append('title', noteTitle);
      formData.append('description', noteDesc);
      if (noteAppendUpdate.trim()) {
        formData.append('append_update', noteAppendUpdate.trim());
      }
      formData.append('category', noteCategory);
      formData.append('priority', notePriority);
      formData.append('status', noteStatus);
      formData.append('tower_co', noteTowerCo);

      noteSelectedPhotos.forEach((file) => {
        formData.append('photos', file);
      });

      if (editingNote) {
        formData.append('updated_by', userSdmName);
        formData.append('sdm', userSdmName);
        formData.append('is_superuser', isSuperuser ? 'true' : 'false');
        await updateNote(editingNote.id, formData);
      } else {
        formData.append('created_by', noteAuthor || userSdmName);
        await createNote(formData);
      }
      setShowNoteModal(false);
      setEditingNote(null);
      setNoteTitle('');
      setNoteDesc('');
      setNoteAppendUpdate('');
      setNoteSelectedPhotos([]);
      setNotePhotoPreviews([]);
      loadSite(); // Refresh
    } catch (err) {
      alert((editingNote ? 'Failed to update note: ' : 'Failed to log note: ') + (err.response?.data?.error || err.message));
    } finally {
      setSubmittingNote(false);
    }
  };




  if (loading) {
    return (
      <div className="glass-panel p-12 text-center rounded-2xl space-y-3">
        <Radio className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
        <p className="text-slate-400 text-xs">Loading complete 87-column site technical profile for {siteId}...</p>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="glass-panel p-12 text-center rounded-2xl space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
        <p className="text-slate-300 font-bold text-sm">Site {siteId} not found</p>
        <button onClick={onBack} className="text-xs text-cyan-400 underline">Return to Site Database</button>
      </div>
    );
  }

  const raw = site.raw_data || {};

  // Grouped parameters
  const radioSpecs = [
    { label: '2G Availability', val: raw['2G'] },
    { label: '3G Availability', val: raw['3G'] },
    { label: '4G Availability', val: raw['4G'] },
    { label: '5G Availability', val: raw['5G'] },
    { label: 'Tech Mode', val: raw['Tech'] || site.functionality_mode },
    { label: '2G Operational Status', val: raw['2G Status'] },
    { label: '3G Operational Status', val: raw['3G status'] },
    { label: '4G Operational Status', val: raw['4G Status'] },
    { label: '5G Operational Status', val: raw['5G status'] },
    { label: 'Physical Status', val: raw['Physical Status'] || site.operational_status },
    { label: 'STATUS (Working/Halted)', val: raw['STATUS (Working, Halted)'] },
    { label: 'SITE TYPE (BTS/BB/NFE)', val: raw['SITE TYPE (BTS, BB, NFE, OADM)'] || site.site_configuration },
    { label: 'Indoor / Outdoor', val: raw['Indoor/Outdoor'] || site.solution_on_site },
    { label: 'Tx Outdoor Cabinet', val: raw['Tx Outdoor Cabinet (yes/NO)'] },
    { label: 'Maps Insertion Date 2G', val: raw['Maps Insertion Date 2G'] },
    { label: 'Maps Insertion Date 3G', val: raw['Maps Insertion Date 3G'] },
    { label: 'Maps Insertion Date 4G', val: raw['Maps Insertion Date 4G'] },
    { label: 'OEM Vendor', val: raw['OEM'] || site.ncc_site },
    { label: 'BSC', val: raw['BSC'] || site.cascade },
    { label: 'RNC', val: raw['RNC'] },
    { label: 'Fiber Nodes', val: raw['Fiber Nodes (Yes/No)'] },
    { label: 'RT Donor ID', val: raw['RT Donor ID'] },
  ];

  const geoSpecs = [
    { label: 'Site Name / Address', val: raw['Site Name'] || site.site_address },
    { label: 'Latitude', val: raw['Lat'] || site.latitude },
    { label: 'Longitude', val: raw['Long'] || site.longitude },
    { label: 'State', val: raw['STATE'] || site.state },
    { label: 'LGA', val: raw['LGA'] || site.lga },
    { label: 'Region', val: raw['REGION'] || site.region },
    { label: 'Old Region', val: raw['OLD REGION'] },
    { label: 'New Region', val: raw['NEW REGION'] },
    { label: 'FM-Office', val: raw['FM-Office'] },
    { label: 'Territory', val: raw['TERRITORY'] },
    { label: 'Area Name', val: raw['AREA NAME'] },
    { label: 'Zone', val: raw['Zone'] },
    { label: 'Site Cluster', val: raw['Site Cluster'] || site.cluster_name },
    { label: 'Cluster Category', val: raw['Cluster Category'] || site.solution_category },
    { label: 'Site Priority', val: raw['Site priority'] || site.priority },
    { label: 'I.H.S Site Priority', val: raw['I.H.S Site priority'] },
  ];

  const towerSpecs = [
    { label: 'Tower Co', val: raw['Tower Co'] || site.smc },
    { label: 'Tower Co ID', val: raw['Tower Co ID'] || site.mtn_id },
    { label: 'Tower Co SBC 1', val: raw['Tower Co SBC 1'] || site.sub_sbc },
    { label: 'Tower Co SBC 2', val: raw['Tower Co SBC 2'] },
    { label: 'RT (Old/New)', val: raw['RT (Old/New)'] },
    { label: 'MS Site', val: raw['MS Site'] },
    { label: 'No of Tenants (Inc MTN)', val: raw['No of Tennents (Inc MTN)'] },
    { label: 'Huawei Managed (Yes/No)', val: raw['Huawei managed (Yes/No)'] },
    { label: 'Site Classifications', val: raw['Site Classifications (Hub/Terminal)'] },
    { label: 'Direct Site Dependencies', val: raw['Count of Direct site dependecies'] },
    { label: 'VVIP Site', val: raw['VVIP'] },
    { label: 'High Risk Site', val: raw['High Risk'] },
    { label: 'Tower Height', val: raw['Tower height'] },
    { label: 'Remarks', val: raw['Remarks'] },
  ];

  const powerSpecs = [
    { label: 'PHCN Commercial Power Status', val: raw['PHCN Status'] || site.power_solution },
    { label: 'Number of DGs', val: raw['No of DG'] },
    { label: 'DG Type', val: raw['DG Type'] },
    { label: 'DG Status', val: raw['DG Status'] },
    { label: 'Rectifier Status', val: raw['Rectifier Status'] },
    { label: 'Battery Status', val: raw['Battery status'] },
    { label: 'Earth Value (Ohms)', val: raw['Earth Value'] },
    { label: 'Audit CHECK Status', val: raw['CHECK'] },
  ];

  const stateKey = site.state || raw['STATE'] || 'FCT';
  const regionalExec = getRegionalExecutive(stateKey);

  const personnelSpecs = [
    { label: 'State Delivery Manager (SDM)', val: raw['SDM NAME'] || site.sdm_name, phone: raw['SDM CONTACT NO. '] || site.sdm_phone, ows: raw['SDM OWS ID'], alt: raw['SDM ALTERNATE NO.'] },
    { label: 'SMC FSE Engineer', val: raw['FSE NAME'] || site.smc_fse_name, phone: raw['FSE CONTACT NO.'] || site.smc_fse_phone, email: raw['SMC FSE Email'], ows: raw['FSE OWS ID'], alt: raw['FSE ALTERNATE NO.'] },
    { label: 'Project Manager (EFS)', val: raw['Project MANAGER'] || site.efs_name, phone: raw['Project MANAGER CONTACT'] || site.efs_phone, email: raw['EFS Email'] },
    { 
      label: 'RPM (MS Site) / RTO', 
      val: raw['RPM(MS SITE)'] || raw['RPM(RT SITE)'] || raw['RTO Name'] || site.rto_name || regionalExec.rto.name, 
      phone: raw['RPM(MS SITE) CONTACT'] || raw['RPM(RT SITE) CONTACT'] || raw['RTO Phone'] || site.rto_phone || regionalExec.rto.phone, 
      email: raw['RTO Email'] || regionalExec.rto.email 
    },
    { 
      label: 'Head, Field Service', 
      val: raw['Head, Field Service'] || regionalExec.head.name, 
      phone: raw['Head, Field Service Phone'] || regionalExec.head.phone, 
      email: raw['Head, Field Service Email'] || regionalExec.head.email 
    },
    { 
      label: 'Customer Experience Manager (CEM)', 
      val: raw['Customer Experience Manager'] || regionalExec.cem.name, 
      phone: raw['Customer Experience Manager Phone'] || regionalExec.cem.phone, 
      email: raw['Customer Experience Manager Email'] || regionalExec.cem.email 
    },
    { label: 'Switch Engineer', val: raw['Switch Engineer'] || site.smc_rto_name, phone: raw['SMC RTO Phone'], email: raw['SMC RTO Email'] },
    { 
      label: 'RPM (RT Site)', 
      val: raw['RPM(RT SITE)'] || raw['RPM(MS SITE)'] || raw['RTO Name'] || site.rto_name || regionalExec.rto.name, 
      phone: raw['RPM(RT SITE) CONTACT'] || raw['RPM(MS SITE) CONTACT'] || raw['RTO Phone'] || site.rto_phone || regionalExec.rto.phone 
    },
    { label: 'MTN RDM', val: raw['MTN RDM NAME'] || site.mtn_rdm_name, phone: raw['MTN RDM CONTACT NO.'] || site.mtn_rdm_phone, ows: raw['MTN RDM OWS ID'], alt: raw['MTN RDM ALTERNATE NO.'] },
    { label: 'MTN FSE', val: raw['MTN FSE NAME'] || site.mtn_fse_name, phone: raw['MTN FSE CONTACT NO.'] || site.mtn_fse_phone },
    { label: 'MTN RTM', val: raw['MTN RTM'] || site.mtn_rtm_name, phone: raw['MTN RTM NUMBER'] || site.mtn_rtm_phone },
    { label: 'General Manager (GM)', val: raw['GM'] || site.smc_hoo_name, phone: raw['GM Number'] || site.smc_hoo_phone, email: raw['SMC HOO Email'], alt: raw['GM ALTERNATE NO.'] },
  ];

  // All 87 Key-Value Pairs filtered by search
  const allRawEntries = Object.entries(raw).filter(([k, v]) => {
    if (!specsSearch) return true;
    return k.toLowerCase().includes(specsSearch.toLowerCase()) || String(v).toLowerCase().includes(specsSearch.toLowerCase());
  });

  return (
    <div className="space-y-6">
      
      {/* Top Header Controls */}
      <div className="glass-panel p-6 rounded-2xl flex flex-wrap items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Database
          </button>
          
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-extrabold text-white font-mono tracking-wide">{site.ihs_site_id}</h1>
              {site.mtn_id && site.mtn_id !== site.ihs_site_id && (
                <span className="px-2.5 py-0.5 text-xs font-bold bg-slate-800 text-cyan-300 rounded-md border border-slate-700">MTN: {site.mtn_id}</span>
              )}
              <span className={`px-3 py-0.5 text-xs font-extrabold rounded-full ${
                site.is_down ? 'bg-red-500/20 text-red-400 border border-red-500/40 glow-badge-red' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                {site.operational_status || 'Operational'}
              </span>
              <span className="px-3 py-0.5 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                Priority: {site.priority || 'P2'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              {site.site_address || 'Abuja FCT Site Location'} &bull; {site.cluster_name || 'FCT Cluster'} &bull; {site.lga || 'FCT LGA'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onOpenAIWithPrompt(`Analyze root cause, power specs, and history for site ${site.ihs_site_id}`)}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center space-x-1.5 transition-all"
          >
            <Cpu className="w-4 h-4 text-cyan-200 animate-pulse" />
            <span>Ask AI Operations</span>
          </button>
          
          <button
            onClick={() => setShowNoteModal(true)}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center space-x-1.5 transition-all"
          >
            <FileText className="w-4 h-4" />
            <span>Log SDM Note</span>
          </button>
        </div>
      </div>

      {/* 87-Column Technical Parameters Explorer Tabs */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-3">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">FCT Site Technical Parameters & Specs Explorer</h2>
            <span className="px-2.5 py-0.5 text-xs bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-500/30">87 Excel Parameters</span>
          </div>

          {/* Spec Navigation Tabs */}
          <div className="flex space-x-1 overflow-x-auto no-scrollbar">
            {[
              { id: 'radio', label: 'Radio & Tech Status', icon: Wifi },
              { id: 'sectors', label: `4G LTE RF Sectors (${site?.cell_sectors?.length || 0})`, icon: Radio },
              { id: 'geo', label: 'Geography & Location', icon: MapPin },
              { id: 'tower', label: 'Tower & Infrastructure', icon: Layers },
              { id: 'power', label: 'Power & Electrical', icon: Zap },
              { id: 'people', label: 'Personnel & Contacts', icon: User },
              { id: 'all', label: 'All 87 Specs Grid', icon: Database },
            ].map((t) => {
              const IconComp = t.icon;
              const isActive = activeSpecTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveSpecTab(t.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                    isActive ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <IconComp className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab 1: Radio & Tech Status */}
        {activeSpecTab === 'radio' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {radioSpecs.map((item, idx) => (
              <div key={idx} className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">{item.label}</span>
                <span className={`text-xs font-extrabold ${item.val ? 'text-cyan-300' : 'text-slate-500'}`}>
                  {item.val || 'N/A'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tab: 4G LTE RF Sectors (KML Coverage) */}
        {activeSpecTab === 'sectors' && (
          <div className="space-y-4">
            {/* Header & Filter Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
              <div>
                <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-cyan-400" />
                  <span>4G LTE Radio Frequency Sectors & Antenna Coverage</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Extracted from <b className="text-cyan-300 font-mono">ABUJA REGION KML 07292026 (4G)</b> • {site.cell_sectors?.length || 0} Carriers Mapped
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search Cell Name, PCI, TAC, Azimuth..."
                    value={sectorSearch}
                    onChange={(e) => setSectorSearch(e.target.value)}
                    className="w-full bg-slate-950 text-xs text-white placeholder-slate-500 pl-8 pr-7 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  {sectorSearch && (
                    <button onClick={() => setSectorSearch('')} className="absolute right-2.5 top-2 text-slate-400 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {onNavigateTab && (
                  <button
                    onClick={() => onNavigateTab('map')}
                    className="px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shrink-0 cursor-pointer"
                    title="View cell coverage polygons on Live Map"
                  >
                    <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                    <span>View on Map</span>
                  </button>
                )}
              </div>
            </div>

            {/* Grid of Sector Cards */}
            {(() => {
              const sectors = (site.cell_sectors || []).filter((sec) => {
                if (!sectorSearch.trim()) return true;
                const q = sectorSearch.toLowerCase().trim();
                return (
                  (sec.cell_name || '').toLowerCase().includes(q) ||
                  String(sec.pci || '').includes(q) ||
                  String(sec.tac || '').includes(q) ||
                  String(sec.azimuth || '').includes(q) ||
                  String(sec.cell_id || '').includes(q)
                );
              });

              if (sectors.length === 0) {
                return (
                  <div className="text-center py-10 bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400 space-y-2">
                    <Radio className="w-8 h-8 mx-auto text-slate-600" />
                    <p className="text-xs font-semibold text-slate-300">
                      {sectorSearch ? `No 4G sectors matching "${sectorSearch}"` : `No 4G KML sector coverage data mapped for site ${site.ihs_site_id}.`}
                    </p>
                    {sectorSearch && (
                      <button onClick={() => setSectorSearch('')} className="text-xs text-cyan-400 hover:underline">
                        Clear search filter
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                  {sectors.map((sec) => {
                    const az = sec.azimuth || 0;

                    return (
                      <div key={sec.id || sec.cell_name} className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800/90 hover:border-cyan-500/50 transition-all space-y-3 shadow-lg">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                          <div className="flex items-center space-x-1.5">
                            <Radio className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="font-extrabold text-white font-mono text-sm">{sec.cell_name}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                            4G LTE
                          </span>
                        </div>

                        {/* Telemetry Metrics */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PCI</span>
                            <span className="text-base font-black text-cyan-300 font-mono mt-0.5 block">{sec.pci ?? 'N/A'}</span>
                          </div>

                          <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Azimuth</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {/* Live SVG Azimuth Needle */}
                              <div className="w-4 h-4 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center relative shrink-0">
                                <div
                                  style={{ transform: `rotate(${az}deg)` }}
                                  className="w-0.5 h-2.5 bg-gradient-to-t from-red-500 to-amber-400 rounded origin-center transition-transform"
                                />
                              </div>
                              <span className="text-xs font-black text-emerald-400 font-mono">{sec.azimuth != null ? `${sec.azimuth}°` : 'N/A'}</span>
                            </div>
                          </div>

                          <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">TAC</span>
                            <span className="text-xs font-bold text-slate-300 font-mono mt-0.5 block">{sec.tac ?? 'N/A'}</span>
                          </div>

                          <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cell ID</span>
                            <span className="text-xs font-bold text-slate-300 font-mono mt-0.5 block">{sec.cell_id ?? 'N/A'}</span>
                          </div>
                        </div>

                        {/* Location Details */}
                        <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80 font-mono">
                          <span>Lat: {sec.latitude?.toFixed(4) ?? 'N/A'}</span>
                          <span>Lng: {sec.longitude?.toFixed(4) ?? 'N/A'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* Tab 2: Geography & Location */}
        {activeSpecTab === 'geo' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {geoSpecs.map((item, idx) => (
              <div key={idx} className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">{item.label}</span>
                <span className={`text-xs font-extrabold ${item.val ? 'text-slate-200' : 'text-slate-500'}`}>
                  {item.val || 'N/A'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Tower & Infrastructure */}
        {activeSpecTab === 'tower' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {towerSpecs.map((item, idx) => (
              <div key={idx} className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">{item.label}</span>
                <span className={`text-xs font-extrabold ${item.val ? 'text-indigo-300' : 'text-slate-500'}`}>
                  {item.val || 'N/A'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Power & Electrical */}
        {activeSpecTab === 'power' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {powerSpecs.map((item, idx) => (
              <div key={idx} className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">{item.label}</span>
                <span className={`text-xs font-extrabold ${item.val ? 'text-amber-300' : 'text-slate-500'}`}>
                  {item.val || 'N/A'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tab 5: Personnel Directory */}
        {activeSpecTab === 'people' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {personnelSpecs.map((p, idx) => (
              <div key={idx} className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">{p.label}</div>
                <div className="text-sm font-extrabold text-white">{p.val || 'Unassigned'}</div>
                {p.phone && (
                  <div className="text-xs text-slate-300 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <a href={`tel:${p.phone}`} className="hover:underline font-mono">{p.phone}</a>
                  </div>
                )}
                {p.email && (
                  <div className="text-xs text-slate-300 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-cyan-400" />
                    <a href={`mailto:${p.email}`} className="hover:underline font-mono text-[11px] text-cyan-300 truncate" title={p.email}>
                      {p.email}
                    </a>
                  </div>
                )}
                {p.ows && <div className="text-[11px] text-slate-400">OWS ID: <b className="text-slate-200">{p.ows}</b></div>}
                {p.alt && <div className="text-[11px] text-slate-400">Alt Phone: <b className="text-slate-300 font-mono">{p.alt}</b></div>}
              </div>
            ))}
          </div>
        )}

        {/* Tab 6: Complete 87-Column Raw Specs Grid */}
        {activeSpecTab === 'all' && (
          <div className="space-y-3">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search across all 87 Excel parameter names or values..."
                value={specsSearch}
                onChange={(e) => setSpecsSearch(e.target.value)}
                className="w-full bg-slate-900 text-xs text-white placeholder-slate-500 pl-9 pr-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="overflow-x-auto max-h-96 border border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-900 text-cyan-300 font-bold sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="p-3 w-12 text-slate-500">#</th>
                    <th className="p-3 w-1/3">Excel Column Parameter Name</th>
                    <th className="p-3">Parameter Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {allRawEntries.map(([k, v], idx) => (
                    <tr key={k} className="hover:bg-slate-900/50">
                      <td className="p-3 text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                      <td className="p-3 font-semibold text-slate-300">{k}</td>
                      <td className="p-3 font-mono font-bold text-cyan-300 break-all">{String(v)}</td>
                    </tr>
                  ))}
                  {allRawEntries.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-slate-500">No parameters matching search query.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* History Sections: SDM Notes & Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* SDM Notes Log */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              SDM Operational Notes ({site.notes ? site.notes.length : 0})
            </h3>
            <button
              onClick={handleOpenAddNote}
              className="text-xs text-cyan-400 hover:underline font-bold"
            >
              + Add Note
            </button>
          </div>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {site.notes && site.notes.length > 0 ? (
              site.notes.map((n) => {
                const canEdit = isCreatorOfNote(n);
                const isResolved = n.status === 'Resolved';
                const photos = n.attachments || [];
                return (
                  <div key={n.id} className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between font-bold text-xs text-white">
                      <div className="flex items-center space-x-2">
                        <span>{n.title}</span>
                        {onNavigateToAvailability && (
                          <button
                            onClick={() => onNavigateToAvailability(n.site_ihs_id || site.ihs_site_id)}
                            className="px-2 py-0.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[10px] rounded border border-emerald-500/40 transition-all flex items-center gap-1"
                            title={`Filter Daily Availability for site ${n.site_ihs_id || site.ihs_site_id}`}
                          >
                            <Activity className="w-3 h-3 text-emerald-400" />
                            <span>Daily Availability</span>
                          </button>
                        )}
                        {canEdit && !isResolved && (
                          <button
                            onClick={() => handleQuickResolveNote(n)}
                            className="px-2 py-0.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-extrabold text-[10px] rounded border border-emerald-500/40 transition-all flex items-center gap-1"
                            title="Instantly mark issue as Resolved & close note"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>Quick Resolve</span>
                          </button>
                        )}
                        {canEdit && (
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => handleOpenEditNote(n)}
                              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 rounded transition-all"
                              title="Edit / Update Note"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                            </button>
                            <button
                              onClick={() => handleDeleteNote(n)}
                              className="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded transition-all"
                              title={isSuperuser ? "Delete Note (Superuser)" : "Delete Note"}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${isResolved ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
                          {n.status}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded font-bold">
                          FSE: {n.smc_fse_name || 'Unassigned'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-cyan-300 rounded border border-slate-700">{n.category}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold font-mono ${isResolved ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                          ⏱️ {isResolved ? 'Resolved in:' : 'Duration:'} {(() => {
                            if (!n || !n.created_at) return '';
                            const created = new Date(n.created_at).getTime();
                            if (isNaN(created)) return '';
                            let endTime;
                            if (n.status === 'Resolved') {
                              endTime = n.resolved_at ? new Date(n.resolved_at).getTime() : (n.updated_at ? new Date(n.updated_at).getTime() : Date.now());
                            } else {
                              endTime = Date.now();
                            }
                            const diffSec = Math.max(0, Math.floor((endTime - created) / 1000));
                            const days = Math.floor(diffSec / 86400);
                            const remSec = diffSec % 86400;
                            const hrs = Math.floor(remSec / 3600);
                            const mins = Math.floor((remSec % 3600) / 60);
                            if (days > 0) return `${days}d ${hrs}h ${mins}m`;
                            if (hrs > 0) return `${hrs}h ${mins}m`;
                            if (mins > 0) return `${mins}mins`;
                            return '< 1 min';
                          })()}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{n.description}</p>

                    {/* Attached Photos */}
                    {photos.length > 0 && (
                      <div className="pt-2 border-t border-slate-800">
                        <div className="text-[10px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                          <Camera className="w-3 h-3 text-cyan-400" />
                          <span>Photos ({photos.length}):</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {photos.map((att) => (
                            <div
                              key={att.id}
                              className="relative group rounded-lg overflow-hidden border border-slate-700 bg-slate-900 cursor-pointer"
                              onClick={() => setLightboxImage(getMediaUrl(att.file))}
                              title={att.file_name}
                            >
                              <img src={getMediaUrl(att.file)} alt={att.file_name} className="w-14 h-14 object-cover group-hover:scale-105 transition-transform" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Maximize2 className="w-3 h-3 text-white" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                      <span>By: <b className="text-slate-300">{n.created_by}</b></span>
                      <span>{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-slate-500 py-8 text-xs">No SDM notes recorded for this site yet.</div>
            )}
          </div>
        </div>

        {/* Site Timeline */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              Operational Timeline History ({site.timeline ? site.timeline.length : 0})
            </h3>
          </div>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {site.timeline && site.timeline.length > 0 ? (
              site.timeline.map((t) => (
                <div key={t.id} className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between font-bold text-xs text-indigo-300">
                    <span>{t.event}</span>
                    <span className="text-[10px] text-slate-500">{new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-slate-300">{t.details}</p>
                  <div className="text-[10px] text-slate-500 text-right">Actor: {t.author}</div>
                </div>
              ))
            ) : (
              <div className="text-center text-slate-500 py-8 text-xs">No operational timeline records found.</div>
            )}
          </div>
        </div>

      </div>

      {/* Modal: Write / Edit Note */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="glass-panel max-w-lg w-full p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {editingNote ? <Edit3 className="w-4 h-4 text-cyan-400" /> : <FileText className="w-4 h-4 text-cyan-400" />}
                {editingNote ? `Update Note for ${site.ihs_site_id}` : `Log Note for ${site.ihs_site_id}`}
              </h3>
              <button onClick={() => { setShowNoteModal(false); setEditingNote(null); }} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveNote} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Commercial Power Outage & Generator Fault"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Category</label>
                  <select
                    value={noteCategory}
                    onChange={(e) => setNoteCategory(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none"
                  >
                    {['Power', 'Transmission', 'Generator', 'Battery', 'Fuel', 'Microwave', 'RAN', 'Fiber', 'Security', 'Customer', 'Preventive Maintenance', 'Corrective Maintenance', 'General'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Priority</label>
                  <select
                    value={notePriority}
                    onChange={(e) => setNotePriority(e.target.value)}
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
                    value={noteStatus}
                    onChange={(e) => setNoteStatus(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none"
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Escalated">Escalated</option>
                  </select>
                </div>
              </div>

              {/* Progress Update Entry / New Data Field */}
              {editingNote && (
                <div className="p-3 bg-cyan-950/40 rounded-xl border border-cyan-500/30 space-y-1">
                  <label className="block text-cyan-300 font-semibold flex items-center justify-between">
                    <span>➕ Append New Progress Update / Field Data</span>
                    <span className="text-[10px] text-cyan-400 font-normal">Appends timestamped entry</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. FSE visited site at 18:45; swapped battery bank, power restored..."
                    value={noteAppendUpdate}
                    onChange={(e) => setNoteAppendUpdate(e.target.value)}
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
                    onChange={handleNoteFileSelect}
                    className="hidden"
                    id="profile-photo-upload-input"
                  />
                  <label htmlFor="profile-photo-upload-input" className="cursor-pointer flex flex-col items-center justify-center space-y-1">
                    <Upload className="w-5 h-5 text-cyan-400" />
                    <span className="text-xs text-slate-200 font-semibold">Click to select site inspection photos</span>
                    <span className="text-[10px] text-slate-400">Upload pictures of site equipment or field inspection</span>
                  </label>
                </div>

                {/* Selected Photo Previews */}
                {notePhotoPreviews.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[11px] font-semibold text-cyan-300">Selected New Photos ({notePhotoPreviews.length}):</span>
                    <div className="flex flex-wrap gap-2">
                      {notePhotoPreviews.map((src, index) => (
                        <div key={index} className="relative group rounded-lg overflow-hidden border border-cyan-500/50 bg-slate-900 shadow-md">
                          <img src={src} alt="Preview" className="w-12 h-12 object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemoveNoteSelectedPhoto(index)}
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
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description / Operational Context History</label>
                <textarea
                  required={!noteAppendUpdate.trim()}
                  rows={4}
                  placeholder="Log findings, operational history, and engineer visits..."
                  value={noteDesc}
                  onChange={(e) => setNoteDesc(e.target.value)}
                  className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowNoteModal(false); setEditingNote(null); }}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingNote}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg"
                >
                  {submittingNote ? 'Saving...' : editingNote ? 'Update Note' : 'Save Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
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
            <img src={getMediaUrl(lightboxImage)} alt="Site Inspection Evidence" className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain border border-slate-700" />
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!noteToDelete}
        title="Delete SDM Operational Note"
        message="Are you sure you want to delete this SDM Operational Note from this site? This will permanently remove the note."
        itemDetails={noteToDelete ? {
          siteId: site?.ihs_site_id || siteId,
          itemTitle: noteToDelete.title,
          author: noteToDelete.created_by
        } : null}
        confirmText="Permanently Delete Note"
        onConfirm={handleConfirmDeleteNote}
        onCancel={() => setNoteToDelete(null)}
        isDeleting={isDeletingNote}
      />
    </div>
  );
}
