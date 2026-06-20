import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
         RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell } from 'recharts';
import {
  Star, Shield, TrendingUp, Activity, Zap, ChevronRight, Eye, Database
} from 'lucide-react';

interface StarRatingPageProps {
  geoData: any;
}

const STAR_COLORS: Record<number, string> = {
  1: '#dc2626',
  2: '#ea580c',
  3: '#eab308',
  4: '#22c55e',
  5: '#059669',
};

const STAR_LABELS: Record<number, string> = {
  1: 'Critical',
  2: 'Poor',
  3: 'Average',
  4: 'Good',
  5: 'Safe',
};

export default function StarRatingPage({ geoData }: StarRatingPageProps) {
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
      distribution: [], avgStar: 0, avgSRS: 0, total: 0,
      byClass: {}, worst: [], best: []
    };

    const features = geoData.features;
    const starCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalStar = 0, totalSRS = 0;
    const classMap: Record<string, { total: number; stars: number; count: number }> = {};

    features.forEach((f: any) => {
      const p = f.properties;
      const star = p.star_rating || 0;
      const srs = p.srs_score || 0;

      if (star >= 1 && star <= 5) {
        starCounts[star]++;
        totalStar += star;
        totalSRS += srs;
      }
    });

    const counted = Object.values(starCounts).reduce((a, b) => a + b, 0);
    const distribution = [1, 2, 3, 4, 5].map(star => ({
      star: `${star}★`,
      label: STAR_LABELS[star],
      count: starCounts[star],
      percentage: counted > 0 ? ((starCounts[star] / counted) * 100).toFixed(1) : '0',
      color: STAR_COLORS[star]
    }));

    // Worst and best segments
    const sorted = [...features]
      .filter((f: any) => f.properties.star_rating)
      .sort((a: any, b: any) => (a.properties.srs_score || 0) - (b.properties.srs_score || 0));

    const worst = sorted.slice(0, 8).map((f: any) => f.properties);
    const best = sorted.slice(-5).reverse().map((f: any) => f.properties);

    return {
      distribution,
      avgStar: counted > 0 ? (totalStar / counted).toFixed(1) : 0,
      avgSRS: counted > 0 ? (totalSRS / counted).toFixed(1) : 0,
      total: counted,
      worst,
      best
    };
  }, [geoData]);

  const filteredWorst = useMemo(() => {
    const list = stats.worst || [];
    if (selectedDistrict === 'All') return list;
    return (geoData?.features || [])
      .map((f: any) => f.properties)
      .filter((p: any) => p.star_rating && p.district_id === parseInt(selectedDistrict, 10))
      .sort((a: any, b: any) => (a.srs_score || 0) - (b.srs_score || 0))
      .slice(0, 8);
  }, [stats.worst, geoData?.features, selectedDistrict]);

  // Radar data for selected segment
  const radarData = useMemo(() => {
    if (!selectedSegment) return [];
    const sub = selectedSegment.star_sub_scores || {};
    return [
      { subject: 'Infrastructure', score: sub.infrastructure || 0 },
      { subject: 'Speed Mgmt', score: sub.speed_management || 0 },
      { subject: 'Crash History', score: sub.crash_history || 0 },
      { subject: 'VRU Protection', score: sub.vru_protection || 0 },
    ];
  }, [selectedSegment]);

  const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  const renderStars = (rating: number, size: string = 'text-base') => {
    return (
      <span className={size}>
        {[1, 2, 3, 4, 5].map(i => (
          <span key={i} style={{ color: i <= rating ? STAR_COLORS[rating] : '#334155' }}>★</span>
        ))}
      </span>
    );
  };

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
            <Star className="w-7 h-7 text-amber-400" />
          </div>
          Road Safety Star Rating
        </h1>
        <p className="text-sm text-text-muted mt-2">
          iRAP-inspired 1★ to 5★ safety rating based on infrastructure, speed management, crash history, and VRU protection
        </p>
      </motion.div>

      {/* KPI Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="glass-panel p-6 text-center">
          <p className="text-xs font-bold text-text-dim uppercase tracking-widest mb-3">Average Star Rating</p>
          <div className="flex items-center justify-center gap-3">
            <p className="text-5xl font-black text-text-main tracking-tighter">{stats.avgStar}</p>
            <div className="text-2xl">{renderStars(Math.round(Number(stats.avgStar)), 'text-2xl')}</div>
          </div>
        </div>

        <div className="glass-panel p-6 text-center">
          <p className="text-xs font-bold text-text-dim uppercase tracking-widest mb-3">Average SRS Score</p>
          <p className="text-5xl font-black text-text-main tracking-tighter">{stats.avgSRS}</p>
          <p className="text-xs text-text-muted mt-2">Safety Rating Score (0-100)</p>
        </div>

        <div className="glass-panel p-6 text-center">
          <p className="text-xs font-bold text-text-dim uppercase tracking-widest mb-3">Total Rated Segments</p>
          <p className="text-5xl font-black text-text-main tracking-tighter">{stats.total}</p>
          <p className="text-xs text-text-muted mt-2">Across all road classes</p>
        </div>
      </motion.div>

      {/* Star Distribution */}
      <motion.div variants={itemVariants} className="glass-panel p-6">
        <h3 className="text-sm font-bold text-text-main mb-6 flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400" /> Star Rating Distribution
        </h3>
        <div className="space-y-4">
          {stats.distribution.map((item) => (
            <div key={item.star} className="flex items-center gap-4">
              <div className="w-20 flex items-center gap-2">
                <span className="text-lg font-bold" style={{ color: item.color }}>{item.star}</span>
                <span className="text-xs text-text-dim">{item.label}</span>
              </div>
              <div className="flex-1">
                <div className="progress-track h-6 rounded-lg">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.percentage}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-lg flex items-center justify-end pr-2"
                    style={{ backgroundColor: item.color }}
                  >
                    {Number(item.percentage) > 8 && (
                      <span className="text-[10px] font-bold text-white">{item.count}</span>
                    )}
                  </motion.div>
                </div>
              </div>
              <div className="w-16 text-right">
                <span className="text-sm font-bold text-text-main">{item.percentage}%</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Two Column: Worst Segments + Detail Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Worst Rated Segments */}
        <motion.div variants={itemVariants} className="glass-panel p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
              <Shield className="w-4 h-4 text-red-400" /> Lowest Rated Segments
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
          <div className="space-y-3">
            {filteredWorst.map((seg: any, idx: number) => (
              <div
                key={seg.id}
                className="glass-panel-hover p-4 cursor-pointer group"
                onClick={() => setSelectedSegment(selectedSegment?.id === seg.id ? null : seg)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-text-dim w-6">#{idx + 1}</span>
                    <div>
                      <p className="text-sm font-bold text-text-main group-hover:text-primary transition-colors">
                        {seg.road_name || 'Unnamed Road'}
                      </p>
                      <p className="text-xs text-text-dim">ID: {seg.id} {seg.district_name ? `· ${seg.district_name}` : ''} · {seg.star_category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-text-muted">SRS: {seg.srs_score}</span>
                    {renderStars(seg.star_rating)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Selected Segment Radar */}
        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-400" /> Segment Detail — Sub-Score Radar
          </h3>
          {selectedSegment ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-lg font-bold text-text-main">{selectedSegment.road_name || 'Unnamed Road'}</p>
                  <p className="text-xs text-text-dim">ID: {selectedSegment.id} {selectedSegment.district_name ? `· ${selectedSegment.district_name}` : ''} · {selectedSegment.star_category}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl">{renderStars(selectedSegment.star_rating, 'text-2xl')}</div>
                  <p className="text-xs text-text-muted mt-1">SRS: {selectedSegment.srs_score}</p>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#1e293b" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Radar
                      name="Sub-Score"
                      dataKey="score"
                      stroke={STAR_COLORS[selectedSegment.star_rating] || '#3b82f6'}
                      fill={STAR_COLORS[selectedSegment.star_rating] || '#3b82f6'}
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Sub-scores breakdown */}
              <div className="space-y-3 mt-4">
                {radarData.map(item => (
                  <div key={item.subject}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-semibold text-text-muted">{item.subject}</span>
                      <span className="text-sm font-bold text-text-main">{item.score.toFixed(1)}</span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-bar"
                        style={{
                          width: `${item.score}%`,
                          backgroundColor: item.score >= 60 ? '#10b981' : item.score >= 40 ? '#eab308' : '#ef4444'
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-text-dim">
              <Eye className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-sm font-semibold">Select a segment to view details</p>
              <p className="text-xs mt-1">Click any segment from the list</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Info Row: Methodology & Data Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Star Rating Methodology */}
        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" /> Star Rating Methodology (iRAP-Inspired)
          </h3>
          <div className="bg-surface-alt rounded-xl p-5 font-mono text-sm text-text-muted border border-border">
            <span className="text-amber-400 font-bold">SRS</span> = (
            <span className="text-emerald-400">w₁</span> × <span className="text-blue-400">Infrastructure</span>) + (
            <span className="text-emerald-400">w₂</span> × <span className="text-violet-400">Speed Mgmt</span>) + (
            <span className="text-emerald-400">w₃</span> × <span className="text-red-400">Crash History</span>) + (
            <span className="text-emerald-400">w₄</span> × <span className="text-amber-400">VRU Protection</span>)
          </div>
          <div className="grid grid-cols-5 gap-3 mt-5">
            {[1, 2, 3, 4, 5].map(star => (
              <div key={star} className="text-center p-3 rounded-xl border border-border" style={{ borderColor: `${STAR_COLORS[star]}40` }}>
                <div className="text-xl mb-1">{renderStars(star, 'text-sm')}</div>
                <p className="text-xs font-bold text-text-main">{STAR_LABELS[star]}</p>
                <p className="text-[10px] text-text-dim mt-1">
                  SRS {star === 1 ? '< 20' : star === 2 ? '20-39' : star === 3 ? '40-59' : star === 4 ? '60-79' : '≥ 80'}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-dim mt-4">
            Weights (w₁...w₄) are derived from the active <span className="text-primary font-bold">AHP profile</span>.
            Star ratings follow the <span className="text-amber-400 font-bold">iRAP</span> (International Road Assessment Programme) methodology principle.
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
                <span className="font-bold text-text-main">Infrastructure Surveys:</span> Field data providing attributes like road class, lighting, guardrails, and traffic signals for the infrastructure sub-score.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <div>
                <span className="font-bold text-text-main">GPS / Telematics:</span> Provides operating average speeds, compared against safe design speeds (e.g. 80km/h for motorway, 30km/h for residential) to compute the speed management sub-score.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <div>
                <span className="font-bold text-text-main">Police Records & OSM:</span> Accident severity indices combined with POI-based VRU exposure metrics calculate the final crash history and VRU protection sub-scores.
              </div>
            </li>
          </ul>
        </motion.div>
      </div>
    </motion.div>
  );
}
