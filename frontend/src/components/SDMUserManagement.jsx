import React, { useState, useEffect } from 'react';
import { UserPlus, Shield, User, Mail, Phone, Lock, CheckCircle, RefreshCw, Radio, Search, Check, AlertCircle, Building2, MapPin, Globe, Layers, Send } from 'lucide-react';
import { fetchSDMList, registerSDM, assignStateToSDM, fetchAvailableStates } from '../api';

const DEFAULT_NIGERIAN_STATES = [
  { state: 'FCT', count: 1050 },
  { state: 'LAGOS', count: 2613 },
  { state: 'RIVERS', count: 1168 },
  { state: 'KANO', count: 718 },
  { state: 'KADUNA', count: 664 },
  { state: 'ANAMBRA', count: 804 },
  { state: 'DELTA', count: 840 },
  { state: 'OYO', count: 871 },
  { state: 'EDO', count: 764 },
  { state: 'ENUGU', count: 630 },
  { state: 'ABIA', count: 596 },
  { state: 'AKWA IBOM', count: 550 },
  { state: 'OGUN', count: 1269 },
  { state: 'ONDO', count: 464 },
  { state: 'OSUN', count: 470 },
  { state: 'KWARA', count: 427 },
  { state: 'KOGI', count: 300 },
  { state: 'BENUE', count: 455 },
  { state: 'PLATEAU', count: 359 },
  { state: 'NASSARAWA', count: 289 },
  { state: 'NIGER', count: 443 },
  { state: 'KATSINA', count: 328 },
  { state: 'BAUCHI', count: 313 },
  { state: 'ADAMAWA', count: 311 },
  { state: 'EKITI', count: 304 },
  { state: 'BORNO', count: 250 },
  { state: 'SOKOTO', count: 243 },
  { state: 'KEBBI', count: 226 },
  { state: 'JIGAWA', count: 216 },
  { state: 'TARABA', count: 203 },
  { state: 'GOMBE', count: 192 },
  { state: 'BAYELSA', count: 188 },
  { state: 'EBONYI', count: 186 },
  { state: 'YOBE', count: 174 },
  { state: 'ZAMFARA', count: 149 }
];

const DEFAULT_SDM_USERS = [
  {"id": 40, "username": "admin", "full_name": "Super Administrator", "email": "admin@fcttelecom.ng", "is_superuser": true, "role": "Super Administrator", "assigned_sites": 20174, "is_registered": true},
  {"id": 42, "username": "enunekwu", "full_name": "enunekwu", "email": "12345@gmail.com", "is_superuser": true, "role": "Super Administrator", "assigned_sites": 20174, "is_registered": true},
  {"id": 1, "username": "tochukwu_nzomiwu", "full_name": "Tochukwu Nzomiwu", "email": "tochukwu_nzomiwu@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 600, "is_registered": true},
  {"id": 2, "username": "olaoti_m._adewole", "full_name": "Olaoti M. Adewole", "email": "olaoti_m._adewole@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 318, "is_registered": true},
  {"id": 3, "username": "simeon_itua", "full_name": "SIMEON ITUA", "email": "simeon_itua@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 550, "is_registered": true},
  {"id": 4, "username": "kelechi_okezie", "full_name": "Kelechi Okezie", "email": "kelechi_okezie@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 809, "is_registered": true},
  {"id": 5, "username": "mene_shadrack_iruobe", "full_name": "Mene Shadrack Iruobe", "email": "mene_shadrack_iruobe@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 837, "is_registered": true},
  {"id": 6, "username": "jonas_abazie", "full_name": "Jonas Abazie", "email": "jonas_abazie@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 660, "is_registered": true},
  {"id": 7, "username": "nwadike_chigozie_martins", "full_name": "NWADIKE CHIGOZIE MARTINS", "email": "nwadike_chigozie_martins@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 669, "is_registered": true},
  {"id": 8, "username": "joseph_alleh", "full_name": "Joseph Alleh", "email": "joseph_alleh@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 457, "is_registered": true},
  {"id": 9, "username": "bashir_abdulkadir_imam", "full_name": "BASHIR ABDULKADIR IMAM", "email": "bashir_abdulkadir_imam@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 246, "is_registered": true},
  {"id": 10, "username": "daniel_okereke", "full_name": "Daniel Okereke", "email": "daniel_okereke@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 327, "is_registered": true},
  {"id": 11, "username": "udo_stanley_ibe", "full_name": "Udo Stanley Ibe", "email": "udo_stanley_ibe@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 390, "is_registered": true},
  {"id": 12, "username": "omodia_sunday_ibizugbe", "full_name": "Omodia Sunday Ibizugbe", "email": "omodia_sunday_ibizugbe@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 185, "is_registered": true},
  {"id": 13, "username": "animam_louis", "full_name": "Animam Louis", "email": "animam_louis@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 639, "is_registered": true},
  {"id": 14, "username": "mustafa_musa", "full_name": "Mustafa Musa", "email": "mustafa_musa@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 755, "is_registered": true},
  {"id": 15, "username": "nwagu_kingsley", "full_name": "Nwagu Kingsley", "email": "nwagu_kingsley@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 770, "is_registered": true},
  {"id": 16, "username": "olanrewaju_kayode_olaewe", "full_name": "OLANREWAJU KAYODE OLAEWE", "email": "olanrewaju_kayode_olaewe@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 579, "is_registered": true},
  {"id": 17, "username": "jacobs_kunle_oluwole", "full_name": "Jacobs Kunle Oluwole", "email": "jacobs_kunle_oluwole@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 601, "is_registered": true},
  {"id": 18, "username": "nathaniel_ocheni", "full_name": "Nathaniel Ocheni", "email": "nathaniel_ocheni@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 428, "is_registered": true},
  {"id": 20, "username": "popoola_moses_oluwatoyin", "full_name": "Popoola Moses oluwatoyin", "email": "popoola_moses_oluwatoyin@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 22, "is_registered": true},
  {"id": 21, "username": "badmus_abass_olayemi", "full_name": "Badmus Abass Olayemi", "email": "badmus_abass_olayemi@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 366, "is_registered": true},
  {"id": 22, "username": "decommission", "full_name": "Decommission", "email": "decommission@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 1, "is_registered": true},
  {"id": 24, "username": "solomon_ellams", "full_name": "SOLOMON ELLAMS", "email": "solomon_ellams@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 456, "is_registered": true},
  {"id": 25, "username": "hassan_barkindo", "full_name": "HASSAN BARKINDO", "email": "hassan_barkindo@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 707, "is_registered": true},
  {"id": 26, "username": "mukhtar_kabir_mohammed", "full_name": "Mukhtar Kabir Mohammed", "email": "mukhtar_kabir_mohammed@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 655, "is_registered": true},
  {"id": 27, "username": "adisa_taiwo_joseph", "full_name": "ADISA TAIWO JOSEPH", "email": "adisa_taiwo_joseph@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 468, "is_registered": true},
  {"id": 28, "username": "saka_tajudeen_adeyemi", "full_name": "Saka Tajudeen Adeyemi", "email": "saka_tajudeen_adeyemi@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 893, "is_registered": true},
  {"id": 29, "username": "jemiseye_toyin", "full_name": "Jemiseye Toyin", "email": "jemiseye_toyin@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 865, "is_registered": true},
  {"id": 30, "username": "kareem_quadri_olaitan", "full_name": "Kareem Quadri Olaitan", "email": "kareem_quadri_olaitan@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 56, "is_registered": true},
  {"id": 31, "username": "shaibu_odanwu", "full_name": "Shaibu Odanwu", "email": "shaibu_odanwu@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 456, "is_registered": true},
  {"id": 32, "username": "omolekan_oluwagbenga", "full_name": "OMOLEKAN OLUWAGBENGA", "email": "omolekan_oluwagbenga@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 486, "is_registered": true},
  {"id": 33, "username": "chijioke_omeni", "full_name": "Chijioke Omeni", "email": "chijioke_omeni@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 598, "is_registered": true},
  {"id": 34, "username": "fatai_ayinde", "full_name": "Fatai Ayinde", "email": "fatai_ayinde@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 520, "is_registered": true},
  {"id": 35, "username": "bajomo_oluwafemi_emmanuel", "full_name": "Bajomo Oluwafemi Emmanuel", "email": "bajomo_oluwafemi_emmanuel@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 609, "is_registered": true},
  {"id": 36, "username": "ajayi_omotayo", "full_name": "Ajayi Omotayo", "email": "ajayi_omotayo@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 583, "is_registered": true},
  {"id": 38, "username": "eneh_kosoluchukwu_j", "full_name": "Eneh Kosoluchukwu J", "email": "eneh_kosoluchukwu_j@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 579, "is_registered": true},
  {"id": 39, "username": "nasir_jimoh", "full_name": "Nasir Jimoh", "email": "nasir_jimoh@fcttelecom.ng", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 213, "is_registered": true},
  {"id": 41, "username": "mrchrys", "full_name": "Ogwara Christian Enunekwu", "email": "smartchrys@gmail.com", "is_superuser": false, "role": "State Delivery Manager", "assigned_sites": 0, "is_registered": true}
];

export default function SDMUserManagement({ currentUser }) {
  const [sdms, setSdms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all', 'registered', 'portfolio'

  // Available States list from database
  const [availableStates, setAvailableStates] = useState([]);
  const [assignSdmName, setAssignSdmName] = useState('');
  const [assignStateName, setAssignStateName] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState({ type: '', text: '' });

  // Form states for creating new SDM
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('password123');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const loadSdms = async () => {
    setLoading(true);
    try {
      const data = await fetchSDMList();
      const list = Array.isArray(data) ? data : data?.results || [];
      if (list.length > 0) {
        setSdms(list);
      }
    } catch (e) {
      console.error('Failed to fetch SDMs list:', e);
      setMsg({ type: 'error', text: `Unable to connect to SDM directory server (${e.message || 'Network Error'}). Ensure backend server is running.` });
    } finally {
      setLoading(false);
    }

    try {
      const statesData = await fetchAvailableStates();
      setAvailableStates(Array.isArray(statesData) ? statesData : statesData?.results || []);
    } catch (e) {
      console.error('Failed to fetch available states:', e);
    }
  };

  useEffect(() => {
    loadSdms();
  }, []);

  const activeSdms = sdms.length > 0 ? sdms : DEFAULT_SDM_USERS;

  const [assignMode, setAssignMode] = useState('state'); // 'state' or 'sites'
  const [assignSiteIds, setAssignSiteIds] = useState('');

  const handleAssignStateSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!assignSdmName) {
      setAssignMsg({ type: 'error', text: 'Please select an SDM Manager.' });
      return;
    }

    if (assignMode === 'state' && !assignStateName) {
      setAssignMsg({ type: 'error', text: 'Please select a Target State Territory.' });
      return;
    }

    if (assignMode === 'sites' && !assignSiteIds.trim()) {
      setAssignMsg({ type: 'error', text: 'Please enter at least one Site ID (e.g. FC2700, FC2437).' });
      return;
    }

    setAssigning(true);
    setAssignMsg({ type: '', text: '' });

    try {
      const res = await assignStateToSDM(
        assignSdmName, 
        assignMode === 'state' ? assignStateName : '', 
        '', 
        assignMode === 'sites' ? assignSiteIds.trim() : null
      );
      setAssignMsg({ type: 'success', text: res.message || `Successfully assigned ${res.updated_count || 0} sites to ${assignSdmName}!` });
      setAssignStateName('');
      setAssignSiteIds('');
      loadSdms();
    } catch (err) {
      setAssignMsg({ type: 'error', text: err.response?.data?.error || 'Failed to assign sites to SDM.' });
    } finally {
      setAssigning(false);
    }
  };

  const handleQuickAssignState = (sdm) => {
    setAssignSdmName(sdm.full_name);
    if (availableStates.length > 0 && !assignStateName) {
      setAssignStateName(availableStates[0].state);
    }
    setAssignMsg({ type: 'info', text: `Selected SDM: ${sdm.full_name}. Choose target State below and click Assign State.` });
  };

  const handleCreateSDM = async (e) => {
    if (e) e.preventDefault();
    if (!fullName || !username || !password) {
      setMsg({ type: 'error', text: 'Full Name, Username, and Password are required.' });
      return;
    }

    setSubmitting(true);
    setMsg({ type: '', text: '' });

    try {
      const res = await registerSDM({
        full_name: fullName,
        username: username,
        email: email,
        phone: phone,
        password: password
      });
      setMsg({ type: 'success', text: res.message || `SDM Account for ${fullName} created successfully!` });
      setFullName('');
      setUsername('');
      setEmail('');
      setPhone('');
      setPassword('password123');
      loadSdms();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to create SDM account.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickRegister = (sdm) => {
    setFullName(sdm.full_name);
    const suggestedUsername = sdm.username || sdm.full_name.toLowerCase().replace(/\s+/g, '_');
    setUsername(suggestedUsername);
    setEmail(sdm.email || `${suggestedUsername}@fcttelecom.ng`);
    setPassword('password123');
    setMsg({ type: 'info', text: `Pre-filled registration form for ${sdm.full_name}. Adjust password if needed and click Register.` });
  };

  const registeredCount = activeSdms.filter(s => s.is_registered).length;
  const portfolioCount = activeSdms.filter(s => !s.is_registered).length;

  const filteredSdms = activeSdms.filter(s => {
    if (filterTab === 'registered' && !s.is_registered) return false;
    if (filterTab === 'portfolio' && s.is_registered) return false;

    if (!search) return true;
    const q = search.toLowerCase();
    return (s.full_name || '').toLowerCase().includes(q) || 
           (s.username || '').toLowerCase().includes(q) || 
           (s.email && s.email.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-extrabold text-white tracking-wide">SDM User Profile Creation & Admin Control Portal</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Super Administrator Control &bull; Logged in as <b className="text-cyan-300">{currentUser.full_name}</b> ({currentUser.role}). Create and manage SDM Manager accounts across Federal Capital Territory.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-900/90 px-3.5 py-1.5 rounded-xl border border-slate-700 text-xs flex items-center space-x-2">
            <span className="text-slate-400">Total SDMs:</span>
            <b className="text-cyan-300 font-mono text-sm">{activeSdms.length}</b>
          </div>

          <div className="bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30 text-xs text-emerald-300 font-semibold flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Active Users: <b className="text-white font-mono">{registeredCount}</b></span>
          </div>

          {portfolioCount > 0 && (
            <div className="bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/30 text-xs text-amber-300 font-semibold flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Site Managers: <b className="text-white font-mono">{portfolioCount}</b></span>
            </div>
          )}

          <button
            onClick={loadSdms}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-700 transition-all shadow"
            title="Refresh SDM Directory"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Create New SDM & Assign State (Super Admin Only) */}
        {currentUser?.is_superuser && (
          <div className="lg:col-span-5 space-y-4">
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-cyan-400" /> Create New SDM Account
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Register a new State Delivery Manager to grant them access to the dashboard.</p>
              </div>

              {msg.text && (
                <div className={`p-3 rounded-xl border text-xs font-medium leading-relaxed ${
                  msg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' :
                  msg.type === 'info' ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300' :
                  'bg-red-500/10 border-red-500/40 text-red-400'
                }`}>
                  {msg.text}
                </div>
              )}

              <form onSubmit={handleCreateSDM} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">SDM Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Adebayo Johnson"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (!username) {
                        setUsername(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                      }
                    }}
                    className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Desired Username</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. adebayo_johnson"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                      className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Phone Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 08031234567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. adebayo_johnson@fcttelecom.ng"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Initial Password</label>
                  <input
                    type="text"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none font-mono text-cyan-300 font-bold"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Default initial password is <b>password123</b></span>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-1.5 transition-all mt-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{submitting ? 'Creating SDM Account...' : 'Register & Create SDM Profile'}</span>
                </button>
              </form>
            </div>

            {/* Card 2: Assign State Portfolio / Sites to SDM */}
            <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-3">
              <div className="border-b border-amber-500/20 pb-2.5">
                <h2 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-400" /> Assign Sites / State Portfolio to SDM
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Assign an entire State territory or specific Site ID(s) to an SDM.
                </p>
              </div>

              {/* Assignment Mode Tabs */}
              <div className="flex items-center space-x-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setAssignMode('state')}
                  className={`flex-1 py-1 rounded-lg font-bold transition-all ${
                    assignMode === 'state' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  By State Territory
                </button>
                <button
                  type="button"
                  onClick={() => setAssignMode('sites')}
                  className={`flex-1 py-1 rounded-lg font-bold transition-all ${
                    assignMode === 'sites' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  By Specific Site ID(s)
                </button>
              </div>

              {assignMsg.text && (
                <div className={`p-2.5 rounded-xl border text-[11px] font-medium leading-relaxed ${
                  assignMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' :
                  assignMsg.type === 'info' ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300' :
                  'bg-red-500/10 border-red-500/40 text-red-400'
                }`}>
                  {assignMsg.text}
                </div>
              )}

              <form onSubmit={handleAssignStateSubmit} className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1 text-[11px]">Select SDM Manager</label>
                  <select
                    required
                    value={assignSdmName}
                    onChange={(e) => setAssignSdmName(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-500 font-medium text-xs cursor-pointer"
                  >
                    <option value="">-- Choose SDM Manager --</option>
                    {activeSdms.map((s) => (
                      <option key={s.id} value={s.full_name}>
                        {s.full_name} (@{s.username}) &bull; {s.assigned_sites || 0} Sites
                      </option>
                    ))}
                  </select>
                </div>

                {assignMode === 'state' ? (
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1 text-[11px]">Select Target State Territory</label>
                    <select
                      value={assignStateName}
                      onChange={(e) => setAssignStateName(e.target.value)}
                      className="w-full bg-slate-900 text-white p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-500 font-medium text-xs cursor-pointer"
                    >
                      <option value="">-- Choose State Territory --</option>
                      {(availableStates.length > 0 ? availableStates : DEFAULT_NIGERIAN_STATES).map((st) => (
                        <option key={st.state} value={st.state}>
                          {st.state} ({st.count.toLocaleString()} sites)
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1 text-[11px]">Enter Site ID(s) (Comma Separated)</label>
                    <input
                      type="text"
                      placeholder="e.g. FC2700, FC2437, FC1090"
                      value={assignSiteIds}
                      onChange={(e) => setAssignSiteIds(e.target.value.toUpperCase())}
                      className="w-full bg-slate-900 text-white p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-500 font-mono text-xs"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">Enter single or multiple comma-separated Site IDs.</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={assigning}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-1.5 transition-all mt-1"
                >
                  <Globe className="w-4 h-4" />
                  <span>{assigning ? 'Reassigning Sites...' : assignMode === 'state' ? 'Assign State Portfolio to SDM' : 'Assign Selected Sites to SDM'}</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Directory Table */}
        <div className={`${currentUser?.is_superuser ? 'lg:col-span-7' : 'lg:col-span-12'} glass-panel p-6 rounded-2xl border border-slate-800 space-y-4`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-400" />
                State Delivery Managers Directory ({activeSdms.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Directory of all authorized SDMs and portfolio managers across FCT.</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative max-w-xs">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Name or @username..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-900 text-xs text-white placeholder-slate-500 pl-8 pr-3 py-1.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center space-x-2 text-xs">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                filterTab === 'all'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              All SDMs ({activeSdms.length})
            </button>

            <button
              onClick={() => setFilterTab('registered')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all flex items-center gap-1 ${
                filterTab === 'registered'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              <CheckCircle className="w-3 h-3 text-emerald-400" /> Registered Accounts ({registeredCount})
            </button>

            {portfolioCount > 0 && (
              <button
                onClick={() => setFilterTab('portfolio')}
                className={`px-3 py-1 rounded-lg font-semibold transition-all flex items-center gap-1 ${
                  filterTab === 'portfolio'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                <Building2 className="w-3 h-3 text-amber-400" /> Portfolio SDMs ({portfolioCount})
              </button>
            )}
          </div>

          <div className="overflow-x-auto max-h-[520px] border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-900 text-cyan-300 font-bold sticky top-0 border-b border-slate-800 z-10">
                <tr>
                  <th className="p-3">SDM Manager Name</th>
                  <th className="p-3">Username</th>
                  <th className="p-3">Status / Role</th>
                  <th className="p-3 text-center">Assigned Sites</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredSdms.map((sdm) => (
                  <tr key={sdm.id} className="hover:bg-slate-900/50 transition-all">
                    <td className="p-3">
                      <div className="font-bold text-white">{sdm.full_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{sdm.email}</div>
                    </td>

                    <td className="p-3 font-mono text-cyan-300 font-semibold">
                      @{sdm.username}
                    </td>

                    <td className="p-3">
                      {sdm.is_superuser ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Super Admin
                        </span>
                      ) : sdm.is_registered ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 w-fit">
                          <Check className="w-3 h-3" /> Registered User
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1 w-fit">
                          <Building2 className="w-3 h-3 text-cyan-400" /> Portfolio SDM
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-900 text-cyan-300 border border-slate-700">
                        {sdm.assigned_sites || 0} Sites
                      </span>
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleQuickAssignState(sdm)}
                          className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-[10px] rounded-lg shadow flex items-center gap-1 transition-all"
                          title={`Assign a State Territory to ${sdm.full_name}`}
                        >
                          <MapPin className="w-3 h-3 text-amber-400" /> Assign State
                        </button>

                        {!sdm.is_registered && !sdm.is_superuser ? (
                          <button
                            onClick={() => handleQuickRegister(sdm)}
                            className="px-2.5 py-1 bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-[10px] rounded-lg shadow flex items-center gap-1"
                          >
                            <UserPlus className="w-3 h-3" /> Register Account
                          </button>
                        ) : (
                          <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 pl-1">
                            <CheckCircle className="w-3 h-3" /> Active
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredSdms.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 space-y-2">
                      <p>{loading ? 'Loading SDM accounts directory...' : 'No SDM accounts found matching query.'}</p>
                      {!loading && sdms.length > 0 && (
                        <button
                          onClick={() => { setSearch(''); setFilterTab('all'); }}
                          className="px-3 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 font-bold text-xs rounded-lg transition-all"
                        >
                          Clear Search & Show All {sdms.length} SDMs
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
