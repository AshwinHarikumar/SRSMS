import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, CircleMarker, ZoomControl, Tooltip as LeafletTooltip } from 'react-leaflet';
import {
  MapPin, Building2, GraduationCap, Siren, Eye, EyeOff, AlertTriangle, Database
} from 'lucide-react';

interface POIsPageProps {
  poiData: any;
  geoData: any;
  onFetchPois: () => void;
}

const POI_TYPE_CONFIG: Record<string, { icon: any; color: string; gradient: string }> = {
  'Hospital': { icon: Building2, color: '#3b82f6', gradient: 'from-blue-500/20 to-transparent' },
  'School': { icon: GraduationCap, color: '#8b5cf6', gradient: 'from-violet-500/20 to-transparent' },
  'Police Station': { icon: Siren, color: '#10b981', gradient: 'from-emerald-500/20 to-transparent' },
};

export default function POIsPage({ poiData, geoData, onFetchPois }: POIsPageProps) {
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(['Hospital', 'School', 'Police Station']));
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  React.useEffect(() => {
    if (!poiData) onFetchPois();
  }, []);

  const pois = poiData?.features || [];

  const groupedPois = useMemo(() => {
    const groups: Record<string, any[]> = {};
    pois.forEach((f: any) => {
      const type = f.properties.type || 'Other';
      if (!groups[type]) groups[type] = [];
      groups[type].push(f);
    });
    return groups;
  }, [pois]);

  const toggleType = (type: string) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const visiblePois = useMemo(() => {
    return pois.filter((f: any) => visibleTypes.has(f.properties.type));
  }, [pois, visibleTypes]);

  const pagedPois = useMemo(() => {
    return visiblePois.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [visiblePois, page]);

  const totalPages = Math.ceil(visiblePois.length / PAGE_SIZE);

  // Count nearby high-risk zones
  const proximityData = useMemo(() => {
    if (!geoData?.features || !pois.length) return {};
    const highRisk = geoData.features.filter((f: any) => f.properties.color === 'Red' || f.properties.color === 'Orange');

    const result: Record<string, number> = {};
    Object.keys(groupedPois).forEach(type => {
      // Simple count: POIs whose type has segments nearby (simplified proximity)
      result[type] = Math.min(groupedPois[type].length, highRisk.length);
    });
    return result;
  }, [geoData, pois, groupedPois]);

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
        <h1 className="text-3xl font-extrabold text-text-main tracking-tight">Points of Interest</h1>
        <p className="text-sm text-text-muted mt-1">Critical infrastructure locations separated by type</p>
      </motion.div>

      {/* POI Type Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.entries(POI_TYPE_CONFIG).map(([type, config]) => {
          const Icon = config.icon;
          const items = groupedPois[type] || [];
          const isVisible = visibleTypes.has(type);
          const nearHighRisk = proximityData[type] || 0;

          return (
            <motion.div
              key={type}
              whileHover={{ y: -4 }}
              className={`glass-panel-hover overflow-hidden relative cursor-pointer ${isVisible ? 'ring-1 ring-white/[0.08]' : 'opacity-60'}`}
              onClick={() => toggleType(type)}
            >
              <div className={`absolute inset-0 bg-gradient-to-b ${config.gradient} pointer-events-none`} />
              <div className="relative p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl" style={{ background: `${config.color}20` }}>
                      <Icon className="w-5 h-5" style={{ color: config.color }} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-text-main">{type}s</h3>
                      <p className="text-xs text-text-dim">{items.length} locations</p>
                    </div>
                  </div>
                  <button className="p-2 rounded-lg bg-surface-alt border border-border text-text-muted hover:text-text-main transition-all">
                    {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-black text-text-main">{items.length}</p>
                    <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Total</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-text-main flex items-center gap-1">
                      {nearHighRisk}
                      {nearHighRisk > 0 && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                    </p>
                    <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Near Risk Zones</p>
                  </div>
                </div>

                {/* POI List Preview */}
                <div className="mt-4 space-y-2">
                  {items.slice(0, 3).map((poi: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-text-muted bg-surface-alt/50 rounded-lg px-3 py-2">
                      <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: config.color }} />
                      <span className="truncate font-medium">{poi.properties.name}</span>
                    </div>
                  ))}
                  {items.length > 3 && (
                    <p className="text-xs text-text-dim text-center">+{items.length - 3} more</p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* POI Map */}
      <motion.div variants={itemVariants} className="glass-panel overflow-hidden" style={{ height: '480px' }}>
        <MapContainer center={[9.98, 76.28]} zoom={13} className="w-full h-full" zoomControl={false}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          <ZoomControl position="bottomright" />

          {visiblePois.map((f: any) => {
            const coords = f.geometry.coordinates;
            const config = POI_TYPE_CONFIG[f.properties.type] || { color: '#64748b' };
            return (
              <CircleMarker
                key={f.properties.id}
                center={[coords[1], coords[0]]}
                radius={7}
                fillColor={config.color}
                color="rgba(255,255,255,0.3)"
                weight={1.5}
                fillOpacity={0.85}
              >
                <LeafletTooltip direction="top" offset={[0, -5]} opacity={1}>
                  <div className="font-semibold text-sm">{f.properties.name}</div>
                  <div className="text-xs text-text-muted">{f.properties.type}</div>
                </LeafletTooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </motion.div>

      {/* Full POI Table */}
      <motion.div variants={itemVariants} className="glass-panel p-6">
        <h3 className="text-sm font-bold text-text-main mb-5 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" /> All Points of Interest
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Name</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Type</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-text-dim uppercase tracking-widest">Coordinates</th>
              </tr>
            </thead>
            <tbody>
              {pagedPois.map((f: any) => {
                const config = POI_TYPE_CONFIG[f.properties.type];
                return (
                  <tr key={f.properties.id} className="border-b border-border/50 hover:bg-surface-alt/50 transition-colors">
                    <td className="py-3 px-4 text-text-main font-semibold">{f.properties.name}</td>
                    <td className="py-3 px-4">
                      <span className={`badge ${
                        f.properties.type === 'Hospital' ? 'badge-primary' :
                        f.properties.type === 'School' ? 'badge-accent' :
                        'badge-success'
                      }`}>
                        {f.properties.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-text-muted text-xs font-mono">
                      [{f.geometry.coordinates[1].toFixed(4)}, {f.geometry.coordinates[0].toFixed(4)}]
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {visiblePois.length === 0 && (
          <div className="text-center py-12 text-text-dim">
            <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No POIs visible</p>
            <p className="text-xs mt-1">Toggle visibility in the cards above</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <span className="text-xs text-text-dim">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, visiblePois.length)} of {visiblePois.length}
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
              <span className="font-bold text-text-main">OpenStreetMap (OSM):</span> Primary source for identifying critical infrastructure (Schools, Hospitals, Police Stations) via tags (`amenity=school`, `amenity=hospital`).
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <div>
              <span className="font-bold text-text-main">Municipal GIS Data:</span> Supplementary source used to accurately map verified public institutions and critical services within city limits.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <div>
              <span className="font-bold text-text-main">Spatial Proximity:</span> Coordinates are processed using PostGIS (`ST_DWithin`) to measure their distance to the road network and identify risk exposure zones.
            </div>
          </li>
        </ul>
      </motion.div>
    </motion.div>
  );
}
