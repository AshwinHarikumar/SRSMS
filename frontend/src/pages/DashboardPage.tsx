import React from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, CartesianGrid, YAxis, PieChart, Pie, Cell } from 'recharts';
import {
  AlertTriangle, Users, TrendingUp, Info, ChevronRight, ShieldAlert, Zap,
  MapPin, Activity, Crosshair, Star, PersonStanding, Database, CloudRain, Wind, Eye
} from 'lucide-react';

interface DashboardPageProps {
  stats: any;
  districts: any[];
  selectedDistrict: string;
  onDistrictChange: (districtId: string) => void;
  onNavigate: (page: string) => void;
}

const RISK_COLORS = ['#ef4444', '#f59e0b', '#eab308', '#10b981'];
const RISK_LABELS = ['Critical', 'High', 'Moderate', 'Low'];

export default function DashboardPage({ stats, districts = [], selectedDistrict = 'All', onDistrictChange, onNavigate }: DashboardPageProps) {
  const pieData = [
    { name: 'Critical', value: Number(stats.critical) || 0 },
    { name: 'High', value: Number(stats.high) || 0 },
    { name: 'Moderate', value: Number(stats.moderate) || 0 },
    { name: 'Low', value: Number(stats.low) || 0 },
  ];

  const containerVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-8 space-y-8 max-w-[1600px] mx-auto"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-text-main tracking-tight">Dashboard</h1>
          <p className="text-sm text-text-muted mt-1">Real-time road safety intelligence overview</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedDistrict}
            onChange={(e) => onDistrictChange(e.target.value)}
            className="bg-surface border border-border text-text-main rounded-xl px-4 py-2 text-sm font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
          >
            <option value="All">All Districts</option>
            {districts.map((d: any) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button onClick={() => onNavigate('riskmap')} className="btn-primary flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Open Risk Map
          </button>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="stat-card card-danger group">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-red-500/10 p-3 rounded-xl border border-red-500/20 group-hover:bg-red-500/20 transition-colors shadow-[0_0_15px_rgba(239,68,68,0.15)]">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <span className="text-[11px] font-bold text-red-400/80 uppercase tracking-[0.15em]">Critical Zones</span>
          </div>
          <p className="text-5xl font-black text-text-main tracking-tighter">{stats.critical}</p>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-red-400 font-semibold flex items-center gap-1.5 bg-red-500/10 px-2 py-1 rounded-md">
              <TrendingUp className="w-3.5 h-3.5" /> Immediate intervention
            </p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-red-500/10 rounded-full blur-2xl"></div>
        </div>

        <div className="stat-card card-warning group">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 group-hover:bg-amber-500/20 transition-colors shadow-[0_0_15px_rgba(245,158,11,0.15)]">
              <Users className="w-5 h-5 text-amber-500" />
            </div>
            <span className="text-[11px] font-bold text-amber-400/80 uppercase tracking-[0.15em]">High Risk</span>
          </div>
          <p className="text-5xl font-black text-text-main tracking-tighter">{stats.high}</p>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-amber-400 font-semibold flex items-center gap-1.5 bg-amber-500/10 px-2 py-1 rounded-md">
              <Activity className="w-3.5 h-3.5" /> Monitoring active
            </p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl"></div>
        </div>

        <div className="stat-card group" style={{ borderLeft: '3px solid #dc2626' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-red-600/10 p-3 rounded-xl border border-red-600/20 group-hover:bg-red-600/20 transition-colors shadow-[0_0_15px_rgba(220,38,38,0.15)]">
              <Crosshair className="w-5 h-5 text-red-600" />
            </div>
            <span className="text-[11px] font-bold text-red-500/80 uppercase tracking-[0.15em]">Black Spots</span>
          </div>
          <p className="text-5xl font-black text-text-main tracking-tighter">{stats.black_spots || 0}</p>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-red-500 font-semibold flex items-center gap-1.5 bg-red-600/10 px-2 py-1 rounded-md">
              <Crosshair className="w-3.5 h-3.5" /> MoRTH identified
            </p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-red-600/10 rounded-full blur-2xl"></div>
        </div>

        <div className="stat-card group" style={{ borderLeft: '3px solid #eab308' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-yellow-500/10 p-3 rounded-xl border border-yellow-500/20 group-hover:bg-yellow-500/20 transition-colors shadow-[0_0_15px_rgba(234,179,8,0.15)]">
              <Star className="w-5 h-5 text-yellow-500" />
            </div>
            <span className="text-[11px] font-bold text-yellow-500/80 uppercase tracking-[0.15em]">Avg Star Rating</span>
          </div>
          <p className="text-5xl font-black text-text-main tracking-tighter">{Number(stats.avg_star_rating).toFixed(1) || '0.0'}</p>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-yellow-500 font-semibold flex items-center gap-1.5 bg-yellow-500/10 px-2 py-1 rounded-md">
              <Star className="w-3.5 h-3.5" /> iRAP standard
            </p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-yellow-500/10 rounded-full blur-2xl"></div>
        </div>
      </motion.div>

      {/* Secondary KPI Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="stat-card card-primary">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-primary/15 p-2.5 rounded-xl">
              <ShieldAlert className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-xs font-bold text-text-dim uppercase tracking-widest">Total Segments</span>
          </div>
          <p className="text-4xl font-black text-text-main tracking-tighter">{stats.total_segments || 0}</p>
          <p className="text-xs text-blue-400 font-semibold mt-2 flex items-center gap-1">
            <Zap className="w-3 h-3" /> Across all road classes
          </p>
        </div>

        <div className="stat-card" style={{ borderLeft: '3px solid #06b6d4' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-cyan-500/15 p-2.5 rounded-xl">
              <PersonStanding className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-xs font-bold text-text-dim uppercase tracking-widest">VRU High Risk</span>
          </div>
          <p className="text-4xl font-black text-text-main tracking-tighter">{stats.vru_high_risk || 0}</p>
          <p className="text-xs text-cyan-400 font-semibold mt-2 flex items-center gap-1">
            <PersonStanding className="w-3 h-3" /> Vulnerable road users
          </p>
        </div>

        {/* Live Weather Widget */}
        <div className="stat-card" style={{ borderLeft: '3px solid #3b82f6', background: 'linear-gradient(135deg, #eff6ff, #dbeafe)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-blue-500/15 p-2.5 rounded-xl">
              <CloudRain className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Live Weather Impact</span>
          </div>
          {stats.weather ? (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <p className="text-2xl font-black text-slate-800">{stats.weather.temperature_2m}°C</p>
                <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1"><Wind className="w-3 h-3" /> {stats.weather.wind_speed_10m} km/h</p>
              </div>
              <div>
                <p className="text-2xl font-black text-blue-600">{stats.weather.precipitation}mm</p>
                <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1"><Eye className="w-3 h-3" /> {stats.weather.visibility / 1000} km</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted mt-4">Connecting to Open-Meteo...</p>
          )}
        </div>
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Incident Trends */}
        <motion.div variants={itemVariants} className="lg:col-span-2 glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Incident Trends (YTD)
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{
                    backgroundColor: '#1a2236',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    color: '#f1f5f9'
                  }}
                  itemStyle={{ fontSize: '12px', fontWeight: '600' }}
                  labelStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#f1f5f9' }}
                />
                <Bar dataKey="fatal" stackId="a" fill="#ef4444" radius={[0, 0, 4, 4]} barSize={24} />
                <Bar dataKey="serious" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-6 mt-4 text-xs text-text-muted">
            <span className="flex items-center gap-2"><span className="w-3 h-3 bg-red-500 rounded-sm"></span> Fatal Accidents</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 bg-amber-500 rounded-sm"></span> Serious Injuries</span>
          </div>
        </motion.div>

        {/* Risk Distribution Pie */}
        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary" /> Risk Distribution
          </h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={RISK_COLORS[idx]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a2236',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    color: '#f1f5f9'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {pieData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: RISK_COLORS[idx] }}></span>
                <span className="text-text-muted">{item.name}</span>
                <span className="text-text-main font-bold ml-auto">{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Priority Interventions */}
      <motion.div variants={itemVariants} className="glass-panel p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" /> Priority Interventions
          </h3>
          <span className="badge badge-primary">{stats.recommendations?.length || 0} Active</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(stats.recommendations || []).map((rec: any) => (
            <div
              key={rec.id}
              className="glass-panel-hover p-4 cursor-pointer group"
            >
              <div className="flex justify-between items-start mb-2">
                <p className="text-sm font-bold text-text-main group-hover:text-primary transition-colors">{rec.title}</p>
                <span className="badge badge-accent text-[10px]">{rec.conf}</span>
              </div>
              <p className="text-xs text-text-muted font-medium">{rec.loc}</p>
              <div className="flex items-center gap-1 mt-3 text-xs text-primary font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                View Details <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Data Sources Overview */}
      <motion.div variants={itemVariants} className="glass-panel p-6">
        <h3 className="text-sm font-bold text-text-main mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" /> Platform Data Architecture
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-surface-alt rounded-xl p-4 border border-border">
            <h4 className="text-xs font-bold text-blue-400 mb-2 uppercase tracking-widest">Crash Records</h4>
            <p className="text-xs text-text-muted">Directly ingested from Police FIRs and RADMS containing geospatial coordinates, collision types, and severity metrics.</p>
          </div>
          <div className="bg-surface-alt rounded-xl p-4 border border-border">
            <h4 className="text-xs font-bold text-amber-400 mb-2 uppercase tracking-widest">Infrastructure</h4>
            <p className="text-xs text-text-muted">Derived from OpenStreetMap (OSM) and iRAP survey data capturing lane width, surface condition, and safety guardrails.</p>
          </div>
          <div className="bg-surface-alt rounded-xl p-4 border border-border">
            <h4 className="text-xs font-bold text-emerald-400 mb-2 uppercase tracking-widest">Traffic Flow</h4>
            <p className="text-xs text-text-muted">Aggregated from municipal sensors and telematics providing vehicle volumes, speed percentiles, and two-wheeler mix.</p>
          </div>
          <div className="bg-surface-alt rounded-xl p-4 border border-border">
            <h4 className="text-xs font-bold text-violet-400 mb-2 uppercase tracking-widest">AHP Profiles</h4>
            <p className="text-xs text-text-muted">System weights configured via Expert Elicitation (Saaty methodology) stored as actively managed profiles in the database.</p>
          </div>
          <div className="bg-surface-alt rounded-xl p-4 border border-blue-500/30 bg-blue-500/5">
            <h4 className="text-xs font-bold text-blue-400 mb-2 uppercase tracking-widest">Environmental</h4>
            <p className="text-xs text-text-muted">Live Open-Meteo APIs feeding real-time precipitation, wind, visibility, and high-res road geometry gradients.</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
