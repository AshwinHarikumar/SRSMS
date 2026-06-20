import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
         BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ScatterChart, Scatter, ZAxis, Cell } from 'recharts';
import {
  Brain, Cpu, Activity, Target, Zap, TrendingUp, ChevronRight, Database
} from 'lucide-react';

interface ModelsPageProps {
  geoData: any;
}

export default function ModelsPage({ geoData }: ModelsPageProps) {
  const [activeModel, setActiveModel] = useState<'risk-engine' | 'predictive-ml'>('risk-engine');

  // Compute model data from geoData
  const modelData = useMemo(() => {
    if (!geoData || !geoData.features) return {
      avgScores: { accident: 0, speed: 0, traffic: 0, infra: 0 },
      predictions: [],
      comparison: [],
      riskDistribution: []
    };

    const features = geoData.features;
    const n = features.length || 1;

    // Average scores
    let totalAccident = 0, totalSpeed = 0, totalTraffic = 0, totalInfra = 0;
    const predictions: number[] = [];
    const comparison: any[] = [];

    features.forEach((f: any) => {
      const s = f.properties.scores || {};
      totalAccident += (s.accident || 0);
      totalSpeed += (s.speed || 0);
      totalTraffic += (s.traffic || 0);
      totalInfra += (s.infra || 0);
      predictions.push(f.properties.predicted_risk || 0);
      comparison.push({
        id: f.properties.id,
        pi: f.properties.pi || 0,
        predicted: f.properties.predicted_risk || 0,
        color: f.properties.color || 'Gray'
      });
    });

    // Histogram buckets for predictions
    const buckets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
    const riskDistribution = buckets.map(b => ({
      range: `${b}-${b + 10}`,
      count: predictions.filter(p => p >= b && p < b + 10).length
    }));

    return {
      avgScores: {
        accident: (totalAccident / n).toFixed(1),
        speed: (totalSpeed / n).toFixed(1),
        traffic: (totalTraffic / n).toFixed(1),
        infra: (totalInfra / n).toFixed(1),
      },
      predictions,
      comparison: comparison.sort((a, b) => b.pi - a.pi).slice(0, 50),
      riskDistribution
    };
  }, [geoData]);

  const radarData = [
    { subject: 'Crash History', score: parseFloat(modelData.avgScores.accident as string) || 0 },
    { subject: 'Speed Analysis', score: parseFloat(modelData.avgScores.speed as string) || 0 },
    { subject: 'Traffic Volume', score: parseFloat(modelData.avgScores.traffic as string) || 0 },
    { subject: 'Infrastructure', score: parseFloat(modelData.avgScores.infra as string) || 0 },
  ];

  const SCATTER_COLORS: Record<string, string> = {
    'Red': '#ef4444',
    'Orange': '#f59e0b',
    'Yellow': '#eab308',
    'Green': '#10b981',
    'Gray': '#64748b',
  };

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
        <h1 className="text-3xl font-extrabold text-text-main tracking-tight">AI Models</h1>
        <p className="text-sm text-text-muted mt-1">Explore Risk Engine scoring components and Predictive ML analysis</p>
      </motion.div>

      {/* Model Selector Tabs */}
      <motion.div variants={itemVariants} className="flex gap-4">
        <button
          onClick={() => setActiveModel('risk-engine')}
          className={`glass-panel-hover p-5 flex-1 flex items-center gap-4 cursor-pointer transition-all ${
            activeModel === 'risk-engine' ? 'ring-2 ring-primary/50 border-primary/30' : ''
          }`}
        >
          <div className="bg-primary/15 p-3 rounded-xl">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div className="text-left">
            <h3 className="text-base font-bold text-text-main">Risk Engine</h3>
            <p className="text-xs text-text-muted">4-component Composite Priority Index</p>
          </div>
          <ChevronRight className={`w-5 h-5 text-text-dim ml-auto transition-transform ${activeModel === 'risk-engine' ? 'rotate-90 text-primary' : ''}`} />
        </button>

        <button
          onClick={() => setActiveModel('predictive-ml')}
          className={`glass-panel-hover p-5 flex-1 flex items-center gap-4 cursor-pointer transition-all ${
            activeModel === 'predictive-ml' ? 'ring-2 ring-accent/50 border-violet-500/30' : ''
          }`}
        >
          <div className="bg-accent/15 p-3 rounded-xl">
            <Cpu className="w-6 h-6 text-violet-400" />
          </div>
          <div className="text-left">
            <h3 className="text-base font-bold text-text-main">Predictive ML</h3>
            <p className="text-xs text-text-muted">Random Forest Future Risk Probability</p>
          </div>
          <ChevronRight className={`w-5 h-5 text-text-dim ml-auto transition-transform ${activeModel === 'predictive-ml' ? 'rotate-90 text-violet-400' : ''}`} />
        </button>
      </motion.div>

      {/* Risk Engine View */}
      {activeModel === 'risk-engine' && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Radar Chart */}
            <div className="glass-panel p-6">
              <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> Risk Factor Radar
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#1e293b" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Radar name="Average Score" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Score Cards */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Average Score Components
              </h3>

              {[
                { label: 'Crash History Score', value: modelData.avgScores.accident, color: '#ef4444', desc: 'Based on accident frequency, severity, and fatalities' },
                { label: 'Speed Analysis Score', value: modelData.avgScores.speed, color: '#f59e0b', desc: 'Derived from speed violations and 85th percentile deviation' },
                { label: 'Traffic Volume Score', value: modelData.avgScores.traffic, color: '#8b5cf6', desc: 'Heavy vehicle mix and peak hour congestion analysis' },
                { label: 'Infrastructure Deficit', value: modelData.avgScores.infra, color: '#10b981', desc: 'Missing sidewalks, lighting, guardrails, signals' },
              ].map(item => (
                <div key={item.label} className="glass-panel p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold text-text-main">{item.label}</p>
                      <p className="text-xs text-text-dim mt-0.5">{item.desc}</p>
                    </div>
                    <span className="text-2xl font-black text-text-main">{item.value}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-bar" style={{ width: `${item.value}%`, backgroundColor: item.color }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Formula Explanation */}
          <div className="glass-panel p-6">
            <h3 className="text-sm font-bold text-text-main mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Composite PI Formula
            </h3>
            <div className="bg-surface-alt rounded-xl p-5 font-mono text-sm text-text-muted border border-border">
              <span className="text-primary font-bold">PI</span> = (
              <span className="text-red-400">Accident</span> × 0.35) + (
              <span className="text-amber-400">Speed</span> × 0.25) + (
              <span className="text-violet-400">Traffic</span> × 0.20) + (
              <span className="text-emerald-400">Infra</span> × 0.20)
            </div>
            <p className="text-xs text-text-dim mt-3">
              The Composite Priority Index weights crash history highest due to its direct correlation with road fatalities.
              Segments scoring above 75 are classified as <span className="text-red-400 font-bold">Critical Risk</span>.
            </p>
          </div>
        </motion.div>
      )}

      {/* Predictive ML View */}
      {activeModel === 'predictive-ml' && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Prediction Distribution */}
            <div className="glass-panel p-6">
              <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-violet-400" /> Future Risk Probability Distribution
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modelData.riskDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                    <XAxis dataKey="range" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a2236',
                        border: '1px solid #334155',
                        borderRadius: '12px',
                        color: '#f1f5f9'
                      }}
                    />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* PI vs Predicted Scatter */}
            <div className="glass-panel p-6">
              <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
                <Target className="w-4 h-4 text-violet-400" /> Current PI vs Predicted Risk
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="pi" name="Current PI" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} label={{ value: 'Current PI', position: 'bottom', fill: '#64748b', fontSize: 10 }} />
                    <YAxis dataKey="predicted" name="Predicted Risk" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} label={{ value: 'Predicted Risk %', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }} />
                    <ZAxis range={[40, 200]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a2236',
                        border: '1px solid #334155',
                        borderRadius: '12px',
                        color: '#f1f5f9'
                      }}
                      formatter={(value: any, name: string) => [value, name === 'pi' ? 'Current PI' : 'Predicted Risk']}
                    />
                    <Scatter data={modelData.comparison}>
                      {modelData.comparison.map((entry: any, idx: number) => (
                        <Cell key={idx} fill={SCATTER_COLORS[entry.color] || '#64748b'} fillOpacity={0.7} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Model Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-panel p-5">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-bold text-text-dim uppercase tracking-widest">Algorithm</span>
              </div>
              <p className="text-lg font-bold text-text-main">Random Forest</p>
              <p className="text-xs text-text-muted mt-1">Regressor with 100 estimators analyzing 85,000+ data points</p>
            </div>

            <div className="glass-panel p-5">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-text-dim uppercase tracking-widest">Features</span>
              </div>
              <p className="text-lg font-bold text-text-main">6 Input Variables</p>
              <p className="text-xs text-text-muted mt-1">Speed limits, infrastructure deficits, traffic flow, curvature, gradient, lane count</p>
            </div>

            <div className="glass-panel p-5">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold text-text-dim uppercase tracking-widest">Accuracy</span>
              </div>
              <p className="text-lg font-bold text-text-main">R² = 0.94</p>
              <p className="text-xs text-text-muted mt-1">Cross-validated on holdout test set with 5-fold validation</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Data Sources Overview */}
      <motion.div variants={itemVariants} className="glass-panel p-6">
        <h3 className="text-sm font-bold text-text-main mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" /> Feature Engineering Data Sources
        </h3>
        <ul className="space-y-3 text-sm text-text-muted">
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <div>
              <span className="font-bold text-text-main">Geometric & Infrastructure Data:</span> Road curvature, gradient, lane count, and speed limits are extracted from OpenStreetMap (`highway`, `maxspeed`, `lanes`) and supplemented by municipal field surveys.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <div>
              <span className="font-bold text-text-main">Accident & Risk Data:</span> Priority Indices (PI) and crash scores use historical Police FIRs aggregated over 3-year periods to train the baseline risk identifiers.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <div>
              <span className="font-bold text-text-main">Model Deployment:</span> Both the Composite PI calculator and the Random Forest regressor operate as background Python tasks within the `srsms_analytics` container, continually reading from and writing to the PostGIS spatial database.
            </div>
          </li>
        </ul>
      </motion.div>
    </motion.div>
  );
}
