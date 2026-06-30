import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, GeoJSON, ZoomControl, CircleMarker, Popup, Tooltip as LeafletTooltip } from 'react-leaflet';
import {
  X, Layers, MapPin, Maximize2, Filter, Database, Wrench, Sparkles, Settings, Key
} from 'lucide-react';

interface RiskMapPageProps {
  geoData: any;
  poiData: any;
  accidentsData: any;
  riskFilter: string;
  onRiskFilterChange: (filter: string) => void;
  overlayMode: 'Risk' | 'Traffic' | 'Speed';
  onOverlayModeChange: (mode: 'Risk' | 'Traffic' | 'Speed') => void;
  showPois: boolean;
  onTogglePois: () => void;
  showAccidents: boolean;
  onToggleAccidents: () => void;
}

export default function RiskMapPage({
  geoData, poiData, accidentsData,
  riskFilter, onRiskFilterChange,
  overlayMode, onOverlayModeChange,
  showPois, onTogglePois,
  showAccidents, onToggleAccidents
}: RiskMapPageProps) {
  const [selectedSegment, setSelectedSegment] = useState<any>(null);
  const [corrections, setCorrections] = useState<any[]>([]);
  const [loadingCorrections, setLoadingCorrections] = useState<boolean>(false);
  const [correctionsError, setCorrectionsError] = useState<string>('');
  const [geminiApiKey, setGeminiApiKey] = useState<string>(localStorage.getItem('gemini_api_key') || '');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!selectedSegment) {
      setCorrections([]);
      return;
    }

    const fetchCorrections = async () => {
      setLoadingCorrections(true);
      setCorrectionsError('');
      try {
        const segmentId = selectedSegment.properties.id;
        const res = await fetch(`/api/data/segments/${segmentId}/corrections`);
        if (!res.ok) {
          throw new Error('Failed to fetch safety corrections');
        }
        const data = await res.json();
        setCorrections(data.corrections || []);
      } catch (err: any) {
        console.error(err);
        setCorrectionsError(err.message || 'Error loading safety corrections');
      } finally {
        setLoadingCorrections(false);
      }
    };

    fetchCorrections();
  }, [selectedSegment]);

  const styleFeature = useCallback((feature: any) => {
    const isSelected = selectedSegment?.properties.id === feature.properties.id;
    let color = '#64748b'; // default ash

    if (overlayMode === 'Risk') {
      const colorMap: Record<string, string> = {
        'Red': '#ef4444',
        'Orange': '#f59e0b',
        'Yellow': '#eab308',
        'Green': '#10b981'
      };
      color = colorMap[feature.properties.color] || '#64748b';
    } else if (overlayMode === 'Traffic') {
      const tv = feature.properties.traffic_volume || 0;
      if (tv > 30000) color = '#ef4444';
      else if (tv > 20000) color = '#f97316';
      else if (tv > 10000) color = '#eab308';
      else color = '#3b82f6';
    } else if (overlayMode === 'Speed') {
      const sv = feature.properties.speed_violations || 0;
      if (sv > 1000) color = '#ef4444';
      else if (sv > 500) color = '#f97316';
      else if (sv > 100) color = '#eab308';
      else color = '#10b981';
    }

    return {
      color,
      weight: isSelected ? 8 : (overlayMode === 'Risk' ? 4 : 5),
      opacity: isSelected ? 1 : (overlayMode === 'Risk' ? 0.8 : 0.9),
      dashArray: isSelected ? '5, 10' : ''
    };
  }, [overlayMode, selectedSegment]);

  const onEachFeature = useCallback((feature: any, layer: any) => {
    layer.on({ click: () => setSelectedSegment(feature) });
  }, []);

  const riskFilters = ['All', 'Critical Only', 'High+', 'Moderate+'];

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Full-Screen Map */}
      <div className="absolute inset-0 z-0">
        <MapContainer center={[10.8505, 76.2711]} zoom={7} className="w-full h-full" zoomControl={false}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <ZoomControl position="bottomright" />

          {geoData && <GeoJSON key={riskFilter} data={geoData} style={styleFeature} onEachFeature={onEachFeature} />}

          {showPois && poiData && poiData.features.map((f: any, idx: number) => {
            const coords = f.geometry.coordinates;
            const isHospital = f.properties.type === 'Hospital';
            const isSchool = f.properties.type === 'School';
            const color = isHospital ? '#3b82f6' : isSchool ? '#8b5cf6' : '#64748b';
            return (
              <CircleMarker
                key={'poi-' + idx}
                center={[coords[1], coords[0]]}
                radius={5}
                fillColor={color}
                color="rgba(255,255,255,0.3)"
                weight={1}
                fillOpacity={0.9}
              >
                <LeafletTooltip direction="top" offset={[0, -5]} opacity={1}>
                  <div className="font-semibold text-sm">{f.properties.name}</div>
                  <div className="text-xs text-text-muted">{f.properties.type}</div>
                </LeafletTooltip>
              </CircleMarker>
            );
          })}

          {showAccidents && accidentsData && accidentsData.features.map((f: any, idx: number) => {
            const coords = f.geometry.coordinates;
            return (
              <CircleMarker
                key={idx}
                center={[coords[1], coords[0]]}
                radius={f.properties.severity === 'Fatal' ? 10 : 6}
                fillColor="#ef4444"
                color="#ef4444"
                weight={0}
                fillOpacity={0.5}
              >
                <Popup>
                  <div className="p-1">
                    <h3 className="font-bold text-red-500 mb-1">{f.properties.severity} Accident</h3>

                    {f.properties.fatalities > 0 && <p className="text-xs mb-1"><strong>Fatalities:</strong> {f.properties.fatalities}</p>}
                    {f.properties.injuries > 0 && <p className="text-xs mb-1"><strong>Injuries:</strong> {f.properties.injuries}</p>}
                    {f.properties.vehicle_type && <p className="text-xs mb-1"><strong>Vehicle:</strong> {f.properties.vehicle_type}</p>}
                    {f.properties.collision_type && <p className="text-xs"><strong>Type:</strong> {f.properties.collision_type}</p>}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {/* Top Filter Bar */}
      <div className="absolute top-5 left-5 right-5 z-[500]">
        <div className="glass-panel px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Filter className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-text-main">Map Layers</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="tab-group mr-4">
              {['Risk', 'Traffic', 'Speed'].map(mode => (
                <button
                  key={mode}
                  onClick={() => onOverlayModeChange(mode as any)}
                  className={`tab-item ${overlayMode === mode ? 'active' : ''}`}
                >
                  {mode}
                </button>
              ))}
            </div>
            {overlayMode === 'Risk' && (
              <div className="tab-group">
                {riskFilters.map(filter => (
                <button
                  key={filter}
                  onClick={() => onRiskFilterChange(filter)}
                  className={`tab-item ${riskFilter === filter ? 'active' : ''}`}
                >
                  {filter}
                </button>
              ))}
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Map Layer Controls */}
      <div className="absolute bottom-6 right-6 z-[500] flex flex-col gap-2">
        <div className="glass-panel p-2 flex flex-col gap-2">
          <button
            onClick={onToggleAccidents}
            className={`p-3 rounded-xl transition-all ${showAccidents ? 'bg-primary text-white shadow-sm' : 'bg-surface hover:bg-slate-100 text-text-muted border border-border'}`}
            title="Toggle Accident Density Layer"
          >
            <Layers className="w-5 h-5" />
          </button>
          <button className="p-3 bg-surface-alt hover:bg-surface-hover text-text-muted rounded-xl border border-border transition-all" title="Reset Map View">
            <Maximize2 className="w-5 h-5" />
          </button>
          <button
            onClick={onTogglePois}
            className={`p-3 rounded-xl transition-all ${showPois ? 'bg-primary text-white shadow-sm' : 'bg-surface hover:bg-slate-100 text-text-muted border border-border'}`}
            title="Toggle Points of Interest"
          >
            <MapPin className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-6 left-5 z-[500]">
        <div className="glass-panel p-4">
          <p className="text-xs font-bold text-text-dim uppercase tracking-widest mb-3">
            {overlayMode === 'Risk' ? 'Risk Level' : overlayMode === 'Traffic' ? 'Daily Traffic Volume' : 'Speed Violations'}
          </p>
          <div className="space-y-2">
            {overlayMode === 'Risk' && (
              <>
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted"><span className="w-3 h-3 rounded-full bg-red-500"></span> Critical (Black Spots)</div>
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted"><span className="w-3 h-3 rounded-full bg-amber-500"></span> High Risk</div>
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted"><span className="w-3 h-3 rounded-full bg-yellow-500"></span> Moderate Risk</div>
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> Low Risk</div>
              </>
            )}
            {overlayMode === 'Traffic' && (
              <>
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted"><span className="w-3 h-3 rounded-full bg-red-500"></span> &gt; 30,000 / day</div>
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted"><span className="w-3 h-3 rounded-full bg-orange-500"></span> 20k - 30k</div>
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted"><span className="w-3 h-3 rounded-full bg-yellow-500"></span> 10k - 20k</div>
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted"><span className="w-3 h-3 rounded-full bg-blue-500"></span> &lt; 10k</div>
              </>
            )}
            {overlayMode === 'Speed' && (
              <>
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted"><span className="w-3 h-3 rounded-full bg-red-500"></span> &gt; 1000 Violations</div>
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted"><span className="w-3 h-3 rounded-full bg-orange-500"></span> 500 - 1000</div>
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted"><span className="w-3 h-3 rounded-full bg-yellow-500"></span> 100 - 500</div>
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> &lt; 100</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Segment Detail Slide-Over */}
      <AnimatePresence>
        {selectedSegment && (
          <motion.div
            initial={{ x: 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute top-5 bottom-6 right-5 w-[380px] z-[600] glass-panel-solid flex flex-col overflow-hidden"
          >
            <div className="p-5 bg-surface-alt border-b border-border flex justify-between items-center">
              <div>
                <h2 className="text-lg font-extrabold text-text-main">{selectedSegment.properties.road_name || 'Unnamed Road'}</h2>
                <p className="text-xs font-mono text-text-dim mt-1">Segment ID: {selectedSegment.properties.id} {selectedSegment.properties.district_name ? `· ${selectedSegment.properties.district_name}` : ''}</p>
              </div>
              <button onClick={() => setSelectedSegment(null)} className="p-2 bg-surface rounded-lg border border-border text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              {/* PI Score */}
              <div className={`p-5 rounded-2xl border-2 mb-8 ${
                selectedSegment.properties.color === 'Red' ? 'bg-danger/10 border-red-500/30' :
                selectedSegment.properties.color === 'Orange' ? 'bg-warning/10 border-amber-500/30' :
                'bg-surface-alt border-border'
              }`}>
                <p className="text-xs font-bold text-text-dim uppercase tracking-widest mb-1">Composite Priority Index</p>
                <div className="flex items-end gap-3">
                  <p className="text-5xl font-black text-text-main tracking-tighter">{selectedSegment.properties.pi}</p>
                  <div className={`mb-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide ${
                    selectedSegment.properties.color === 'Red' ? 'badge-danger' :
                    selectedSegment.properties.color === 'Orange' ? 'badge-warning' :
                    selectedSegment.properties.color === 'Yellow' ? 'badge-warning' :
                    'badge-success'
                  }`}>
                    {selectedSegment.properties.category}
                  </div>
                </div>
              </div>

              {/* Risk Breakdown */}
              {selectedSegment.properties.scores && (
                <div>
                  <h3 className="text-sm font-bold text-text-main uppercase tracking-widest border-b border-border pb-3 mb-5">Risk Factor Breakdown</h3>
                  <div className="space-y-6">
                    {[
                      { label: 'Crash History', value: selectedSegment.properties.scores.accident, color: '#ef4444' },
                      { label: 'Speeding Severity', value: selectedSegment.properties.scores.speed, color: '#f59e0b' },
                      { label: 'Infrastructure Deficit', value: selectedSegment.properties.scores.infra, color: '#eab308' },
                      { label: 'Live Weather Risk', value: selectedSegment.properties.scores.weather || 0, color: '#3b82f6' },
                      { label: 'Road Gradient/Geometry', value: selectedSegment.properties.scores.geometry || 0, color: '#8b5cf6' },
                    ].map(item => (
                      <div key={item.label}>
                        <div className="flex justify-between items-end mb-2">
                          <span className="text-sm font-bold text-text-muted">{item.label}</span>
                          <span className="text-lg font-black text-text-main">{item.value}</span>
                        </div>
                        <div className="progress-track">
                          <div className="progress-bar" style={{ width: `${item.value}%`, backgroundColor: item.color }}></div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 p-4 bg-primary/10 border border-blue-500/20 rounded-xl flex justify-between items-center">
                    <span className="text-sm font-bold text-blue-400">Enforced Speed Limit</span>
                    <span className="text-lg font-black text-blue-300">{selectedSegment.properties.speed_limit} km/h</span>
                  </div>

                  {/* Star Rating */}
                  {selectedSegment.properties.star_rating > 0 && (
                    <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex justify-between items-center">
                      <span className="text-sm font-bold text-amber-400">Star Rating</span>
                      <span className="text-lg font-bold">
                        {[1,2,3,4,5].map(i => (
                          <span key={i} style={{ color: i <= selectedSegment.properties.star_rating ? '#eab308' : '#334155' }}>★</span>
                        ))}
                      </span>
                    </div>
                  )}

                  {/* VRU Exposure */}
                  {selectedSegment.properties.vru_exposure_score > 0 && (
                    <div className="mt-4 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl flex justify-between items-center">
                      <span className="text-sm font-bold text-cyan-400">VRU Exposure</span>
                      <div className="text-right">
                        <span className="text-lg font-black text-text-main">{selectedSegment.properties.vru_exposure_score}</span>
                        <span className="text-xs text-text-dim ml-1">/ 100</span>
                      </div>
                    </div>
                  )}

                  {/* Black Spot Warning */}
                  {selectedSegment.properties.is_black_spot && (
                    <div className="mt-4 p-4 bg-red-500/15 border-2 border-red-500/40 rounded-xl text-center">
                      <p className="text-sm font-extrabold text-red-400 uppercase tracking-widest">⚠ MoRTH Black Spot</p>
                      <p className="text-xs text-text-dim mt-1">
                        {selectedSegment.properties.bs_accident_count} accidents · {selectedSegment.properties.bs_fatality_count} fatalities
                      </p>
                    </div>
                  )}

                  {/* AI Risk Mitigation Corrections */}
                  <div className="mt-8 border-t border-border pt-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-bold text-text-main flex items-center gap-1.5 uppercase tracking-widest">
                        <Sparkles className="w-4 h-4 text-amber-400" /> AI Safety Corrections
                      </h3>
                      <button
                        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        className="p-1.5 rounded-lg border border-border bg-surface text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
                        title="Configure Gemini API Key"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {isSettingsOpen && (
                      <div className="mb-4 p-4 rounded-xl border border-border bg-surface-alt space-y-3">
                        <label className="text-xs font-bold text-text-muted flex items-center gap-1">
                          <Key className="w-3 h-3" /> Gemini API Key (Stored locally)
                        </label>
                        <input
                          type="password"
                          value={geminiApiKey}
                          onChange={(e) => {
                            setGeminiApiKey(e.target.value);
                            localStorage.setItem('gemini_api_key', e.target.value);
                          }}
                          placeholder="AIza..."
                          className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-text-main focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <p className="text-[10px] text-text-dim">
                          Pasting your Gemini API Key enables dynamic AI safety analysis. Leave blank to use localized safety guideline rules.
                        </p>
                      </div>
                    )}

                    {loadingCorrections ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                          <div key={n} className="p-4 rounded-xl border border-border bg-surface-alt animate-pulse space-y-2">
                            <div className="h-4 bg-border rounded w-1/3"></div>
                            <div className="h-3 bg-border rounded w-full"></div>
                            <div className="h-3 bg-border rounded w-2/3"></div>
                          </div>
                        ))}
                      </div>
                    ) : correctionsError ? (
                      <div className="p-3 bg-danger/10 border border-red-500/20 rounded-xl text-center">
                        <p className="text-xs text-red-400">{correctionsError}</p>
                      </div>
                    ) : corrections.length > 0 ? (
                      <div className="space-y-3">
                        {corrections.map((corr, idx) => (
                          <div key={idx} className="p-4 rounded-xl border border-border bg-surface-alt hover:border-blue-500/30 transition-colors animate-fade-in">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-extrabold uppercase px-2 py-0.5 rounded bg-primary/10 text-primary">
                                {corr.category}
                              </span>
                              <div className="flex gap-1.5">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  corr.impact === 'High' ? 'bg-emerald-500/10 text-emerald-400' :
                                  corr.impact === 'Medium' ? 'bg-amber-500/10 text-amber-400' :
                                  'bg-blue-500/10 text-blue-400'
                                }`}>
                                  Impact: {corr.impact}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  corr.cost === 'High' ? 'bg-red-500/10 text-red-400' :
                                  corr.cost === 'Medium' ? 'bg-amber-500/10 text-amber-400' :
                                  'bg-emerald-500/10 text-emerald-400'
                                }`}>
                                  Cost: {corr.cost}
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-text-muted leading-relaxed font-medium">
                              {corr.action}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 border border-dashed border-border rounded-xl text-center">
                        <p className="text-xs text-text-dim">No safety corrections generated for this segment.</p>
                      </div>
                    )}
                  </div>

                  {/* Data Sources Context */}
                  <div className="mt-8 border-t border-border pt-6">
                    <h3 className="text-xs font-bold text-text-main flex items-center gap-1.5 mb-3">
                      <Database className="w-3.5 h-3.5 text-blue-400" /> Segment Data Sources
                    </h3>
                    <ul className="space-y-2 text-[10px] text-text-muted">
                      <li><span className="font-bold text-text-main">Geometry:</span> OpenStreetMap vector paths (Linestring)</li>
                      <li><span className="font-bold text-text-main">Crash Hist:</span> Police FIRs snapped to nearest segment</li>
                      <li><span className="font-bold text-text-main">VRU/Speed:</span> OSM POIs & Telematics API endpoints</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
