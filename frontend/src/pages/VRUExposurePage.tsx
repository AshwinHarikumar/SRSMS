import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import {
  PersonStanding, School, Building2, AlertTriangle, Shield, Activity,
  Footprints, Bike, ChevronRight, Database
} from 'lucide-react';

interface VRUExposurePageProps {
  geoData: any;
}

const VRU_COLORS: Record<string, string> = {
  'Critical VRU Risk': '#ef4444',
  'High VRU Risk': '#f59e0b',
  'Moderate VRU Risk': '#eab308',
  'Low VRU Risk': '#10b981',
  'Minimal VRU Risk': '#10b981',
  'Very High': '#ef4444',
  'High': '#f59e0b',
  'Moderate': '#eab308',
  'Low': '#10b981',
};

export default function VRUExposurePage({ geoData }: VRUExposurePageProps) {
  const [selectedSegment, setSelectedSegment] = useState<any>(null);
  const [districts, setDistricts] = useState<any[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('All');

  // Fetch districts on mount
  React.useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3080'}/api/data/districts`)
      .then(res => res.json())
      .then(data => setDistricts(data))
      .catch(console.error);
  }, []);

  const stats = useMemo(() => {
    if (!geoData?.features) return {
      totalSegments: 0, veryHigh: 0, high: 0, moderate: 0, low: 0,
      avgScore: 0, topExposed: [], distribution: [], categoryData: []
    };

    const features = geoData.features;
    let veryHigh = 0, high = 0, moderate = 0, low = 0;
    let totalScore = 0;
    const exposed: any[] = [];

    features.forEach((f: any) => {
      const p = f.properties;
      const score = p.vru_exposure_score || 0;
      totalScore += score;

      if (p.vru_risk_category === 'Critical VRU Risk' || p.vru_risk_category === 'Very High') veryHigh++;
      else if (p.vru_risk_category === 'High VRU Risk' || p.vru_risk_category === 'High') high++;
      else if (p.vru_risk_category === 'Moderate VRU Risk' || p.vru_risk_category === 'Moderate') moderate++;
      else low++;

      if (score > 0) {
        exposed.push(p);
      }
    });

    const topExposed = exposed
      .sort((a, b) => (b.vru_exposure_score || 0) - (a.vru_exposure_score || 0))
      .slice(0, 10);

    // Score distribution histogram — single O(n) pass
    const buckets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
    const histCounts = new Array(buckets.length).fill(0);
    features.forEach((f: any) => {
      const s = f.properties.vru_exposure_score || 0;
      const idx = Math.min(Math.floor(s / 10), buckets.length - 1);
      histCounts[idx]++;
    });
    const distribution = buckets.map((b, i) => ({
      range: `${b}-${b + 10}`,
      count: histCounts[i]
    }));

    const categoryData = [
      { name: 'Critical', value: veryHigh, color: '#ef4444' },
      { name: 'High', value: high, color: '#f59e0b' },
      { name: 'Moderate', value: moderate, color: '#eab308' },
      { name: 'Low', value: low, color: '#10b981' },
    ];

    return {
      totalSegments: features.length,
      veryHigh, high, moderate, low,
      avgScore: features.length > 0 ? (totalScore / features.length).toFixed(1) : 0,
      topExposed,
      distribution,
      categoryData
    };
  }, [geoData]);

  const filteredExposed = useMemo(() => {
    const list = stats.topExposed || [];
    if (selectedDistrict === 'All') return list;
    return (geoData?.features || [])
      .map((f: any) => f.properties)
      .filter((p: any) => p.vru_exposure_score > 0 && p.district_id === parseInt(selectedDistrict, 10))
      .sort((a: any, b: any) => (b.vru_exposure_score || 0) - (a.vru_exposure_score || 0))
      .slice(0, 10);
  }, [stats.topExposed, geoData?.features, selectedDistrict]);

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
      <motion.div variants={itemVariants}>
        <h1 className="text-3xl font-extrabold text-text-main tracking-tight flex items-center gap-3">
          <div className="bg-amber-500/15 p-2.5 rounded-xl">
            <PersonStanding className="w-7 h-7 text-amber-400" />
          </div>
          VRU Exposure Index
        </h1>
        <p className="text-sm text-text-muted mt-2">
          Vulnerable Road User analysis — pedestrians, cyclists, and two-wheeler exposure near schools, hospitals, and high-traffic zones
        </p>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="stat-card card-danger">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-danger/15 p-2 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Very High</span>
          </div>
          <p className="text-3xl font-black text-text-main tracking-tighter">{stats.veryHigh}</p>
        </div>

        <div className="stat-card card-warning">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-warning/15 p-2 rounded-xl">
              <Footprints className="w-4 h-4 text-amber-400" />
            </div>
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">High</span>
          </div>
          <p className="text-3xl font-black text-text-main tracking-tighter">{stats.high}</p>
        </div>

        <div className="stat-card" style={{ borderLeft: '3px solid #eab308' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-yellow-500/15 p-2 rounded-xl">
              <Bike className="w-4 h-4 text-yellow-400" />
            </div>
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Moderate</span>
          </div>
          <p className="text-3xl font-black text-text-main tracking-tighter">{stats.moderate}</p>
        </div>

        <div className="stat-card card-success">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-success/15 p-2 rounded-xl">
              <Shield className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Low</span>
          </div>
          <p className="text-3xl font-black text-text-main tracking-tighter">{stats.low}</p>
        </div>

        <div className="stat-card card-primary">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-primary/15 p-2 rounded-xl">
              <Activity className="w-4 h-4 text-blue-400" />
            </div>
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Avg Score</span>
          </div>
          <p className="text-3xl font-black text-text-main tracking-tighter">{stats.avgScore}</p>
        </div>
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Exposure Distribution */}
        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" /> VRU Exposure Score Distribution
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.distribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis dataKey="range" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a2236', border: '1px solid #334155',
                    borderRadius: '12px', color: '#f1f5f9'
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={28} fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Category Breakdown */}
        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
            <PersonStanding className="w-4 h-4 text-amber-400" /> Risk Category Breakdown
          </h3>
          <div className="space-y-4">
            {stats.categoryData.map((cat) => (
              <div key={cat.name}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }}></span>
                    <span className="text-sm font-bold text-text-main">{cat.name}</span>
                  </div>
                  <span className="text-lg font-black text-text-main">{cat.value}</span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-bar"
                    style={{
                      width: `${stats.totalSegments > 0 ? (cat.value / stats.totalSegments) * 100 : 0}%`,
                      backgroundColor: cat.color
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Info Row: VRU Formula & Data Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-4 flex items-center gap-2">
            <PersonStanding className="w-4 h-4 text-amber-400" /> VRU Exposure Score Formula
          </h3>
          <div className="bg-surface-alt rounded-xl p-5 font-mono text-sm text-text-muted border border-border">
            <span className="text-amber-400 font-bold">VRU Score</span> = (
            <span className="text-red-400">Schools</span> × 3.0 +
            <span className="text-blue-400"> Hospitals</span> × 2.5 +
            <span className="text-violet-400"> Other POIs</span> × 1.0 +
            <span className="text-emerald-400"> 2W Mix</span> +
            <span className="text-cyan-400"> Ped Volume</span>)
            × <span className="text-red-300">Sidewalk Penalty</span>
            × <span className="text-red-300">Crossing Penalty</span>
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-xs text-text-dim">
            <span>🏫 Schools within 200m</span>
            <span>🏥 Hospitals within 200m</span>
            <span>🛵 Two-wheeler traffic mix</span>
            <span>🚶 Estimated pedestrian volume</span>
            <span>⚠️ No sidewalk = ×1.5 penalty</span>
            <span>⚠️ No crossing = ×1.3 penalty</span>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-4 flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" /> Data Sources
          </h3>
          <ul className="space-y-3 text-sm text-text-muted">
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <div>
                <span className="font-bold text-text-main">OpenStreetMap (OSM) / Municipal GIS:</span> Used to extract geospatial Points of Interest (POIs) such as schools and hospitals, identifying zones with high vulnerable road user generation.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <div>
                <span className="font-bold text-text-main">Infrastructure Surveys:</span> Field surveys or satellite imagery used to determine the presence of sidewalks and pedestrian crossings.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <div>
                <span className="font-bold text-text-main">Traffic Cameras / Sensors:</span> Used to estimate vehicle volumes and calculate the two-wheeler mix percentage.
              </div>
            </li>
          </ul>
        </motion.div>
      </div>

      {/* Top Exposed Segments Table */}
      <motion.div variants={itemVariants} className="glass-panel p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> Top 10 Most Exposed Segments
          </h3>
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
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">#</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Segment / Road Name</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">VRU Score</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Category</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Sidewalk</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Star</th>
              </tr>
            </thead>
            <tbody>
              {filteredExposed.map((seg: any, idx: number) => (
                <tr
                  key={seg.id}
                  className="border-b border-border/50 hover:bg-surface-hover transition-colors cursor-pointer"
                  onClick={() => setSelectedSegment(selectedSegment?.id === seg.id ? null : seg)}
                >
                  <td className="py-3 px-4 font-bold text-text-main">{idx + 1}</td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-text-main">{seg.road_name || 'Unnamed Road'}</div>
                    <div className="text-[10px] text-text-dim font-mono">ID: {seg.id} {seg.district_name ? `· ${seg.district_name}` : ''}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="progress-track w-16">
                        <div className="progress-bar" style={{
                          width: `${seg.vru_exposure_score}%`,
                          backgroundColor: VRU_COLORS[seg.vru_risk_category] || '#64748b'
                        }}></div>
                      </div>
                      <span className="font-bold text-text-main">{seg.vru_exposure_score}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase" style={{
                      backgroundColor: `${VRU_COLORS[seg.vru_risk_category] || '#64748b'}20`,
                      color: VRU_COLORS[seg.vru_risk_category] || '#64748b'
                    }}>
                      {seg.vru_risk_category}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {seg.star_sub_scores?.infrastructure > 50 ? '✅' : '❌'}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-amber-400 font-bold">{'★'.repeat(seg.star_rating || 0)}{'☆'.repeat(5 - (seg.star_rating || 0))}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
}
