import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  Layers, ChevronRight, AlertTriangle, Gauge, Building2, Route, Database
} from 'lucide-react';

interface CategoriesPageProps {
  geoData: any;
  districts: any[];
  selectedDistrict: string;
  onDistrictChange: (districtId: string) => void;
  onNavigate: (page: string) => void;
}

const ROAD_CLASS_CONFIG: Record<string, { label: string; icon: any; color: string; gradient: string }> = {
  'Highway': { label: 'National Highways', icon: Route, color: '#ef4444', gradient: 'from-red-500/20 to-transparent' },
  'Arterial': { label: 'Arterial Roads', icon: Building2, color: '#f59e0b', gradient: 'from-amber-500/20 to-transparent' },
  'Local': { label: 'Local Streets', icon: Layers, color: '#3b82f6', gradient: 'from-blue-500/20 to-transparent' },
};

const RISK_CATEGORIES = ['Critical Risk', 'High Risk', 'Moderate Risk', 'Low Risk'] as const;

const RISK_COLORS: Record<string, string> = {
  'Critical Risk': '#ef4444',
  'High Risk': '#f59e0b',
  'Moderate Risk': '#eab308',
  'Low Risk': '#10b981',
};

export default function CategoriesPage({
  geoData,
  districts,
  selectedDistrict,
  onDistrictChange,
  onNavigate
}: CategoriesPageProps) {
  const [activeClass, setActiveClass] = useState<string | null>(null);
  const [dbCategories, setDbCategories] = useState<any[]>([]);

  // Fetch db category stats when selected district changes
  React.useEffect(() => {
    let url = `${import.meta.env.VITE_API_URL || 'http://localhost:3080'}/api/data/segments/by-category`;
    if (selectedDistrict !== 'All') {
      url += `?districtId=${selectedDistrict}`;
    }
    fetch(url)
      .then(res => res.json())
      .then(data => setDbCategories(data.categories || []))
      .catch(console.error);
  }, [selectedDistrict]);

  // Parse geoData into categories (used for top dangerous segments list only)
  const categoryData = useMemo(() => {
    if (!geoData || !geoData.features) return {};

    const categories: Record<string, any[]> = { 'Highway': [], 'Arterial': [], 'Local': [] };

    geoData.features.forEach((f: any) => {
      const rc = (f.properties.road_class || '').toLowerCase();
      let roadClass = 'Local';
      if (['trunk', 'trunk_link', 'motorway', 'motorway_link'].includes(rc)) {
        roadClass = 'Highway';
      } else if (['primary', 'primary_link'].includes(rc)) {
        roadClass = 'Arterial';
      }

      if (categories[roadClass]) {
        categories[roadClass].push(f);
      }
    });

    return categories;
  }, [geoData]);

  // Pre-compute risk category counts in a single O(n) pass from db statistics
  const riskCounts = useMemo((): Record<string, number> => {
    const counts: Record<string, number> = {
      'Critical Risk': 0,
      'High Risk': 0,
      'Moderate Risk': 0,
      'Low Risk': 0
    };
    dbCategories.forEach((c: any) => {
      counts['Critical Risk'] += c.critical_count || 0;
      counts['High Risk'] += c.high_count || 0;
      counts['Moderate Risk'] += c.moderate_count || 0;
      counts['Low Risk'] += c.low_count || 0;
    });
    return counts;
  }, [dbCategories]);

  const totalDbSegments = useMemo(() => {
    return dbCategories.reduce((acc, c) => acc + (c.segment_count || 0), 0);
  }, [dbCategories]);

  const filteredSegments = useMemo(() => {
    const list = categoryData[activeClass || ''] || [];
    if (selectedDistrict === 'All') return list;
    return list.filter((s: any) => s.properties.district_id === parseInt(selectedDistrict, 10));
  }, [categoryData, activeClass, selectedDistrict]);

  const getStats = (segments: any[]) => {
    if (!segments.length) return { count: 0, avgPi: 0, maxPi: 0, riskDist: {} as Record<string, number> };
    const pis = segments.map(s => s.properties.pi || 0);
    const avgPi = (pis.reduce((a: number, b: number) => a + b, 0) / pis.length).toFixed(1);
    const maxPi = Math.max(...pis);

    const riskDist: Record<string, number> = {};
    RISK_CATEGORIES.forEach(cat => { riskDist[cat] = 0; });
    segments.forEach(s => {
      const cat = s.properties.category || 'Low Risk';
      if (riskDist[cat] !== undefined) riskDist[cat]++;
    });

    return { count: segments.length, avgPi, maxPi, riskDist };
  };

  const containerVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-8 space-y-8 max-w-[1600px] mx-auto"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-text-main tracking-tight">Categories</h1>
          <p className="text-sm text-text-muted mt-1">Road segments separated by classification and risk level</p>
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
        </div>
      </motion.div>

      {/* Road Class Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Object.entries(ROAD_CLASS_CONFIG).map(([classKey, config]) => {
          const dbClassData = dbCategories.find((c: any) => c.road_class === classKey);
          const count = dbClassData?.segment_count || 0;
          const avgPi = dbClassData?.avg_pi || 0;
          const maxPi = dbClassData?.max_pi || 0;

          const stats = {
            count,
            avgPi,
            maxPi,
            riskDist: {
              'Critical Risk': dbClassData?.critical_count || 0,
              'High Risk': dbClassData?.high_count || 0,
              'Moderate Risk': dbClassData?.moderate_count || 0,
              'Low Risk': dbClassData?.low_count || 0,
            }
          };
          const Icon = config.icon;
          const isActive = activeClass === classKey;

          return (
            <motion.div
              key={classKey}
              whileHover={{ y: -4 }}
              onClick={() => setActiveClass(isActive ? null : classKey)}
              className={`glass-panel-hover cursor-pointer overflow-hidden relative ${isActive ? 'ring-2 ring-primary/50' : ''}`}
            >
              {/* Gradient accent */}
              <div className={`absolute inset-0 bg-gradient-to-b ${config.gradient} pointer-events-none`} />

              <div className="relative p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl" style={{ background: `${config.color}20` }}>
                      <Icon className="w-5 h-5" style={{ color: config.color }} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-text-main">{config.label}</h3>
                      <p className="text-xs text-text-dim">{classKey} class roads</p>
                    </div>
                  </div>
                  <ChevronRight className={`w-5 h-5 text-text-dim transition-transform ${isActive ? 'rotate-90' : ''}`} />
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-2xl font-black text-text-main">{stats.count}</p>
                    <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Segments</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-text-main">{stats.avgPi}</p>
                    <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Avg PI</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-text-main">{stats.maxPi}</p>
                    <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Max PI</p>
                  </div>
                </div>

                {/* Risk Distribution Bar */}
                <div>
                  <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest mb-2">Risk Distribution</p>
                  <div className="flex rounded-full overflow-hidden h-2.5 bg-surface-alt">
                    {RISK_CATEGORIES.map(cat => {
                      const count = stats.riskDist?.[cat] || 0;
                      const pct = stats.count > 0 ? (count / stats.count) * 100 : 0;
                      return (
                        <div
                          key={cat}
                          className="h-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: RISK_COLORS[cat] }}
                          title={`${cat}: ${count}`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex gap-3 mt-2">
                    {RISK_CATEGORIES.map(cat => (
                      <span key={cat} className="flex items-center gap-1 text-[10px] text-text-dim">
                        <span className="w-2 h-2 rounded-full" style={{ background: RISK_COLORS[cat] }}></span>
                        {stats.riskDist?.[cat] || 0}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Expanded Category Detail */}
      {activeClass && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="glass-panel p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-primary" />
              Top Dangerous Segments — {ROAD_CLASS_CONFIG[activeClass]?.label}
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Road Name / Segment ID</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Priority Index</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Risk Level</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Speed Limit</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Accident Score</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Speed Score</th>
                </tr>
              </thead>
              <tbody>
                {filteredSegments
                  .sort((a: any, b: any) => (b.properties.pi || 0) - (a.properties.pi || 0))
                  .slice(0, 10)
                  .map((seg: any, idx: number) => (
                    <tr key={idx} className="border-b border-border/50 hover:bg-surface-alt/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-text-main">{seg.properties.road_name || 'Unnamed Road'}</div>
                        <div className="text-[10px] text-text-dim font-mono">ID: {seg.properties.id} {seg.properties.district_name ? `· ${seg.properties.district_name}` : ''}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-lg font-black text-text-main">{seg.properties.pi || '—'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`badge ${
                          seg.properties.color === 'Red' ? 'badge-danger' :
                          seg.properties.color === 'Orange' ? 'badge-warning' :
                          seg.properties.color === 'Yellow' ? 'badge-warning' :
                          'badge-success'
                        }`}>
                          {seg.properties.category || 'Unknown'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-text-muted font-medium">{seg.properties.speed_limit} km/h</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="progress-track w-20">
                            <div className="progress-bar bg-red-500" style={{ width: `${seg.properties.scores?.accident || 0}%` }}></div>
                          </div>
                          <span className="text-xs font-bold text-text-muted">{seg.properties.scores?.accident || 0}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="progress-track w-20">
                            <div className="progress-bar bg-amber-500" style={{ width: `${seg.properties.scores?.speed || 0}%` }}></div>
                          </div>
                          <span className="text-xs font-bold text-text-muted">{seg.properties.scores?.speed || 0}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {filteredSegments.length === 0 && (
            <div className="text-center py-12 text-text-dim">
              <Gauge className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No segments found in this category</p>
              <p className="text-xs mt-1">Try ingesting road data first</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Risk Level Breakdown */}
      <motion.div variants={itemVariants}>
        <h2 className="text-xl font-bold text-text-main mb-5">Risk Level Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {RISK_CATEGORIES.map(cat => {
            const count = riskCounts[cat] || 0;
            const total = totalDbSegments || 1;
            const pct = ((count / total) * 100).toFixed(1);
            const color = RISK_COLORS[cat];

            return (
              <div key={cat} className="glass-panel p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
                <p className="text-xs font-bold text-text-dim uppercase tracking-widest mb-2">{cat}</p>
                <p className="text-3xl font-black text-text-main">{count}</p>
                <p className="text-xs text-text-muted mt-1">{pct}% of all segments</p>
                <div className="progress-track mt-3">
                  <div className="progress-bar" style={{ width: `${pct}%`, backgroundColor: color }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Data Sources Overview */}
      <motion.div variants={itemVariants} className="glass-panel p-6">
        <h3 className="text-sm font-bold text-text-main mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" /> Data Sources & Classification
        </h3>
        <ul className="space-y-3 text-sm text-text-muted">
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <div>
              <span className="font-bold text-text-main">Road Classification Inference:</span> Segments are categorized into Highway, Arterial, or Local roads heuristically using speed limit thresholds (e.g., ≥60km/h for highways) derived from OpenStreetMap tags (`maxspeed`).
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <div>
              <span className="font-bold text-text-main">Risk Segmentation:</span> Segments are continuously subdivided into 100m to 1km logical chunks to maintain granular analysis. Risk categories (Critical to Low) are determined by the composite Priority Index (PI).
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <div>
              <span className="font-bold text-text-main">Analytics Engine:</span> The background `srsms_analytics` pipeline continually recalculates PI scores using AHP-weighted inputs from the database whenever new data is ingested.
            </div>
          </li>
        </ul>
      </motion.div>
    </motion.div>
  );
}
