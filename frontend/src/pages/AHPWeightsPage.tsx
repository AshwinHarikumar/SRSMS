import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import {
  Scale, Check, X, AlertTriangle, Save, RefreshCw, Zap, Activity, Settings, Database
} from 'lucide-react';

interface AHPWeightsPageProps {
  ahpProfile: any;
  onSaveProfile: (profile: any) => void;
}

const CRITERIA = ['Accident', 'Speed', 'Traffic', 'Infrastructure', 'VRU', 'Geometry'];
const CRITERIA_KEYS = ['accident', 'speed', 'traffic', 'infrastructure', 'vru', 'geometry'];
const CRITERIA_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#10b981', '#06b6d4', '#64748b'];

const SAATY_LABELS: Record<number, string> = {
  1: 'Equal',
  2: 'Weak',
  3: 'Moderate',
  4: 'Moderate+',
  5: 'Strong',
  6: 'Strong+',
  7: 'Very Strong',
  8: 'Very Strong+',
  9: 'Extreme'
};

// Random Consistency Index for AHP
const RANDOM_INDEX: Record<number, number> = {
  1: 0, 2: 0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32
};

export default function AHPWeightsPage({ ahpProfile, onSaveProfile }: AHPWeightsPageProps) {
  const n = CRITERIA.length;

  // Initialize matrix (identity)
  const getInitialMatrix = () => {
    if (ahpProfile?.pairwise_matrix?.matrix) {
      return ahpProfile.pairwise_matrix.matrix;
    }
    // Default MoRTH Standard matrix
    return [
      [1, 2, 3, 3, 1, 5],
      [0.5, 1, 2, 2, 0.5, 3],
      [1/3, 0.5, 1, 1, 1/3, 2],
      [1/3, 0.5, 1, 1, 1/3, 2],
      [1, 2, 3, 3, 1, 5],
      [0.2, 1/3, 0.5, 0.5, 0.2, 1]
    ];
  };

  const [matrix, setMatrix] = useState<number[][]>(getInitialMatrix);
  const [profileName, setProfileName] = useState(ahpProfile?.profile_name || 'Custom Profile');
  const [description, setDescription] = useState(ahpProfile?.description || '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Compute AHP weights (client-side computation)
  const ahpResult = useMemo(() => {
    try {
      const A = matrix.map(row => [...row]);

      // Normalize columns
      const colSums = new Array(n).fill(0);
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          colSums[j] += A[i][j];
        }
      }

      const normalized = A.map((row, i) =>
        row.map((val, j) => val / colSums[j])
      );

      // Priority vector (row averages)
      const weights = normalized.map(row =>
        row.reduce((sum, val) => sum + val, 0) / n
      );

      // λ_max
      const weightedSum = A.map((row, i) =>
        row.reduce((sum, val, j) => sum + val * weights[j], 0)
      );
      const lambdaValues = weightedSum.map((ws, i) => ws / weights[i]);
      const lambdaMax = lambdaValues.reduce((s, v) => s + v, 0) / n;

      // Consistency Index & Ratio
      const ci = (lambdaMax - n) / (n - 1);
      const ri = RANDOM_INDEX[n] || 1.24;
      const cr = ci / ri;

      return {
        weights: Object.fromEntries(CRITERIA_KEYS.map((k, i) => [k, weights[i]])),
        weightsArray: weights,
        consistencyRatio: cr,
        isConsistent: cr < 0.10,
        lambdaMax,
        consistencyIndex: ci
      };
    } catch (e) {
      return {
        weights: {}, weightsArray: [],
        consistencyRatio: 1, isConsistent: false,
        lambdaMax: 0, consistencyIndex: 0
      };
    }
  }, [matrix]);

  const handleCellChange = useCallback((i: number, j: number, value: number) => {
    if (i === j) return;
    setMatrix(prev => {
      const newMatrix = prev.map(row => [...row]);
      newMatrix[i][j] = value;
      newMatrix[j][i] = 1 / value;
      return newMatrix;
    });
  }, []);

  const handleReset = () => {
    setMatrix([
      [1, 2, 3, 3, 1, 5],
      [0.5, 1, 2, 2, 0.5, 3],
      [1/3, 0.5, 1, 1, 1/3, 2],
      [1/3, 0.5, 1, 1, 1/3, 2],
      [1, 2, 3, 3, 1, 5],
      [0.2, 1/3, 0.5, 0.5, 0.2, 1]
    ]);
    setProfileName('MoRTH Standard');
  };

  const handleSave = async () => {
    if (!ahpResult.isConsistent) return;
    setSaveStatus('saving');
    try {
      onSaveProfile({
        profile_name: profileName,
        description,
        pairwise_matrix: { matrix, criteria: CRITERIA_KEYS },
        derived_weights: ahpResult.weights,
        consistency_ratio: ahpResult.consistencyRatio,
        is_consistent: ahpResult.isConsistent,
        activate: true
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      setSaveStatus('error');
    }
  };

  // Weight chart data
  const weightChartData = CRITERIA_KEYS.map((key, i) => ({
    name: CRITERIA[i],
    weight: ((ahpResult.weightsArray[i] || 0) * 100).toFixed(1),
    color: CRITERIA_COLORS[i]
  })).sort((a, b) => Number(b.weight) - Number(a.weight));

  const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  const formatFraction = (val: number) => {
    if (val === 1) return '1';
    if (val >= 1) return val.toFixed(0);
    const inv = 1 / val;
    return `1/${inv.toFixed(0)}`;
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
          <h1 className="text-3xl font-extrabold text-text-main tracking-tight flex items-center gap-3">
            <div className="bg-violet-500/15 p-2.5 rounded-xl">
              <Scale className="w-7 h-7 text-violet-400" />
            </div>
            AHP Weight Configuration
          </h1>
          <p className="text-sm text-text-muted mt-2">
            Analytic Hierarchy Process — Saaty's pairwise comparison method for deriving objective risk weights
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleReset} className="btn-secondary flex items-center gap-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Reset to Default
          </button>
          <button
            onClick={handleSave}
            disabled={!ahpResult.isConsistent || saveStatus === 'saving'}
            className={`btn-primary flex items-center gap-2 text-xs ${!ahpResult.isConsistent ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {saveStatus === 'saving' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : saveStatus === 'saved' ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saveStatus === 'saved' ? 'Saved!' : 'Save & Activate'}
          </button>
        </div>
      </motion.div>

      {/* Consistency Status */}
      <motion.div variants={itemVariants}>
        <div className={`p-4 rounded-xl border-2 flex items-center gap-4 ${
          ahpResult.isConsistent
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          {ahpResult.isConsistent ? (
            <div className="bg-emerald-500/20 p-2 rounded-lg">
              <Check className="w-5 h-5 text-emerald-400" />
            </div>
          ) : (
            <div className="bg-red-500/20 p-2 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-text-main">
              Consistency Ratio: <span className={ahpResult.isConsistent ? 'text-emerald-400' : 'text-red-400'}>
                {ahpResult.consistencyRatio.toFixed(4)}
              </span>
              <span className="text-text-dim ml-2">(threshold: 0.10)</span>
            </p>
            <p className="text-xs text-text-muted mt-1">
              {ahpResult.isConsistent
                ? 'Matrix is consistent. Weights are valid for use in the Composite Priority Index.'
                : 'Matrix is inconsistent! Please revise your pairwise comparisons to reduce contradictions.'}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-text-dim">λ_max</p>
            <p className="text-lg font-bold text-text-main">{ahpResult.lambdaMax.toFixed(3)}</p>
          </div>
        </div>
      </motion.div>

      {/* Profile Name */}
      <motion.div variants={itemVariants} className="glass-panel p-5 flex items-center gap-4">
        <Settings className="w-5 h-5 text-violet-400 flex-shrink-0" />
        <div className="flex-1 flex items-center gap-4">
          <div className="flex-1">
            <label className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Profile Name</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="input-field mt-1"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field mt-1"
              placeholder="e.g., Urban road priorities..."
            />
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pairwise Comparison Matrix */}
        <motion.div variants={itemVariants} className="lg:col-span-2 glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
            <Scale className="w-4 h-4 text-violet-400" /> Pairwise Comparison Matrix (Saaty 1-9 Scale)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="py-2 px-3 text-left text-text-dim"></th>
                  {CRITERIA.map((c, j) => (
                    <th key={j} className="py-2 px-3 text-center font-bold text-text-muted" style={{ color: CRITERIA_COLORS[j] }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CRITERIA.map((rowCrit, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="py-2 px-3 font-bold text-text-muted" style={{ color: CRITERIA_COLORS[i] }}>
                      {rowCrit}
                    </td>
                    {CRITERIA.map((_, j) => (
                      <td key={j} className="py-1 px-1 text-center">
                        {i === j ? (
                          <span className="text-text-dim font-mono">1</span>
                        ) : i < j ? (
                          <select
                            value={matrix[i][j]}
                            onChange={(e) => handleCellChange(i, j, parseFloat(e.target.value))}
                            className="bg-surface-alt text-text-main text-xs rounded-lg px-2 py-1.5 border border-border focus:border-violet-500/50 focus:outline-none w-full"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => (
                              <option key={v} value={v}>{v} — {SAATY_LABELS[v]}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-text-dim font-mono text-xs">{formatFraction(matrix[i][j])}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-text-dim mt-4">
            Compare row criteria vs column criteria. Values &gt; 1 mean the row criterion is more important.
            Lower triangle values are automatically computed as reciprocals.
          </p>
        </motion.div>

        {/* Derived Weights */}
        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
            <Activity className="w-4 h-4 text-violet-400" /> Derived Weights
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weightChartData}
                layout="vertical"
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1e293b" />
                <XAxis type="number" domain={[0, 50]} stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} unit="%" />
                <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={90} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a2236', border: '1px solid #334155',
                    borderRadius: '12px', color: '#f1f5f9'
                  }}
                  formatter={(value: any) => [`${value}%`, 'Weight']}
                />
                <Bar dataKey="weight" radius={[0, 6, 6, 0]} barSize={20}>
                  {weightChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Weight values */}
          <div className="space-y-2 mt-4">
            {weightChartData.map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                  <span className="font-semibold text-text-muted">{item.name}</span>
                </div>
                <span className="font-bold text-text-main">{item.weight}%</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Info Row: Formula & Data Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Updated PI Formula */}
        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-violet-400" /> Updated Composite PI Formula (AHP-Weighted)
          </h3>
          <div className="bg-surface-alt rounded-xl p-5 font-mono text-sm text-text-muted border border-border">
            <span className="text-primary font-bold">PI</span> = (
            {CRITERIA_KEYS.map((key, i) => (
              <span key={key}>
                {i > 0 && <span className="text-text-dim"> + (</span>}
                <span style={{ color: CRITERIA_COLORS[i] }}>{CRITERIA[i]}</span>
                <span className="text-text-dim"> × </span>
                <span className="text-emerald-400 font-bold">
                  {((ahpResult.weightsArray[i] || 0) * 100).toFixed(1)}%
                </span>
                <span className="text-text-dim">)</span>
              </span>
            ))}
          </div>
          <p className="text-xs text-text-dim mt-3">
            Weights are dynamically derived from the Saaty pairwise comparison matrix above.
            The Consistency Ratio must be below <span className="text-violet-400 font-bold">0.10</span> for the weights to be scientifically valid.
          </p>
        </motion.div>

        {/* Data Sources */}
        <motion.div variants={itemVariants} className="glass-panel p-6">
          <h3 className="text-sm font-bold text-text-main mb-4 flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" /> Data Sources & Input
          </h3>
          <ul className="space-y-3 text-sm text-text-muted">
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <div>
                <span className="font-bold text-text-main">Expert Elicitation:</span> AHP relies on subjective input from road safety engineers, urban planners, and policy makers to establish relative importance between risk dimensions.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <div>
                <span className="font-bold text-text-main">Literature & Guidelines:</span> The default 'MoRTH Standard' profile is derived from the Ministry of Road Transport and Highways (MoRTH) accident analysis guidelines, prioritizing crashes and vulnerable road users.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-1">•</span>
              <div>
                <span className="font-bold text-text-main">Mathematical Validation:</span> The system computationally extracts the principal eigenvector (λ_max) of the matrix to determine weights, applying Random Index tables to calculate the Consistency Ratio (CR).
              </div>
            </li>
          </ul>
        </motion.div>
      </div>
    </motion.div>
  );
}
