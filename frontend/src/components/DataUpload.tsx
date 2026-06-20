import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UploadCloud, File, CheckCircle, AlertCircle, X, FileText, Database } from 'lucide-react';

interface DataUploadProps {
  onClose?: () => void;
  isPage?: boolean;
}

export default function DataUpload({ onClose, isPage = false }: DataUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [dataType, setDataType] = useState<string>('accidents');

  const handleUpload = () => {
    if (!file) return;
    setUploading(true);
    setStatus('idle');

    // Mock upload delay for demo
    setTimeout(() => {
      setUploading(false);
      setStatus('success');
    }, 2000);
  };

  const dataTypes = [
    { id: 'accidents', label: 'Accident Data', desc: 'CSV with severity, fatalities, coordinates', icon: AlertCircle },
    { id: 'traffic', label: 'Traffic Data', desc: 'Volume, vehicle mix, peak hours', icon: Database },
    { id: 'speed', label: 'Speed Data', desc: 'Average speed, violations, percentiles', icon: FileText },
  ];

  const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  const content = (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className={isPage ? 'p-8 space-y-8 max-w-[900px] mx-auto' : 'space-y-6'}
    >
      {isPage && (
        <motion.div variants={itemVariants}>
          <h1 className="text-3xl font-extrabold text-text-main tracking-tight">Data Upload</h1>
          <p className="text-sm text-text-muted mt-1">Import custom datasets for Risk Engine processing</p>
        </motion.div>
      )}

      {/* Data Type Selector */}
      <motion.div variants={itemVariants}>
        <p className="text-xs font-bold text-text-dim uppercase tracking-widest mb-3">Select Data Type</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {dataTypes.map(dt => {
            const Icon = dt.icon;
            return (
              <button
                key={dt.id}
                onClick={() => setDataType(dt.id)}
                className={`glass-panel-hover p-4 text-left transition-all ${dataType === dt.id ? 'ring-2 ring-primary/50 border-primary/30' : ''}`}
              >
                <Icon className={`w-5 h-5 mb-2 ${dataType === dt.id ? 'text-primary' : 'text-text-dim'}`} />
                <p className="text-sm font-bold text-text-main">{dt.label}</p>
                <p className="text-xs text-text-dim mt-0.5">{dt.desc}</p>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Upload Zone */}
      <motion.div variants={itemVariants}>
        <div
          className="border-2 border-dashed border-border rounded-2xl p-10 text-center bg-surface-alt/50 hover:bg-surface-alt hover:border-border-hover transition-all cursor-pointer"
          onClick={() => document.getElementById('file-upload')?.click()}
        >
          <input
            id="file-upload"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setStatus('idle');
            }}
          />

          {!file ? (
            <div className="flex flex-col items-center">
              <div className="bg-primary/10 p-4 rounded-2xl mb-4">
                <UploadCloud className="w-10 h-10 text-primary" />
              </div>
              <p className="text-sm font-semibold text-text-main">Click to browse or drag CSV file here</p>
              <p className="text-xs text-text-dim mt-2">Maximum file size: 50MB</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="bg-primary/10 p-4 rounded-2xl mb-4">
                <File className="w-10 h-10 text-primary" />
              </div>
              <p className="text-sm font-bold text-text-main">{file.name}</p>
              <p className="text-xs text-text-dim mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Status */}
      {status === 'success' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-success/10 border border-emerald-500/20 rounded-xl flex items-center text-emerald-400 text-sm font-medium"
        >
          <CheckCircle className="w-5 h-5 mr-3 flex-shrink-0" />
          Dataset uploaded and queued for Risk Engine processing!
        </motion.div>
      )}

      {status === 'error' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-danger/10 border border-red-500/20 rounded-xl flex items-center text-red-400 text-sm font-medium"
        >
          <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
          Failed to parse CSV file. Check formatting.
        </motion.div>
      )}

      {/* Actions */}
      <motion.div variants={itemVariants} className="flex justify-end gap-3">
        {onClose && (
          <button onClick={onClose} className="btn-ghost">Cancel</button>
        )}
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className={`btn-primary ${(!file || uploading) ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {uploading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              Processing...
            </span>
          ) : (
            'Process Dataset'
          )}
        </button>
      </motion.div>
    </motion.div>
  );

  // If used as modal (not page)
  if (!isPage) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel-solid w-full max-w-2xl overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-surface-alt">
            <h2 className="text-lg font-bold text-text-main">Upload Custom Dataset</h2>
            <button onClick={onClose} className="p-2 text-text-muted hover:text-text-main rounded-lg hover:bg-surface-hover transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">{content}</div>
        </motion.div>
      </div>
    );
  }

  return content;
}
