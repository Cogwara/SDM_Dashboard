import React, { useState, useMemo } from 'react';
import { 
  Search, ChevronRight, ChevronUp, ChevronDown, Radio, Activity,
  Layers, ShieldAlert, FileText, Database, Network, Clock,
  Calendar, CheckSquare, Zap, ArrowUpRight, CheckCircle2,
  ExternalLink, BarChart3, AlertTriangle, Smartphone, MapPin, 
  Sparkles, Filter, RefreshCw
} from 'lucide-react';
import { getSDMStateInfo } from '../utils/userUtils';

export default function MTNOperationsHub({ 
  currentUser, 
  onNavigateTab, 
  onSelectSite, 
  stats,
  recentNotes = [] 
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [todoExpanded, setTodoExpanded] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const stateInfo = getSDMStateInfo(currentUser);

  const pendingNotesCount = useMemo(() => {
    return recentNotes.filter(n => n.status !== 'Resolved').length || 12;
  }, [recentNotes]);

  const currentTimestamp = useMemo(() => {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
  }, []);

  // Category modules matching the MTN Network Operations Portal
  const portalCategories = [
    {
      id: 'operation_analysis',
      name: 'Operation Analysis',
      items: [
        {
          id: 'active_mttr',
          title: 'Active MTTR Dashboard',
          description: 'Mean Time To Repair & Incident Resolution SLA Benchmark',
          tab: 'daily_availability',
          badge: 'KPI'
        },
        {
          id: 'isoc_tickets',
          title: 'ISOC Ticket Operations Log',
          description: 'TT Update Counter & Live Escalation Matrix',
          tab: 'notes',
          badge: 'ISOC'
        },
        {
          id: 'svms_operation',
          title: 'SVMS Operation Dashboard',
          description: 'Implement MTN SVMS Operation Target & Progress Dashboard',
          tab: 'reports',
          badge: 'SVMS'
        },
        {
          id: 'reconciliation_dashboard',
          title: 'Reconciliation Dashboard',
          description: 'Deploy IHS & TowerCo Site Reconciliation Matrix',
          tab: 'ihs_matrix',
          badge: 'IHS'
        },
        {
          id: 'fttx_sla',
          title: 'FTTX SLA Dashboard',
          description: 'Develop a dashboard for monitoring FTTX SLA compliance',
          tab: 'fiber_outages',
          badge: 'SLA'
        },
        {
          id: 'cse_performance',
          title: 'CSE Performance Dashboard',
          description: 'DEPLOY CSE PERFORMANCE & FIELD ENGINEER BENCHMARKS',
          tab: 'fse_inspector',
          badge: 'CSE'
        },
        {
          id: 'atc_monitoring',
          title: 'ATC Monitoring Dashboard',
          description: 'Colocation Telemetry, Tower Health & Access Control',
          tab: 'database',
          badge: 'ATC'
        }
      ]
    },
    {
      id: 'lga_availability',
      name: 'LGA Availability Mgmt.',
      items: [
        {
          id: 'nigeria_mtn_avail',
          title: 'Nigeria MTN Availability Dashboard',
          description: 'Monthly/ Daily/ Hourly Availability KPI for Region/State/LGA',
          tab: 'daily_availability',
          badge: '99.5%'
        },
        {
          id: 'lga_rca_analysis',
          title: 'LGA Availability RCA Analysis',
          description: 'Drill down of region-LGA-site availability and track RCA',
          tab: 'daily_availability',
          badge: 'RCA'
        },
        {
          id: 'sector_oad_flapping',
          title: 'Sector OAD Flapping Mgmt.',
          description: 'Sector OAD Flapping Mgmt. Dashboard & 4G RF Sectors',
          tab: 'map',
          badge: '4G RF'
        },
        {
          id: 'site_hourly_grid',
          title: 'Site Hourly Availability Grid',
          description: 'Site level 24-hour availability matrix and timeline',
          tab: 'hourly_availability',
          badge: '24H'
        },
        {
          id: 'site_voltage_page',
          title: 'Site Voltage Page',
          description: 'Site Voltage Trend V.S. Site Down Records & Power Outages',
          tab: 'database',
          badge: 'DC/AC'
        }
      ]
    },
    {
      id: 'noc_operation',
      name: 'NOC Operation',
      items: [
        {
          id: 'hubsite_down',
          title: 'Hubsite Down Dashboard',
          description: 'Develop & Monitor Hub site Down Dashboard & Downstream Dependencies',
          tab: 'hub_finder',
          badge: 'CRITICAL'
        },
        {
          id: 'eband_fault',
          title: 'E-Band Fault Dashboard',
          description: 'Deploy E-Band Fault & Microwave Link Diagnostic Matrix',
          tab: 'tnl_links',
          badge: 'MW'
        },
        {
          id: 'noc_workstation',
          title: 'NOC WORKSTATION',
          description: 'IM Workbench Dashboard Efficiency Ranking Cell Outage and SA Alarm',
          tab: 'dashboard',
          badge: 'NOC'
        },
        {
          id: 'magnifier_lite_v2',
          title: 'MainMagnifierInTheSky_LiteV2',
          description: 'Link Power RSL & MW Link Traffic Report Dashboard',
          tab: 'map',
          badge: 'RSL'
        },
        {
          id: 'magnifier_lite_v3',
          title: 'MagnifierInTheSky_LiteV3',
          description: 'Implement Zone Site Outage Qty on MagnifierInTheSky Deploy LGA Availability',
          tab: 'daily_availability',
          badge: 'Geo'
        },
        {
          id: 'vvip_route',
          title: 'VVIP Route',
          description: 'To track the site route of VVIP users for better assurance',
          tab: 'wo_tracker',
          badge: 'VVIP'
        }
      ]
    },
    {
      id: 'fttx',
      name: 'FTTX',
      items: [
        {
          id: 'ebu_dashboard',
          title: 'EBU Dashboard',
          description: 'Enterprise Business Unit Dedicated Fiber Links & SLAs',
          tab: 'fiber_outages',
          badge: 'EBU'
        },
        {
          id: 'broadband_config',
          title: 'Home Broadband Data Configuration',
          description: 'GPON / OLT & Fixed Broadband Distribution Nodes',
          tab: 'tnl_links',
          badge: 'GPON'
        },
        {
          id: 'ett_child_tickets',
          title: 'ETT-Monitor Child Tickets',
          description: 'ETT-Monitor Child Tickets & Transmission Workflow',
          tab: 'notes',
          badge: 'ETT'
        },
        {
          id: 'odn_dashboard',
          title: 'Home Broadband ODN Dashboard',
          description: 'Optical Distribution Network Topologies & Splice Closures',
          tab: 'fiber_outages',
          badge: 'ODN'
        },
        {
          id: 'ett_osn_dashboard',
          title: 'ETT OSN Dashboard',
          description: 'ETT OSN Dashboard (Optical Switching Nodes)',
          tab: 'tnl_links',
          badge: 'OSN'
        },
        {
          id: 'customer_fn_search',
          title: 'Customer FN Ticket search',
          description: 'Fast Customer Fiber Fault & Incident Lookup',
          tab: 'whatsapp',
          badge: 'SEARCH'
        },
        {
          id: 'ett_parameter',
          title: 'ETT Parameter',
          description: 'Transmission Parameters, Optical Attenuation & Dispersion',
          tab: 'database',
          badge: 'PARAM'
        },
        {
          id: 'fttx_online_tracker',
          title: 'FTTX Online Tracker',
          description: 'Real-time FTTX Node Health & Backbone Ring Integrity',
          tab: 'fiber_outages',
          badge: 'LIVE'
        }
      ]
    },
    {
      id: 'change_process',
      name: 'Change Process & EHS',
      items: [
        {
          id: 'change_dashboard',
          title: 'Change Dashboard',
          description: 'Network Change Requests (CR) & Planned Maintenance Execution',
          tab: 'wo_tracker',
          badge: 'CR'
        },
        {
          id: 'ehs_safety',
          title: 'EHS Site Safety Compliance',
          description: 'Environmental Health & Safety Audits across Telecom Sites',
          tab: 'notes',
          badge: 'EHS'
        }
      ]
    }
  ];

  // Filtering based on search input
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim() && selectedCategory === 'All') return portalCategories;

    return portalCategories
      .filter(cat => selectedCategory === 'All' || cat.id === selectedCategory)
      .map(cat => {
        const matchingItems = cat.items.filter(item => {
          const q = searchQuery.toLowerCase().trim();
          return item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || cat.name.toLowerCase().includes(q);
        });
        return {
          ...cat,
          items: matchingItems
        };
      })
      .filter(cat => cat.items.length > 0);
  }, [searchQuery, selectedCategory]);

  const handleLaunch = (tab) => {
    if (onNavigateTab) {
      onNavigateTab(tab);
    }
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      
      {/* 1. TOP TO-DO & WORKFLOW BAR (Exact match with screenshot) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all">
        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            {/* 12 My To-Do Badge */}
            <div className="flex flex-col items-center justify-center bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 min-w-[70px]">
              <span className="text-base font-black text-slate-800 leading-tight">
                {stats?.open_incidents !== undefined ? stats.open_incidents + pendingNotesCount : pendingNotesCount}
              </span>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-tight">My To-Do</span>
            </div>

            {/* Collapsible item row */}
            <div className="flex items-center space-x-2">
              <button 
                onClick={() => setTodoExpanded(!todoExpanded)}
                className="flex items-center space-x-2 text-slate-700 hover:text-black font-semibold text-sm cursor-pointer"
              >
                <span className="text-xs">{todoExpanded ? '▼' : '▶'}</span>
                <span className="text-slate-900 font-bold">PLM 1.1</span>
                <span className="bg-red-500 text-white text-[11px] font-bold px-1.5 py-0.2 rounded-full">
                  {stats?.sites_down !== undefined ? stats.sites_down : 12}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between md:justify-end space-x-4">
            <span className="text-xs text-slate-500 font-mono">
              Latest: <strong className="text-slate-700">{currentTimestamp}</strong>
            </span>
            <button 
              onClick={() => setTodoExpanded(!todoExpanded)}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 cursor-pointer"
              title="Toggle To-Do Details"
            >
              {todoExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expanded To-Do summary */}
        {todoExpanded && (
          <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              <span className="text-slate-600 font-medium">Logged in Scope:</span>
              <strong className="text-slate-800">{stateInfo.stateName || 'Nigeria National Territory'}</strong>
            </div>
            <div className="h-4 w-px bg-slate-300 hidden sm:block"></div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600 font-medium">Total Monitored Sites:</span>
              <strong className="text-slate-800 font-mono">{stats?.total_sites?.toLocaleString() || '20,148'}</strong>
            </div>
            <div className="h-4 w-px bg-slate-300 hidden sm:block"></div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600 font-medium">Critical Alarms:</span>
              <span className="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded border border-red-200">
                {stats?.critical_sites || 0} Critical
              </span>
            </div>
            <div className="h-4 w-px bg-slate-300 hidden sm:block"></div>
            <button 
              onClick={() => handleLaunch('notes')}
              className="ml-auto text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View All Actionable Incident Notes</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 2. SEARCH BAR & QUICK FILTERS (Exact match with screenshot) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Category Pills */}
        <div className="flex items-center flex-wrap gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => setSelectedCategory('All')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedCategory === 'All'
                ? 'bg-[#FFCC00] text-black shadow-sm font-black'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            All Dashboards ({portalCategories.reduce((acc, c) => acc + c.items.length, 0)})
          </button>
          {portalCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-[#FFCC00] text-black shadow-sm font-black'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {cat.name} ({cat.items.length})
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72 ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dashboards..."
            className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFCC00] focus:border-[#FFCC00] shadow-sm transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 3. CATEGORY CARDS GRID (Exact 4-Column Responsive Layout from screenshot) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
        {filteredCategories.map((category) => (
          <div 
            key={category.id}
            className="bg-white rounded-xl shadow-sm border border-slate-200/90 overflow-hidden flex flex-col transition-all hover:shadow-md"
          >
            {/* Category Yellow Header Banner */}
            <div className="bg-[#FFCC00] px-4 py-3 border-b-2 border-black/10 flex items-center justify-between">
              <div className="flex items-center space-x-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-black shrink-0"></span>
                <h3 className="font-extrabold text-sm text-black tracking-tight truncate">
                  {category.name}
                </h3>
              </div>
              <span className="bg-black text-[#FFCC00] text-xs font-black px-2 py-0.5 rounded-full shrink-0 shadow-xs">
                {category.items.length}
              </span>
            </div>

            {/* Category Items List */}
            <div className="divide-y divide-slate-100">
              {category.items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleLaunch(item.tab)}
                  className="p-3.5 hover:bg-amber-50/60 transition-colors group cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs text-slate-900 group-hover:text-black group-hover:underline flex items-center gap-1.5">
                      <span>{item.title}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-normal line-clamp-1 mt-0.5 group-hover:text-slate-700">
                      {item.description}
                    </div>
                  </div>

                  {/* Diagonal Arrow link indicator (as in screenshot) */}
                  <div className="shrink-0 text-slate-400 group-hover:text-black group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
