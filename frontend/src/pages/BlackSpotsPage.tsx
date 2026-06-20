import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import {
  Crosshair, AlertTriangle, Skull, TrendingUp, MapPin, Shield, Activity, ChevronRight, ChevronDown, Database
} from 'lucide-react';

interface BlackSpotsPageProps {
  geoData: any;
  blackspotData: any;
  onFetchBlackspots: () => void;
}

export default function BlackSpotsPage({ geoData, blackspotData, onFetchBlackspots }: BlackSpotsPageProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [districts, setDistricts] = useState<any[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('All');

  // Fetch districts on mount
  React.useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3080'}/api/data/districts`)
      .then(res => res.json())
      .then(data => setDistricts(data))
      .catch(console.error);
  }, []);

  // Compute stats from geoData (which has black spot flags on each segment)
  const stats = useMemo(() => {
    if (!geoData?.features) return { total: 0, mortkCount: 0, mlCount: 0, totalFatalities: 0, totalAccidents: 0, byClass: [], topSpots: [] };

    const features = geoData.features;
    let mortkCount = 0, mlCount = 0, totalFatalities = 0, totalAccidents = 0;
    const classMap: Record<string, { count: number; fatalities: number }> = {};
    const spots: any[] = [];

    features.forEach((f: any) => {
      const p = f.properties;
      if (p.is_black_spot) {
        mortkCount++;
        totalFatalities += (p.bs_fatality_count || 0);
        totalAccidents += (p.bs_accident_count || 0);
        spots.push(p);
      }
      if (p.blackspot_probability > 0.5) mlCount++;
    });

    // Top black spots sorted by fatalities
    const topSpots = spots
      .sort((a, b) => (b.bs_fatality_count || 0) - (a.bs_fatality_count || 0))
      .slice(0, 15);

    return { total: features.length, mortkCount, mlCount, totalFatalities, totalAccidents, topSpots };
  }, [geoData]);

  const filteredSpots = useMemo(() => {
    const list = stats.topSpots || [];
    if (selectedDistrict === 'All') return list;
    return (geoData?.features || [])
      .map((f: any) => f.properties)
      .filter((p: any) => p.is_black_spot && p.district_id === parseInt(selectedDistrict, 10))
      .sort((a: any, b: any) => (b.bs_fatality_count || 0) - (a.bs_fatality_count || 0))
      .slice(0, 15);
  }, [stats.topSpots, geoData?.features, selectedDistrict]);

  // ML probability distribution — single O(n) pass instead of 10× filter loops
  const mlDistribution = useMemo(() => {
    if (!geoData?.features) return [];
    const buckets = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const counts = new Array(buckets.length).fill(0);
    geoData.features.forEach((f: any) => {
      const prob = f.properties.blackspot_probability || 0;
      const idx = Math.min(Math.floor(prob * 10), buckets.length - 1);
      counts[idx]++;
    });
    return buckets.map((b, i) => ({
      range: `${Math.round(b * 100)}-${Math.round((b + 0.1) * 100)}%`,
      count: counts[i]
    }));
  }, [geoData]);

  const pieData = [
    { name: 'MoRTH Black Spots', value: stats.mortkCount, color: '#ef4444' },
    { name: 'ML Predicted', value: Math.max(0, stats.mlCount - stats.mortkCount), color: '#f59e0b' },
    { name: 'Safe Segments', value: stats.total - Math.max(stats.mortkCount, stats.mlCount), color: '#10b981' },
  ];

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
          <h1 className="text-3xl font-extrabold text-text-main tracking-tight flex items-center gap-3">
            <div className="bg-red-500/15 p-2.5 rounded-xl">
              <Crosshair className="w-7 h-7 text-red-400" />
            </div>
            MoRTH Black Spot Analysis
          </h1>
          <p className="text-sm text-text-muted mt-2">
            Identifies hazardous locations per MoRTH criteria: ≥5 accidents OR ≥10 fatalities within 500m over 3 years
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-danger text-xs px-3 py-1.5">MoRTH Compliant</span>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="stat-card card-danger">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-danger/15 p-2.5 rounded-xl">
              <Crosshair className="w-5 h-5 text-red-400" />
            </div>
            <span className="text-xs font-bold text-text-dim uppercase tracking-widest">Black Spots</span>
          </div>
          <p className="text-4xl font-black text-text-main tracking-tighter">{stats.mortkCount}</p>
          <p className="text-xs text-red-400 font-semibold mt-2">MoRTH criteria confirmed</p>
        </div>

        <div className="stat-card card-warning">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-warning/15 p-2.5 rounded-xl">
              <Activity className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-xs font-bold text-text-dim uppercase tracking-widest">ML Predicted</span>
          </div>
          <p className="text-4xl font-black text-text-main tracking-tighter">{stats.mlCount}</p>
          <p className="text-xs text-amber-400 font-semibold mt-2">GBM probability &gt; 50%</p>
        </div>

        <div className="stat-card card-danger">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-danger/15 p-2.5 rounded-xl">
              <Skull className="w-5 h-5 text-red-400" />
            </div>
            <span className="text-xs font-bold text-text-dim uppercase tracking-widest">Total Fatalities</span>
          </div>
          <p className="text-4xl font-black text-text-main tracking-tighter">{stats.totalFatalities}</p>
          <p className="text-xs text-red-400 font-semibold mt-2">In black spot zones</p>
        </div>

        <div className="stat-card card-primary">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-primary/15 p-2.5 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-xs font-bold text-text-dim uppercase tracking-widest">Total Crashes</span>
          </div>
          <p className="text-4xl font-black text-text-main tracking-tighter">{stats.totalAccidents}</p>
          <p className="text-xs text-blue-400 font-semibold mt-2">Within 500m buffer</p>
        </div>
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ML Probability Distribution */}
        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-red-400" /> ML Crash Probability Distribution
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mlDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis dataKey="range" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a2236', border: '1px solid #334155',
                    borderRadius: '12px', color: '#f1f5f9'
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={28}>
                  {mlDistribution.map((entry, idx) => (
                    <Cell key={idx} fill={idx >= 5 ? '#ef4444' : idx >= 3 ? '#f59e0b' : '#10b981'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Classification Pie */}
        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-400" /> Segment Classification
          </h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={80}
                  paddingAngle={3} dataKey="value" stroke="none"
                >
                  {pieData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a2236', border: '1px solid #334155',
                    borderRadius: '12px', color: '#f1f5f9'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-3">
            {pieData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }}></span>
                <span className="text-text-muted">{item.name}</span>
                <span className="text-text-main font-bold ml-auto">{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Info Row: MoRTH Criteria & Data Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-400" /> MoRTH Black Spot Criteria
          </h3>
          <div className="bg-surface-alt rounded-xl p-5 font-mono text-sm text-text-muted border border-border">
            <span className="text-red-400 font-bold">Black Spot</span> = (
            <span className="text-amber-400">Accidents</span> ≥ 5 within 500m over 3 years)
            <span className="text-text-dim mx-2">OR</span>
            (<span className="text-red-400">Fatalities</span> ≥ 10 within 500m over 3 years)
          </div>
          <p className="text-xs text-text-dim mt-3">
            As per Ministry of Road Transport & Highways (MoRTH) guidelines for identification of accident black spots on National Highways.
            The ML model uses a <span className="text-violet-400 font-bold">Gradient Boosted Trees</span> classifier for proactive prediction.
          </p>
        </motion.div>

        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-4 flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" /> Data Sources
          </h3>
          <ul className="space-y-3 text-sm text-text-muted">
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <div>
                <span className="font-bold text-text-main">Police FIRs / RADMS:</span> Provides raw accident records, including severity (fatal, serious, minor) and geospatial coordinates.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <div>
                <span className="font-bold text-text-main">Road Network Data:</span> From OpenStreetMap and municipal records (lane count, speed limits, curvature) used for ML feature extraction.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <div>
                <span className="font-bold text-text-main">Temporal Aggregation:</span> The system uses a rolling 3-year window from the current date to aggregate accident metrics within a 500m radius of segment centroids.
              </div>
            </li>
          </ul>
        </motion.div>
      </div>

      {/* Top Black Spots Table */}
      <motion.div variants={itemVariants} className="glass-panel p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-red-400" /> Ranked Black Spots
          </h3>
          <div className="flex items-center gap-3">
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="bg-surface border border-border text-text-main rounded-xl px-4 py-2 text-sm font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
            >
              <option value="All">All Districts</option>
              {districts.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <span className="badge badge-danger">{stats.mortkCount} identified</span>
          </div>
        </div>

        {filteredSpots.length === 0 ? (
          <div className="text-center py-12 text-text-dim">
            <Crosshair className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm font-semibold">No black spots detected in current dataset</p>
            <p className="text-xs mt-1">Run the analytics pipeline to analyze crash clusters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Rank</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Segment</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Accidents</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Fatalities</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">ML Prob.</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredSpots.map((spot: any, idx: number) => (
                  <tr
                    key={spot.id}
                    className="border-b border-border/50 hover:bg-surface-hover transition-colors cursor-pointer"
                    onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                  >
                    <td className="py-3 px-4 font-bold text-text-main">{idx + 1}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-red-400" />
                        <div>
                          <div className="font-bold text-text-main">{spot.road_name || 'Unnamed Road'}</div>
                          <div className="text-[10px] text-text-dim font-mono">ID: {spot.id} {spot.district_name ? `· ${spot.district_name}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-amber-400">{spot.bs_accident_count || 0}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-red-400">{spot.bs_fatality_count || 0}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="progress-track w-16">
                          <div className="progress-bar" style={{
                            width: `${(spot.blackspot_probability || 0) * 100}%`,
                            backgroundColor: spot.blackspot_probability > 0.7 ? '#ef4444' : spot.blackspot_probability > 0.4 ? '#f59e0b' : '#10b981'
                          }}></div>
                        </div>
                        <span className="text-xs font-bold text-text-muted">{((spot.blackspot_probability || 0) * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {spot.is_black_spot ? (
                        <span className="badge badge-danger text-[10px]">BLACK SPOT</span>
                      ) : (
                        <span className="badge badge-success text-[10px]">SAFE</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
