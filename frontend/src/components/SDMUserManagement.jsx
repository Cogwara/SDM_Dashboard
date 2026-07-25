import React, { useState, useEffect } from 'react';
import { UserPlus, Shield, User, Mail, Phone, Lock, CheckCircle, RefreshCw, Radio, Search, Check, AlertCircle, Building2, MapPin, Globe, Layers, Send } from 'lucide-react';
import { fetchSDMList, registerSDM, assignStateToSDM, fetchAvailableStates } from '../api';

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
      const [sdmListRes, statesRes] = await Promise.all([
        fetchSDMList(),
        fetchAvailableStates()
      ]);
      const list = Array.isArray(sdmListRes) ? sdmListRes : sdmListRes?.results || [];
      setSdms(list);
      setAvailableStates(Array.isArray(statesRes) ? statesRes : []);
    } catch (e) {
      console.error('Failed to fetch SDMs list:', e);
      setMsg({ type: 'error', text: `Unable to connect to SDM directory server (${e.message || 'Network Error'}). Ensure backend server is running.` });
      setSdms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSdms();
  }, []);

  const handleAssignStateSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!assignSdmName || !assignStateName) {
      setAssignMsg({ type: 'error', text: 'Please select both an SDM Manager and a Target State.' });
      return;
    }

    setAssigning(true);
    setAssignMsg({ type: '', text: '' });

    try {
      const res = await assignStateToSDM(assignSdmName, assignStateName);
      setAssignMsg({ type: 'success', text: res.message || `Successfully assigned ${assignStateName} to ${assignSdmName}!` });
      loadSdms();
    } catch (err) {
      setAssignMsg({ type: 'error', text: err.response?.data?.error || 'Failed to assign state to SDM.' });
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

  const registeredCount = sdms.filter(s => s.is_registered).length;
  const portfolioCount = sdms.filter(s => !s.is_registered).length;

  const filteredSdms = sdms.filter(s => {
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
            <b className="text-cyan-300 font-mono text-sm">{sdms.length}</b>
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

            {/* Card 2: Assign State Portfolio to SDM */}
            <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-3">
              <div className="border-b border-amber-500/20 pb-2.5">
                <h2 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-400" /> Assign State Territory Portfolio to SDM
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Assign an entire State to an SDM. All telecom sites in that State will automatically belong to the selected SDM.
                </p>
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
                    className="w-full bg-slate-900 text-white p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-500 font-medium text-xs"
                  >
                    <option value="">-- Choose SDM Manager --</option>
                    {sdms.map((s) => (
                      <option key={s.id} value={s.full_name}>
                        {s.full_name} (@{s.username}) &bull; {s.assigned_sites || 0} Sites
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1 text-[11px]">Select Target State Territory</label>
                  <select
                    required
                    value={assignStateName}
                    onChange={(e) => setAssignStateName(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-500 font-medium text-xs"
                  >
                    <option value="">-- Choose State Territory --</option>
                    {availableStates.map((st) => (
                      <option key={st.state} value={st.state}>
                        {st.state} ({st.count.toLocaleString()} sites)
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={assigning}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-1.5 transition-all mt-1"
                >
                  <Globe className="w-4 h-4" />
                  <span>{assigning ? 'Reassigning Sites...' : 'Assign State Portfolio to SDM'}</span>
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
                State Delivery Managers Directory ({sdms.length})
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
              All SDMs ({sdms.length})
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
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      {loading ? 'Loading SDM accounts directory...' : 'No SDM accounts found matching query.'}
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
