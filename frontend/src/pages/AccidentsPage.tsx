import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, CircleMarker, ZoomControl, Popup } from 'react-leaflet';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import {
  AlertTriangle, Skull, HeartPulse, ShieldCheck, Calendar, Filter, MapPin, Database
} from 'lucide-react';

interface AccidentsPageProps {
  accidentsData: any;
  onFetchAccidents: (districtId?: number) => void;
}

const SEVERITY_CONFIG: Record<string, { color: string; icon: any; bgClass: string }> = {
  'Fatal': { color: '#ef4444', icon: Skull, bgClass: 'bg-danger/15' },
  'Serious': { color: '#f59e0b', icon: HeartPulse, bgClass: 'bg-warning/15' },
  'Minor': { color: '#3b82f6', icon: ShieldCheck, bgClass: 'bg-primary/15' },
  'Damage Only': { color: '#64748b', icon: ShieldCheck, bgClass: 'bg-surface-alt' },
};

export default function AccidentsPage({ accidentsData, onFetchAccidents }: AccidentsPageProps) {
  const [severityFilter, setSeverityFilter] = useState<string>('All');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const [districts, setDistricts] = useState<any[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('All');

  const [selectedAccident, setSelectedAccident] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any[]>([]);
  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string>('');

  React.useEffect(() => {
    if (!selectedAccident) {
      setAnalysis([]);
      return;
    }

    const fetchAnalysis = async () => {
      setLoadingAnalysis(true);
      setAnalysisError('');
      try {
        const id = selectedAccident.properties.id;
        const res = await fetch(`/api/data/accidents/${id}/analysis`);
        if (!res.ok) {
          throw new Error('Failed to fetch accident analysis');
        }
        const data = await res.json();
        setAnalysis(data.corrections || []);
      } catch (err: any) {
        console.error(err);
        setAnalysisError(err.message || 'Error loading analysis');
      } finally {
        setLoadingAnalysis(false);
      }
    };

    fetchAnalysis();
  }, [selectedAccident]);

  // Fetch districts on mount
  React.useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3080'}/api/data/districts`)
      .then(res => res.json())
      .then(data => setDistricts(data))
      .catch(console.error);
  }, []);

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedDistrict(val);
    if (val === 'All') {
      onFetchAccidents();
    } else {
      onFetchAccidents(parseInt(val, 10));
    }
  };

  // Trigger fetch on mount if no data
  React.useEffect(() => {
    if (!accidentsData) onFetchAccidents();
  }, []);

  // Reset to page 0 when filter changes
  React.useEffect(() => { setPage(0); }, [severityFilter]);

  const accidents = accidentsData?.features || [];

  const filteredAccidents = useMemo(() => {
    if (severityFilter === 'All') return accidents;
    return accidents.filter((f: any) => f.properties.severity === severityFilter);
  }, [accidents, severityFilter]);

  // Paginated slice for the table (map shows all filtered markers up to 500 max)
  const pagedAccidents = useMemo(() => {
    return filteredAccidents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [filteredAccidents, page]);

  const totalPages = Math.ceil(filteredAccidents.length / PAGE_SIZE);

  // Stats
  const stats = useMemo(() => {
    if (accidentsData?.summary) {
      return {
        total: accidentsData.summary.total,
        fatal: accidentsData.summary.fatal,
        serious: accidentsData.summary.serious,
        minor: accidentsData.summary.minor,
        totalFatalities: accidentsData.summary.totalFatalities
      };
    }
    const total = accidents.length;
    const fatal = accidents.filter((f: any) => f.properties.severity === 'Fatal').length;
    const serious = accidents.filter((f: any) => f.properties.severity === 'Serious').length;
    const minor = accidents.filter((f: any) => f.properties.severity === 'Minor').length;
    const totalFatalities = accidents.reduce((sum: number, f: any) => sum + (f.properties.fatalities || 0), 0);

    return { total, fatal, serious, minor, totalFatalities };
  }, [accidents, accidentsData?.summary]);

  const pieData = [
    { name: 'Fatal', value: stats.fatal },
    { name: 'Serious', value: stats.serious },
    { name: 'Minor', value: stats.minor },
  ].filter(d => d.value > 0);

  const pieColors = ['#ef4444', '#f59e0b', '#3b82f6'];

  const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

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
          <h1 className="text-3xl font-extrabold text-text-main tracking-tight">Accidents</h1>
          <p className="text-sm text-text-muted mt-1">Crash history analysis and severity mapping</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={selectedDistrict}
            onChange={handleDistrictChange}
            className="bg-surface border border-border text-text-main rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
          >
            <option value="All">All Districts</option>
            {districts.map((d: any) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <div className="tab-group">
            {['All', 'Fatal', 'Serious', 'Minor'].map(filter => (
              <button
                key={filter}
                onClick={() => setSeverityFilter(filter)}
                className={`tab-item ${severityFilter === filter ? 'active' : ''}`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* KPI Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="stat-card card-danger">
          <AlertTriangle className="w-5 h-5 text-red-400 mb-2" />
          <p className="text-3xl font-black text-text-main">{stats.total}</p>
          <p className="text-xs font-bold text-text-dim uppercase tracking-widest mt-1">Total Accidents</p>
        </div>
        <div className="stat-card card-danger">
          <Skull className="w-5 h-5 text-red-400 mb-2" />
          <p className="text-3xl font-black text-text-main">{stats.fatal}</p>
          <p className="text-xs font-bold text-text-dim uppercase tracking-widest mt-1">Fatal Crashes</p>
        </div>
        <div className="stat-card card-warning">
          <HeartPulse className="w-5 h-5 text-amber-400 mb-2" />
          <p className="text-3xl font-black text-text-main">{stats.totalFatalities}</p>
          <p className="text-xs font-bold text-text-dim uppercase tracking-widest mt-1">Total Fatalities</p>
        </div>
        <div className="stat-card card-primary">
          <Calendar className="w-5 h-5 text-blue-400 mb-2" />
          <p className="text-3xl font-black text-text-main">{stats.serious}</p>
          <p className="text-xs font-bold text-text-dim uppercase tracking-widest mt-1">Serious Injuries</p>
        </div>
      </motion.div>

      {/* Map + Pie Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Accident Map */}
        <motion.div variants={itemVariants} className="lg:col-span-2 glass-panel overflow-hidden" style={{ height: '420px' }}>
          <MapContainer center={[10.8505, 76.2711]} zoom={7} className="w-full h-full" zoomControl={false}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap contributors'
            />
            <ZoomControl position="bottomright" />

            {filteredAccidents.slice(0, 500).map((f: any) => {
              const coords = f.geometry.coordinates;
              const config = SEVERITY_CONFIG[f.properties.severity] || SEVERITY_CONFIG['Minor'];
              const isSelected = selectedAccident?.properties.id === f.properties.id;
              
              return (
                <CircleMarker
                  key={f.properties.id || f.properties.id}
                  center={[coords[1], coords[0]]}
                  radius={f.properties.severity === 'Fatal' ? 12 : f.properties.severity === 'Serious' ? 8 : 5}
                  fillColor={config.color}
                  color={isSelected ? '#fff' : "rgba(255,255,255,0.3)"}
                  weight={isSelected ? 3 : 1}
                  fillOpacity={isSelected ? 1 : 0.7}
                  eventHandlers={{
                    click: () => setSelectedAccident(f)
                  }}
                >
                  <Popup minWidth={350} maxWidth={400} eventHandlers={{ remove: () => setSelectedAccident(null) }}>
                    <div className="p-1 max-h-[300px] overflow-y-auto">
                      <div className="flex justify-between items-start mb-2 border-b pb-2">
                        <div>
                          <h3 className="font-bold text-red-500 mb-1 flex items-center gap-1.5">
                            <config.icon className="w-4 h-4" /> {f.properties.severity} Accident
                          </h3>
                          <p className="text-xs mb-1"><strong>ID:</strong> {f.properties.id}</p>

                        </div>
                        <div className="text-right">
                          {f.properties.fatalities > 0 && <p className="text-xs mb-1 text-red-500 font-bold">{f.properties.fatalities} Fatalities</p>}
                          {f.properties.injuries > 0 && <p className="text-xs mb-1 text-amber-500 font-bold">{f.properties.injuries} Injuries</p>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                        {f.properties.vehicle_type && <div><strong className="text-slate-400">Vehicle:</strong> {f.properties.vehicle_type}</div>}
                        {f.properties.collision_type && <div><strong className="text-slate-400">Type:</strong> {f.properties.collision_type}</div>}
                      </div>

                      {/* AI Analysis Section */}
                      {isSelected && (
                        <div className="mt-4 border-t pt-3">
                          <h4 className="text-xs font-bold text-blue-500 mb-2 flex items-center gap-1">
                            <Database className="w-3 h-3" /> AI Accident Mitigation Analysis
                          </h4>
                          {loadingAnalysis ? (
                            <div className="space-y-2">
                              <div className="h-3 bg-slate-200 animate-pulse rounded w-3/4"></div>
                              <div className="h-3 bg-slate-200 animate-pulse rounded w-full"></div>
                              <div className="h-3 bg-slate-200 animate-pulse rounded w-5/6"></div>
                            </div>
                          ) : analysisError ? (
                            <p className="text-xs text-red-400">{analysisError}</p>
                          ) : analysis.length > 0 ? (
                            <div className="space-y-2">
                              {analysis.map((corr, idx) => (
                                <div key={idx} className="bg-slate-50 p-2 rounded border border-slate-100">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">{corr.category}</span>
                                    <span className="text-[9px] text-slate-500 font-medium">Impact: {corr.impact}</span>
                                  </div>
                                  <p className="text-xs text-slate-700 leading-tight">{corr.action}</p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </motion.div>

        {/* Severity Breakdown */}
        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-primary" /> Severity Breakdown
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={pieColors[idx]} />
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

          <div className="space-y-3 mt-4">
            {pieData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: pieColors[idx] }}></span>
                  <span className="text-sm text-text-muted font-medium">{item.name}</span>
                </div>
                <span className="text-sm font-bold text-text-main">{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Data Table */}
      <motion.div variants={itemVariants} className="glass-panel p-6">
        <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary" /> Accident Records
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">ID</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Severity</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Fatalities</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Location</th>
              </tr>
            </thead>
            <tbody>
              {pagedAccidents.map((f: any) => {
                const config = SEVERITY_CONFIG[f.properties.severity] || SEVERITY_CONFIG['Minor'];
                return (
                  <tr key={f.properties.id} className="border-b border-border/50 hover:bg-surface-alt/50 transition-colors">
                    <td className="py-3 px-4 font-mono text-text-main font-semibold">{f.properties.id}</td>
                    <td className="py-3 px-4">
                      <span className={`badge ${
                        f.properties.severity === 'Fatal' ? 'badge-danger' :
                        f.properties.severity === 'Serious' ? 'badge-warning' :
                        'badge-primary'
                      }`}>
                        {f.properties.severity}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-text-main font-bold">{f.properties.fatalities}</td>
                    <td className="py-3 px-4 text-text-muted text-xs font-mono">
                      [{f.geometry.coordinates[1].toFixed(4)}, {f.geometry.coordinates[0].toFixed(4)}]
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredAccidents.length === 0 && (
          <div className="text-center py-12 text-text-dim">
            <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No accident records found</p>
            <p className="text-xs mt-1">Ingest data or change the severity filter</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <span className="text-xs text-text-dim">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredAccidents.length)} of {filteredAccidents.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Data Sources Overview */}
      <motion.div variants={itemVariants} className="glass-panel p-6">
        <h3 className="text-sm font-bold text-text-main mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" /> Data Sources & Collection
        </h3>
        <ul className="space-y-3 text-sm text-text-muted">
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <div>
              <span className="font-bold text-text-main">First Information Reports (FIRs):</span> Core accident records are ingested from official police FIRs, providing foundational data on location, severity, and involved parties.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <div>
              <span className="font-bold text-text-main">Road Accident Data Management System (RADMS):</span> Standardized national and state-level crash databases provide supplementary verification and historical trend mapping.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <div>
              <span className="font-bold text-text-main">Geospatial Processing:</span> Raw address coordinates are geocoded and snapped to the nearest road network segments (using PostGIS/OpenStreetMap) to associate crashes with physical infrastructure.
            </div>
          </li>
        </ul>
      </motion.div>
    </motion.div>
  );
}
