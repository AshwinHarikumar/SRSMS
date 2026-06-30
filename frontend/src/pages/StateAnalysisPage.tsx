import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, 
  CartesianGrid, Legend, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { 
  Globe, ShieldAlert, Award, Compass, TrendingUp, Info, 
  MapPin, Activity, Navigation, AlertTriangle, AlertCircle
} from 'lucide-react';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'];

export default function StateAnalysisPage() {
  const [selectedState, setSelectedState] = useState<'maharashtra' | 'kerala'>('maharashtra');
  const [selectedSegment, setSelectedSegment] = useState<any>(null);

  // Data states
  const [mhStats, setMhStats] = useState<any>(null);
  const [mhHelmet, setMhHelmet] = useState<any[]>([]);
  const [mhMap, setMhMap] = useState<any>(null);

  const [klStats, setKlStats] = useState<any>(null);
  const [klTrends, setKlTrends] = useState<any[]>([]);
  const [klMap, setKlMap] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        // Load Maharashtra data
        const [mhStatsRes, mhHelmetRes, mhMapRes] = await Promise.all([
          fetch('/data/state_analysis/maharashtra_stats.json'),
          fetch('/data/state_analysis/maharashtra_helmet_spi.json'),
          fetch('/data/state_analysis/maharashtra_map.geojson')
        ]);
        setMhStats(await mhStatsRes.json());
        setMhHelmet(await mhHelmetRes.json());
        setMhMap(await mhMapRes.json());

        // Load Kerala data
        const [klStatsRes, klTrendsRes, klMapRes] = await Promise.all([
          fetch('/data/state_analysis/kerala_stats.json'),
          fetch('/data/state_analysis/kerala_accidents_trends.json'),
          fetch('/data/state_analysis/kerala_map.geojson')
        ]);
        setKlStats(await klStatsRes.json());
        setKlTrends(await klTrendsRes.json());
        setKlMap(await klMapRes.json());

      } catch (err) {
        console.error('Failed to load state-wise data files:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const containerVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
  };

  // Map segment click handler
  const onEachFeatureMh = (feature: any, layer: any) => {
    layer.on({
      click: () => {
        setSelectedSegment(feature.properties);
      }
    });
  };

  const onEachFeatureKl = (feature: any, layer: any) => {
    layer.on({
      click: () => {
        setSelectedSegment({
          id: feature.properties.id,
          road_name: feature.properties.road_name,
          class: feature.properties.class,
          ref: feature.properties.ref,
          network: feature.properties.network
        });
      }
    });
  };

  // GeoJSON style maps
  const styleMhFeature = (feature: any) => {
    const isSelected = selectedSegment && selectedSegment.id === feature.properties.id;
    let color = '#2563eb'; // secondary default
    if (feature.properties.class === 'trunk') color = '#ef4444'; // trunk
    else if (feature.properties.class === 'primary') color = '#f59e0b'; // primary
    else if (feature.properties.class === 'motorway') color = '#8b5cf6'; // motorway

    return {
      color,
      weight: isSelected ? 6 : 2.5,
      opacity: isSelected ? 1.0 : 0.65
    };
  };

  const styleKlFeature = (feature: any) => {
    const isSelected = selectedSegment && selectedSegment.id === feature.properties.id;
    let color = '#10b981'; // default
    if (feature.properties.class === 'trunk') color = '#ef4444';
    else if (feature.properties.class === 'primary') color = '#f59e0b';
    else if (feature.properties.class === 'secondary') color = '#3b82f6';

    return {
      color,
      weight: isSelected ? 6 : 2.5,
      opacity: isSelected ? 1.0 : 0.65
    };
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
        <Activity className="w-12 h-12 text-primary animate-pulse mb-4" />
        <h2 className="text-xl font-bold text-text-main">Loading State safety databases...</h2>
        <p className="text-sm text-text-muted mt-1">Processing layers & statistical trends...</p>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-8 space-y-8 max-w-[1600px] mx-auto"
    >
      {/* Header & Toggle */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-text-main tracking-tight flex items-center gap-3">
            <Globe className="w-8 h-8 text-primary" /> State-level Safety Analysis
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Compare regional safety performance indices, historical trends, and road network classes
          </p>
        </div>

        {/* State Toggle Buttons */}
        <div className="flex bg-surface border border-border p-1 rounded-2xl shadow-sm self-start md:self-auto">
          <button
            onClick={() => {
              setSelectedState('maharashtra');
              setSelectedSegment(null);
            }}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all ${
              selectedState === 'maharashtra'
                ? 'bg-primary text-white shadow-md'
                : 'text-text-muted hover:text-text-main hover:bg-slate-100'
            }`}
          >
            Maharashtra Overview
          </button>
          <button
            onClick={() => {
              setSelectedState('kerala');
              setSelectedSegment(null);
            }}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all ${
              selectedState === 'kerala'
                ? 'bg-primary text-white shadow-md'
                : 'text-text-muted hover:text-text-main hover:bg-slate-100'
            }`}
          >
            Kerala Overview
          </button>
        </div>
      </motion.div>

      {/* Conditional State Views */}
      <AnimatePresence mode="wait">
        {selectedState === 'maharashtra' ? (
          <motion.div
            key="maharashtra-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="space-y-8"
          >
            {/* Maharashtra Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="stat-card border-t-2 border-t-primary">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Analyzed Segments</span>
                  <Award className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-3xl font-black text-text-main tracking-tight">
                  {mhStats?.total_segments?.toLocaleString()}
                </h3>
                <p className="text-xs text-text-muted mt-1">High-resolution GIS segments</p>
              </div>

              <div className="stat-card border-t-2 border-t-emerald-500">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Total Road Length</span>
                  <Compass className="w-5 h-5 text-emerald-500" />
                </div>
                <h3 className="text-3xl font-black text-text-main tracking-tight">
                  {mhStats?.total_length_km?.toLocaleString()} km
                </h3>
                <p className="text-xs text-text-muted mt-1">Total mapped highway network</p>
              </div>

              <div className="stat-card border-t-2 border-t-amber-500">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Avg Speed Limit</span>
                  <Navigation className="w-5 h-5 text-amber-500" />
                </div>
                <h3 className="text-3xl font-black text-text-main tracking-tight">
                  {mhStats?.avg_speed_limit} km/h
                </h3>
                <p className="text-xs text-text-muted mt-1">Design speed standard</p>
              </div>

              <div className="stat-card border-t-2 border-t-violet-500">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Avg Median Speed</span>
                  <TrendingUp className="w-5 h-5 text-violet-500" />
                </div>
                <h3 className="text-3xl font-black text-text-main tracking-tight">
                  {mhStats?.avg_median_speed} km/h
                </h3>
                <p className="text-xs text-text-muted mt-1">Observed operating speed</p>
              </div>
            </div>

            {/* Map & Detail Panel Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Interactive map */}
              <div className="lg:col-span-2 glass-panel h-[500px] relative overflow-hidden flex flex-col">
                <div className="p-4 bg-slate-50 border-b border-border flex items-center justify-between">
                  <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" /> Maharashtra Sampled Network Map
                  </h3>
                  <span className="text-xs font-semibold text-text-muted">Showing 1,000 Major Highway Segments</span>
                </div>
                <div className="flex-1 w-full relative z-10">
                  <MapContainer center={[19.75, 75.71]} zoom={6} className="w-full h-full" zoomControl={true}>
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    />
                    {mhMap && (
                      <GeoJSON
                        data={mhMap}
                        style={styleMhFeature}
                        onEachFeature={onEachFeatureMh}
                      />
                    )}
                  </MapContainer>
                </div>
              </div>

              {/* Detail drawer / stats panel */}
              <div className="glass-panel p-6 flex flex-col justify-between min-h-[500px]">
                {selectedSegment ? (
                  <div className="space-y-6">
                    <div className="border-b border-border pb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-primary bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
                          {selectedSegment.class}
                        </span>
                        <span className="text-xs font-bold text-text-muted">ID: {selectedSegment.id}</span>
                      </div>
                      <h3 className="text-xl font-extrabold text-text-main mt-2 leading-snug">
                        {selectedSegment.road_name}
                      </h3>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Speed Limit</span>
                        <p className="text-lg font-extrabold text-slate-800 mt-0.5">
                          {selectedSegment.speed_limit ? `${selectedSegment.speed_limit} km/h` : 'N/A'}
                        </p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Median Speed</span>
                        <p className="text-lg font-extrabold text-slate-800 mt-0.5">
                          {selectedSegment.median_speed ? `${selectedSegment.median_speed.toFixed(1)} km/h` : 'N/A'}
                        </p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Over Speeding %</span>
                        <p className="text-lg font-extrabold text-red-500 mt-0.5">
                          {selectedSegment.percent_over_limit ? `${(selectedSegment.percent_over_limit).toFixed(1)}%` : '0%'}
                        </p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Land Use Type</span>
                        <p className="text-lg font-extrabold text-slate-800 mt-0.5 capitalize">
                          {selectedSegment.land_use?.toLowerCase()}
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-805">Speed Management Advisory</h4>
                        <p className="text-[11px] text-text-muted mt-1 leading-normal">
                          {selectedSegment.percent_over_limit > 15 
                            ? 'Speed violation rates exceed safety thresholds. Install speed-calming measures or automatic speed detection cameras.' 
                            : 'Vehicle speeds are within nominal designs. Continue routine compliance checks.'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                    <Info className="w-10 h-10 text-slate-300 mb-3" />
                    <h3 className="text-sm font-bold text-slate-700">No Segment Selected</h3>
                    <p className="text-xs text-text-muted mt-1 max-w-[220px]">
                      Click on any highlighted road segment on the map to view detailed GIS speed indicators
                    </p>
                  </div>
                )}

                {/* Legend */}
                <div className="border-t border-border pt-4 mt-6">
                  <h4 className="text-xs font-bold text-text-main mb-2">Road Network Color Legend</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-1.5 bg-[#ef4444] rounded"></span>
                      <span className="font-semibold text-text-muted">Trunk Highways</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-1.5 bg-[#f59e0b] rounded"></span>
                      <span className="font-semibold text-text-muted">Primary Routes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-1.5 bg-[#2563eb] rounded"></span>
                      <span className="font-semibold text-text-muted">Secondary Roads</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-1.5 bg-[#8b5cf6] rounded"></span>
                      <span className="font-semibold text-text-muted">Motorways</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Helmet Wearing SPI Chart */}
              <div className="glass-panel p-6 flex flex-col">
                <div className="mb-4">
                  <h3 className="text-base font-extrabold text-text-main flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-primary" /> Helmet Wearer Safety Performance Index (SPI)
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    GPKG Boundaries Dataset: Helmet compliance scores among drivers, passengers, and overall
                  </p>
                </div>
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mhHelmet} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="region" tick={{ fontSize: 11, fontWeight: 'bold' }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" domain={[0, 1.0]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                      <ChartTooltip formatter={(v: any) => [`${(v * 100).toFixed(0)}%`]} />
                      <Legend wrapperStyle={{ fontSize: 12, fontWeight: 'bold', paddingTop: 10 }} />
                      <Bar dataKey="all_riders_spi" name="All Riders SPI" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="driver_spi" name="Driver SPI" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="passenger_spi" name="Passenger SPI" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Road Class & Landuse Distributions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Road Class */}
                <div className="glass-panel p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-text-main">Road Class Distribution</h3>
                    <p className="text-xs text-text-muted mt-0.5">Proportion of road classifications in GIS database</p>
                  </div>
                  <div className="h-[220px] flex items-center justify-center my-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={mhStats?.class_distribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {mhStats?.class_distribution.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {mhStats?.class_distribution.map((entry: any, index: number) => (
                      <div key={entry.name} className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                        <span className="font-semibold text-text-muted capitalize">{entry.name}:</span>
                        <span className="font-bold text-text-main">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Land Use */}
                <div className="glass-panel p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-text-main">Land Use Breakdown</h3>
                    <p className="text-xs text-text-muted mt-0.5">Categorization of segments by environmental context</p>
                  </div>
                  <div className="h-[220px] my-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={mhStats?.landuse_distribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 'bold' }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <ChartTooltip />
                        <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-between items-center text-xs border-t border-border pt-3">
                    <span className="text-text-muted font-semibold">Rural Focus Segments:</span>
                    <span className="font-black text-violet-600 bg-violet-50 px-2 py-0.5 rounded-md">
                      {((mhStats?.landuse_distribution.find((d: any) => d.name === 'RURAL')?.value || 0) / (mhStats?.total_segments || 1) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="kerala-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="space-y-8"
          >
            {/* Kerala Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="stat-card border-t-2 border-t-primary">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">OSM Mapped Highways</span>
                  <Compass className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-3xl font-black text-text-main tracking-tight">
                  {klStats?.total_segments?.toLocaleString()}
                </h3>
                <p className="text-xs text-text-muted mt-1">Highways imported from OSM</p>
              </div>

              <div className="stat-card border-t-2 border-t-red-500">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Total Accidents (01-18)</span>
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="text-3xl font-black text-text-main tracking-tight">
                  {klStats?.total_accidents_period?.toLocaleString()}
                </h3>
                <p className="text-xs text-text-muted mt-1">Total recorded road crashes</p>
              </div>

              <div className="stat-card border-t-2 border-t-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Total Fatalities (01-18)</span>
                  <AlertCircle className="w-5 h-5 text-slate-800" />
                </div>
                <h3 className="text-3xl font-black text-text-main tracking-tight">
                  {klStats?.total_deaths_period?.toLocaleString()}
                </h3>
                <p className="text-xs text-text-muted mt-1">Fatalities recorded in period</p>
              </div>

              <div className="stat-card border-t-2 border-t-amber-500">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Total Injuries (01-18)</span>
                  <Activity className="w-5 h-5 text-amber-500" />
                </div>
                <h3 className="text-3xl font-black text-text-main tracking-tight">
                  {klStats?.total_injuries_period?.toLocaleString()}
                </h3>
                <p className="text-xs text-text-muted mt-1">Injured casualties in crashes</p>
              </div>
            </div>

            {/* Map & Detail Panel Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Interactive map */}
              <div className="lg:col-span-2 glass-panel h-[500px] relative overflow-hidden flex flex-col">
                <div className="p-4 bg-slate-50 border-b border-border flex items-center justify-between">
                  <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-500" /> Kerala OSM Road Network Map
                  </h3>
                  <span className="text-xs font-semibold text-text-muted">Showing 1,000 Sampled Major Highways</span>
                </div>
                <div className="flex-1 w-full relative z-10">
                  <MapContainer center={[10.5276, 76.6126]} zoom={8} className="w-full h-full" zoomControl={true}>
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    />
                    {klMap && (
                      <GeoJSON
                        data={klMap}
                        style={styleKlFeature}
                        onEachFeature={onEachFeatureKl}
                      />
                    )}
                  </MapContainer>
                </div>
              </div>

              {/* Detail drawer / stats panel */}
              <div className="glass-panel p-6 flex flex-col justify-between min-h-[500px]">
                {selectedSegment ? (
                  <div className="space-y-6">
                    <div className="border-b border-border pb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
                          {selectedSegment.class}
                        </span>
                        <span className="text-xs font-bold text-text-muted">OSM Way: {selectedSegment.id}</span>
                      </div>
                      <h3 className="text-xl font-extrabold text-text-main mt-2 leading-snug">
                        {selectedSegment.road_name}
                      </h3>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">Road Network Ref</span>
                        <span className="text-base font-extrabold text-slate-800 mt-1 block">
                          {selectedSegment.ref || 'N/A'}
                        </span>
                      </div>
                      
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">Network Territory</span>
                        <span className="text-base font-extrabold text-slate-800 mt-1 block">
                          {selectedSegment.network || 'State Highway / Major District Road'}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
                      <Info className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">OSM Network Attribute</h4>
                        <p className="text-[11px] text-text-muted mt-1 leading-normal">
                          This segment is extracted from the OpenStreetMap Kerala database. Its classification dictates regional speeds and infrastructure design.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                    <Info className="w-10 h-10 text-slate-300 mb-3" />
                    <h3 className="text-sm font-bold text-slate-700">No Segment Selected</h3>
                    <p className="text-xs text-text-muted mt-1 max-w-[220px]">
                      Click on any highlighted Kerala highway on the map to view detailed OSM classification data
                    </p>
                  </div>
                )}

                {/* Legend */}
                <div className="border-t border-border pt-4 mt-6">
                  <h4 className="text-xs font-bold text-text-main mb-2">Road Network Color Legend</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-1.5 bg-[#ef4444] rounded"></span>
                      <span className="font-semibold text-text-muted">Trunk Routes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-1.5 bg-[#f59e0b] rounded"></span>
                      <span className="font-semibold text-text-muted">Primary Highways</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-1.5 bg-[#3b82f6] rounded"></span>
                      <span className="font-semibold text-text-muted">Secondary Roads</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-1.5 bg-[#10b981] rounded"></span>
                      <span className="font-semibold text-text-muted">Other Links</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Historical Trend of Accidents in Kerala */}
              <div className="glass-panel p-6 xl:col-span-2 flex flex-col">
                <div className="mb-4">
                  <h3 className="text-base font-extrabold text-text-main flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" /> Historical Accident & Severity Trends (2001 - 2018)
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Official crash statistics demonstrating the annual frequency of accidents, deaths, and injuries in Kerala
                  </p>
                </div>
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={klTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorAccidents" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorInjuries" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#fb923c" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#fb923c" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="year" tick={{ fontSize: 11, fontWeight: 'bold' }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <ChartTooltip />
                      <Legend wrapperStyle={{ fontSize: 12, fontWeight: 'bold', paddingTop: 10 }} />
                      <Area type="monotone" dataKey="accidents" name="Total Accidents" stroke="#3b82f6" fillOpacity={1} fill="url(#colorAccidents)" strokeWidth={2.5} />
                      <Area type="monotone" dataKey="injuries" name="Total Injuries" stroke="#fb923c" fillOpacity={1} fill="url(#colorInjuries)" strokeWidth={2.5} />
                      <Line type="monotone" dataKey="deaths" name="Fatalities (Deaths)" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Kerala Road Class Pie Chart */}
              <div className="glass-panel p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-text-main flex items-center gap-2">
                    <Compass className="w-5 h-5 text-emerald-500" /> OSM Road Types
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">Classification of highway networks in OpenStreetMap Kerala</p>
                </div>
                <div className="h-[240px] flex items-center justify-center my-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={klStats?.class_distribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {klStats?.class_distribution.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 text-xs max-h-[140px] overflow-y-auto">
                  {klStats?.class_distribution.map((entry: any, index: number) => (
                    <div key={entry.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                        <span className="font-semibold text-text-muted capitalize">{entry.name}</span>
                      </div>
                      <span className="font-bold text-text-main">{entry.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
