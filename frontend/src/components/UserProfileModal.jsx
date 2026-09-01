import React, { useState, useEffect, useRef } from 'react';
import { 
  User, Camera, Mail, Phone, Building2, Briefcase, MapPin, 
  Shield, Lock, Key, Check, AlertCircle, X, Globe, 
  MessageSquare, Save, RefreshCw, Trash2, Eye, EyeOff, Radio
} from 'lucide-react';
import { fetchUserProfile, updateUserProfile, getMediaUrl } from '../api';

export default function UserProfileModal({ isOpen, onClose, currentUser, onUpdateUser }) {
  if (!isOpen) return null;

  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('details'); // 'details', 'portfolio', 'security'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: '' }

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [department, setDepartment] = useState('');
  const [bio, setBio] = useState('');

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  // Avatar & Photo Preview State
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);

  // Meta details from profile
  const [profileMeta, setProfileMeta] = useState(null);

  // Load Profile from Backend
  const loadProfile = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const data = await fetchUserProfile({
        username: currentUser?.username || currentUser?.full_name,
        user_id: currentUser?.id
      });
      
      setProfileMeta(data);
      setFullName(data.full_name || currentUser?.full_name || '');
      setEmail(data.email || currentUser?.email || '');
      setPhoneNumber(data.phone_number || data.phone || currentUser?.phone || '');
      setWhatsappNumber(data.whatsapp_number || data.phone || '');
      setJobTitle(data.job_title || data.role || '');
      setCompany(data.company || (data.role === 'MTN RDM' ? 'MTN Nigeria Communications Plc' : 'IHS Towers'));
      setDepartment(data.department || 'Network Operations');
      setBio(data.bio || '');
      setAvatarUrl(data.avatar_url || null);
      setAvatarPreview(null);
      setAvatarFile(null);
      setRemoveAvatar(false);
    } catch (err) {
      console.error('Failed to load profile:', err);
      // Fallback to currentUser
      setFullName(currentUser?.full_name || '');
      setEmail(currentUser?.email || '');
      setPhoneNumber(currentUser?.phone || '');
      setWhatsappNumber(currentUser?.phone || '');
      setJobTitle(currentUser?.role || '');
      setCompany(currentUser?.role === 'MTN RDM' ? 'MTN Nigeria Communications Plc' : 'IHS Towers');
      setDepartment('Network Operations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadProfile();
      setActiveTab('details');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [isOpen, currentUser]);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', message: 'Please select a valid image file (JPEG, PNG, WEBP).' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'Image size should be under 5MB.' });
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setRemoveAvatar(false);
    setFeedback(null);
  };

  const handleRemovePhoto = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarUrl(null);
    setRemoveAvatar(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);

    // Validation for password change
    if (newPassword) {
      if (newPassword.length < 6) {
        setFeedback({ type: 'error', message: 'New password must be at least 6 characters long.' });
        setActiveTab('security');
        return;
      }
      if (newPassword !== confirmPassword) {
        setFeedback({ type: 'error', message: 'New password and confirm password do not match.' });
        setActiveTab('security');
        return;
      }
      if (!currentUser?.is_superuser && !currentPassword) {
        setFeedback({ type: 'error', message: 'Please provide your current password to set a new password.' });
        setActiveTab('security');
        return;
      }
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('username', currentUser?.username || '');
      formData.append('full_name', fullName);
      formData.append('email', email);
      formData.append('phone_number', phoneNumber);
      formData.append('whatsapp_number', whatsappNumber);
      formData.append('job_title', jobTitle);
      formData.append('company', company);
      formData.append('department', department);
      formData.append('bio', bio);

      if (avatarFile) {
        formData.append('avatar', avatarFile);
      } else if (removeAvatar) {
        formData.append('remove_avatar', 'true');
      }

      if (newPassword) {
        formData.append('current_password', currentPassword);
        formData.append('new_password', newPassword);
      }

      const res = await updateUserProfile(formData);
      const updatedUser = res.user || res;

      // Update local storage and app state
      const existingStored = JSON.parse(localStorage.getItem('fct_sdm_user') || '{}');
      const mergedUser = {
        ...existingStored,
        ...updatedUser,
        full_name: updatedUser.full_name || fullName,
        avatar_url: updatedUser.avatar_url || (removeAvatar ? null : avatarUrl)
      };
      localStorage.setItem('fct_sdm_user', JSON.stringify(mergedUser));

      if (onUpdateUser) {
        onUpdateUser(mergedUser);
      }

      setFeedback({ type: 'success', message: 'Profile updated successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Refresh metadata
      loadProfile();
    } catch (err) {
      console.error('Update profile error:', err);
      setFeedback({ 
        type: 'error', 
        message: err.response?.data?.error || err.message || 'Failed to save profile changes.' 
      });
    } finally {
      setSaving(false);
    }
  };

  const isRdm = (profileMeta?.role === 'MTN RDM') || (currentUser?.role === 'MTN RDM');
  const isSuperuser = profileMeta?.is_superuser || currentUser?.is_superuser;
  const isFse = (profileMeta?.role === 'SMC FSE Engineer') || (currentUser?.role === 'SMC FSE Engineer');

  const currentDisplayAvatar = avatarPreview || (avatarUrl ? getMediaUrl(avatarUrl) : null);

  const getInitials = (name) => {
    if (!name) return 'SD';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div 
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl shadow-cyan-950/40 overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Banner Header with Role Themed Glow */}
        <div className={`relative h-28 sm:h-32 px-6 pt-6 flex items-start justify-between ${
          isSuperuser
            ? 'bg-gradient-to-r from-amber-950 via-slate-900 to-amber-900/60 border-b border-amber-500/20'
            : isRdm
              ? 'bg-gradient-to-r from-indigo-950 via-purple-950 to-slate-900 border-b border-indigo-500/20'
              : 'bg-gradient-to-r from-cyan-950 via-slate-900 to-blue-950 border-b border-cyan-500/20'
        }`}>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-white">
              {isSuperuser ? <Shield className="w-4 h-4 text-amber-400" /> : isRdm ? <Globe className="w-4 h-4 text-indigo-300" /> : <User className="w-4 h-4 text-cyan-400" />}
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white tracking-wide">
                Account & Operational Profile
              </h2>
              <p className="text-[11px] text-slate-300 font-medium">
                Manage your credentials, direct phone lines, and portfolio details.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile Card Overlay Header */}
        <div className="px-6 -mt-12 sm:-mt-14 pb-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="flex items-end gap-4">
            
            {/* Avatar with Camera Trigger */}
            <div className="relative group">
              <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 shadow-xl flex items-center justify-center font-bold text-xl sm:text-2xl transition-all ${
                isSuperuser 
                  ? 'border-amber-400 bg-amber-950 text-amber-300 shadow-amber-500/20'
                  : isRdm
                    ? 'border-indigo-400 bg-indigo-950 text-indigo-300 shadow-indigo-500/20'
                    : 'border-cyan-400 bg-slate-800 text-cyan-300 shadow-cyan-500/20'
              }`}>
                {currentDisplayAvatar ? (
                  <img 
                    src={currentDisplayAvatar} 
                    alt={fullName} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{getInitials(fullName)}</span>
                )}
              </div>

              {/* Camera Upload Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1.5 -right-1.5 p-1.5 sm:p-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl shadow-lg border border-slate-900 transition-all group-hover:scale-105 cursor-pointer"
                title="Upload Profile Picture"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>

            {/* User Title & Role Badge */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                  {fullName || 'Operational Manager'}
                </h3>
                {isSuperuser ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                    <Shield className="w-2.5 h-2.5" /> Super Admin
                  </span>
                ) : isRdm ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
                    <Globe className="w-2.5 h-2.5" /> MTN RDM
                  </span>
                ) : isFse ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                    <Radio className="w-2.5 h-2.5" /> SMC FSE
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                    <User className="w-2.5 h-2.5" /> SDM Manager
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-400 font-mono">
                @{currentUser?.username || 'user'} • <span className="text-slate-300">{company || 'FCT Telecom'}</span>
              </p>
            </div>
          </div>

          {/* Photo Actions */}
          {currentDisplayAvatar && (
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 self-start sm:self-end px-2 py-1 rounded-lg bg-rose-950/40 border border-rose-800/40 hover:border-rose-700 transition-all cursor-pointer"
            >
              <Trash2 className="w-3 h-3" /> Remove Photo
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'details'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile Details</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('portfolio')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'portfolio'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Territory & Telemetry</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'security'
                ? 'border-amber-400 text-amber-300 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Password & Security</span>
          </button>
        </div>

        {/* Alert Feedback Banner */}
        {feedback && (
          <div className={`mx-6 mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
          }`}>
            {feedback.type === 'success' ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          
          {/* TAB 1: Profile Details */}
          {activeTab === 'details' && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <div>
                  <label className="block text-slate-300 font-semibold mb-1 text-xs">
                    Full Name <span className="text-cyan-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Christian Ogwara"
                      className="w-full bg-slate-950 text-white text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1 text-xs">
                    Email Address <span className="text-cyan-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. ogwara.c@ihstowers.com"
                      className="w-full bg-slate-950 text-white text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1 text-xs">
                    Primary Phone Number (Operational Contact)
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="e.g. 0803-123-4567"
                      className="w-full bg-slate-950 text-white text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Syncs to emergency contact directory across your managed telecom sites.
                  </span>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1 text-xs">
                    WhatsApp Direct Number
                  </label>
                  <div className="relative">
                    <MessageSquare className="absolute left-3 top-2.5 w-3.5 h-3.5 text-emerald-400" />
                    <input
                      type="text"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      placeholder="e.g. +2348031234567"
                      className="w-full bg-slate-950 text-white text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1 text-xs">
                    Job Title / Designation
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="e.g. Senior State Delivery Manager"
                      className="w-full bg-slate-950 text-white text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1 text-xs">
                    Organization / Company
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="e.g. MTN Nigeria / IHS Towers"
                      className="w-full bg-slate-950 text-white text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 text-xs">
                  Operational Bio & Scope Summary
                </label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Brief note on operational responsibilities, SLA priorities, or escalation coverage..."
                  className="w-full bg-slate-950 text-white text-xs p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          )}

          {/* TAB 2: Territory & Telemetry */}
          {activeTab === 'portfolio' && (
            <div className="space-y-4 animate-fade-in text-xs">
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400 font-semibold">Assigned Role</span>
                  <span className="font-bold text-white px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/40">
                    {profileMeta?.role || currentUser?.role || 'SDM Manager'}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400 font-semibold">Total Assigned Telecom Sites</span>
                  <span className="font-mono font-bold text-cyan-300 text-sm">
                    {(profileMeta?.assigned_sites_count || currentUser?.assigned_sites_count || 0).toLocaleString()} Sites
                  </span>
                </div>

                <div className="space-y-1.5">
                  <span className="text-slate-400 font-semibold block">Assigned State Territories:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {profileMeta?.assigned_states?.length > 0 ? (
                      profileMeta.assigned_states.map((st, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-900 text-indigo-200 border border-indigo-500/30 font-bold font-mono text-[11px]">
                          {st}
                        </span>
                      ))
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-slate-900 text-cyan-300 border border-slate-700 font-mono">
                        {profileMeta?.state || currentUser?.state || 'FCT'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 font-mono">
                  <span>Username: @{currentUser?.username}</span>
                  <span>User ID: #{profileMeta?.id || currentUser?.id}</span>
                </div>
              </div>

              <div className="p-3 bg-indigo-950/30 rounded-xl border border-indigo-500/20 text-[11px] text-indigo-300 space-y-1">
                <span className="font-bold block flex items-center gap-1">
                  <Shield className="w-3 h-3 text-indigo-400" /> State Assignment Notice
                </span>
                <p className="text-slate-400">
                  State territory and multi-state portfolio reassignments are governed by the Super Administrator via the <b>SDM User Admin</b> console.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: Password & Security */}
          {activeTab === 'security' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-3 bg-amber-950/30 rounded-xl border border-amber-500/20 text-[11px] text-amber-300 space-y-1">
                <span className="font-bold flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-400" /> Security Credential Management
                </span>
                <p className="text-slate-400">
                  To change your account password, enter your current password followed by your new password (minimum 6 characters).
                </p>
              </div>

              {!currentUser?.is_superuser && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1 text-xs">
                    Current Password
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type={showPasswords ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="w-full bg-slate-950 text-white text-xs pl-9 pr-10 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1 text-xs">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type={showPasswords ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full bg-slate-950 text-white text-xs pl-9 pr-10 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1 text-xs">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type={showPasswords ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full bg-slate-950 text-white text-xs pl-9 pr-10 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="text-slate-400 hover:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showPasswords ? 'Hide Passwords' : 'Show Passwords'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className={`px-5 py-2 text-white font-bold text-xs rounded-xl shadow-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                isRdm
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-600/30'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-cyan-600/30'
              }`}
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{saving ? 'Saving Profile...' : 'Save Changes'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
