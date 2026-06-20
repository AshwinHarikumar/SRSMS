/// <reference types="vite/client" />
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Download, RefreshCw, Loader2 } from 'lucide-react';
import { get, set } from 'idb-keyval';

import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import RiskMapPage from './pages/RiskMapPage';
import CategoriesPage from './pages/CategoriesPage';
import ModelsPage from './pages/ModelsPage';
import AccidentsPage from './pages/AccidentsPage';
import POIsPage from './pages/POIsPage';
import DataUpload from './components/DataUpload';
import BlackSpotsPage from './pages/BlackSpotsPage';
import VRUExposurePage from './pages/VRUExposurePage';
import StarRatingPage from './pages/StarRatingPage';
import AHPWeightsPage from './pages/AHPWeightsPage';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [activePage, setActivePage] = useState('dashboard');

  // Data state
  const [stats, setStats] = useState<any>({ critical: 0, high: 0, trends: [], recommendations: [], black_spots: 0, avg_star_rating: 0, vru_high_risk: 0 });
  const [geoData, setGeoData] = useState<any>(null);
  const [poiData, setPoiData] = useState<any>(null);
  const [accidentsData, setAccidentsData] = useState<any>(null);
  const [blackspotData, setBlackspotData] = useState<any>(null);
  const [ahpProfile, setAhpProfile] = useState<any>(null);
  const [districts, setDistricts] = useState<any[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('All');

  // Map state
  const [showPois, setShowPois] = useState(false);
  const [showAccidents, setShowAccidents] = useState(false);
  const [riskFilter, setRiskFilter] = useState<string>('All');
  const [overlayMode, setOverlayMode] = useState<'Risk' | 'Traffic' | 'Speed'>('Risk');

  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState('Initializing...');

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const loadInitialData = async (forceRefresh = false) => {
    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingStatus('Checking local cache...');

    try {
      let cachedStats = !forceRefresh ? await get('srsms-stats') : null;
      let cachedSegments = !forceRefresh ? await get('srsms-segments-All') : null;
      let cachedAhp = !forceRefresh ? await get('srsms-ahp') : null;

      if (cachedStats && cachedSegments && cachedAhp && !cachedSegments.error) {
        setStats(cachedStats);
        setGeoData(cachedSegments);
        setAhpProfile(cachedAhp);
        setLoadingProgress(100);
        setLoadingStatus('Loaded from cache!');
        setTimeout(() => setIsLoading(false), 500);
        return;
      }

      setLoadingStatus('Fetching analytics stats...');
      setLoadingProgress(10);
      const statsRes = await fetch(`${API_URL}/api/data/stats`);
      const statsData = await statsRes.json();
      setStats(statsData);
      await set('srsms-stats', statsData);

      setLoadingStatus('Fetching AHP profiles...');
      setLoadingProgress(20);
      const ahpRes = await fetch(`${API_URL}/api/data/ahp/active`);
      const ahpData = await ahpRes.json();
      setAhpProfile(ahpData);
      await set('srsms-ahp', ahpData);

      setLoadingStatus('Downloading road network geometry...');
      const segmentsRes = await fetch(`${API_URL}/api/data/segments`);
      
      // Read content length if provided, otherwise assume ~7MB (7000000 bytes) for progress
      const contentLength = segmentsRes.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 7000000;
      let loaded = 0;

      const reader = segmentsRes.body?.getReader();
      const chunks = [];
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          const percent = 20 + Math.round((loaded / total) * 75);
          setLoadingProgress(Math.min(percent, 95));
        }
      }

      setLoadingStatus('Processing geographical data...');
      setLoadingProgress(98);
      
      const blob = new Blob(chunks);
      const text = await blob.text();
      const segmentsData = JSON.parse(text);
      
      if (segmentsData.error) {
        throw new Error(segmentsData.error);
      }
      
      setGeoData(segmentsData);
      await set('srsms-segments-All', segmentsData);

      setLoadingProgress(100);
      setLoadingStatus('Data loaded successfully!');
      setTimeout(() => setIsLoading(false), 800);

    } catch (error) {
      console.error('Failed to load initial data:', error);
      setLoadingStatus('Error loading data. Please refresh.');
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadInitialData();
    }
  }, [isAuthenticated]);

  // Fetch districts list on mount
  useEffect(() => {
    if (isAuthenticated) {
      fetch(`${API_URL}/api/data/districts`)
        .then(res => res.json())
        .then(data => setDistricts(data))
        .catch(console.error);
    }
  }, [isAuthenticated]);

  // Fetch segments with filter (only when filter changes from 'All')
  useEffect(() => {
    if (isAuthenticated && riskFilter !== 'All') {
      let url = `${API_URL}/api/data/segments`;
      const filterMap: any = {
        'Critical Only': 'Red',
        'High+': 'Red,Orange',
        'Moderate+': 'Red,Orange,Yellow'
      };
      if (filterMap[riskFilter]) {
        url += `?risk=${filterMap[riskFilter]}`;
      }
      fetch(url)
        .then(res => res.json())
        .then(data => setGeoData(data))
        .catch(console.error);
    } else if (isAuthenticated && riskFilter === 'All' && !isLoading) {
      // If we go back to 'All', grab from cache
      get('srsms-segments-All').then((cached: any) => {
        if (cached) setGeoData(cached);
      });
    }
  }, [isAuthenticated, riskFilter]);

  // Fetch POIs on demand
  useEffect(() => {
    if (isAuthenticated && showPois && !poiData) {
      fetch(`${API_URL}/api/data/pois`)
        .then(res => res.json())
        .then(data => setPoiData(data))
        .catch(console.error);
    }
  }, [isAuthenticated, showPois, poiData]);

  // Fetch accidents on demand
  useEffect(() => {
    if (isAuthenticated && showAccidents && !accidentsData) {
      fetch(`${API_URL}/api/data/accidents`)
        .then(res => res.json())
        .then(data => setAccidentsData(data))
        .catch(console.error);
    }
  }, [isAuthenticated, showAccidents, accidentsData]);



  const fetchAccidents = (districtId?: number) => {
    let url = `${API_URL}/api/data/accidents`;
    if (districtId) {
      url += `?districtId=${districtId}`;
    }
    fetch(url)
      .then(res => res.json())
      .then(data => setAccidentsData(data))
      .catch(console.error);
  };

  const fetchStats = (districtId?: number) => {
    let url = `${API_URL}/api/data/stats`;
    if (districtId) {
      url += `?districtId=${districtId}`;
    }
    fetch(url)
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(console.error);
  };

  const fetchSegments = (districtId?: number) => {
    if (!districtId) {
      get('srsms-segments-All').then((cached: any) => {
        if (cached && !cached.error) {
          setGeoData(cached);
        } else {
          fetch(`${API_URL}/api/data/segments`)
            .then(res => res.json())
            .then(data => {
              setGeoData(data);
              set('srsms-segments-All', data);
            })
            .catch(console.error);
        }
      });
    } else {
      fetch(`${API_URL}/api/data/segments?districtId=${districtId}`)
        .then(res => res.json())
        .then(data => setGeoData(data))
        .catch(console.error);
    }
  };

  const handleDistrictChange = (districtId: string) => {
    setSelectedDistrict(districtId);
    if (districtId === 'All') {
      fetchStats();
      fetchSegments();
    } else {
      const dId = parseInt(districtId, 10);
      fetchStats(dId);
      fetchSegments(dId);
    }
  };

  const fetchPois = () => {
    fetch(`${API_URL}/api/data/pois`)
      .then(res => res.json())
      .then(data => setPoiData(data))
      .catch(console.error);
  };

  const fetchBlackspots = () => {
    fetch(`${API_URL}/api/data/blackspots`)
      .then(res => res.json())
      .then(data => setBlackspotData(data))
      .catch(console.error);
  };

  const handleSaveAHPProfile = (profile: any) => {
    fetch(`${API_URL}/api/data/ahp/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    })
      .then(res => res.json())
      .then(data => {
        setAhpProfile(profile);
      })
      .catch(console.error);
  };

  const handleExport = () => {
    window.open(`${API_URL}/api/data/export/rankings`);
  };

  // ────────────────────────────────
  // MAIN APPLICATION SHELL
  // ────────────────────────────────
  const sidebarWidth = 260;

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return (
          <DashboardPage
            stats={stats}
            districts={districts}
            selectedDistrict={selectedDistrict}
            onDistrictChange={handleDistrictChange}
            onNavigate={setActivePage}
          />
        );
      case 'riskmap':
        return (
          <RiskMapPage
            geoData={geoData}
            poiData={poiData}
            accidentsData={accidentsData}
            riskFilter={riskFilter}
            onRiskFilterChange={setRiskFilter}
            overlayMode={overlayMode}
            onOverlayModeChange={setOverlayMode}
            showPois={showPois}
            onTogglePois={() => setShowPois(p => !p)}
            showAccidents={showAccidents}
            onToggleAccidents={() => setShowAccidents(a => !a)}
          />
        );
      case 'categories':
        return (
          <CategoriesPage
            geoData={geoData}
            districts={districts}
            selectedDistrict={selectedDistrict}
            onDistrictChange={handleDistrictChange}
            onNavigate={setActivePage}
          />
        );
      case 'models':
        return <ModelsPage geoData={geoData} />;
      case 'blackspots':
        return <BlackSpotsPage geoData={geoData} blackspotData={blackspotData} onFetchBlackspots={fetchBlackspots} />;
      case 'vru':
        return <VRUExposurePage geoData={geoData} />;
      case 'starrating':
        return <StarRatingPage geoData={geoData} />;
      case 'ahp':
        return <AHPWeightsPage ahpProfile={ahpProfile} onSaveProfile={handleSaveAHPProfile} />;
      case 'accidents':
        return <AccidentsPage accidentsData={accidentsData} onFetchAccidents={fetchAccidents} />;
      case 'pois':
        return <POIsPage poiData={poiData} geoData={geoData} onFetchPois={fetchPois} />;
      case 'upload':
        return <DataUpload isPage={true} />;
      default:
        return (
          <DashboardPage
            stats={stats}
            districts={districts}
            selectedDistrict={selectedDistrict}
            onDistrictChange={handleDistrictChange}
            onNavigate={setActivePage}
          />
        );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-10 rounded-3xl shadow-xl border border-slate-200 max-w-md w-full"
        >
          <div className="flex items-center justify-center mb-6">
            <div className="bg-blue-600 p-4 rounded-2xl shadow-lg shadow-blue-500/30">
              <ShieldAlert className="w-10 h-10 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-slate-800 text-center mb-2 tracking-tight">Initializing SRSMS</h2>
          <p className="text-sm text-slate-500 text-center mb-8 font-medium">{loadingStatus}</p>
          
          <div className="w-full bg-slate-100 rounded-full h-3 mb-3 overflow-hidden shadow-inner">
            <motion.div 
              className="bg-blue-600 h-3 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${loadingProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-widest">
            <span>Loading...</span>
            <span className="text-blue-600">{loadingProgress}%</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text-main font-sans">
      {/* Sidebar */}
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        onLogout={() => setIsAuthenticated(false)}
      />

      {/* Main Content Area */}
      <div
        className="min-h-screen transition-all duration-300"
        style={{ marginLeft: sidebarWidth }}
      >
        {/* Top Bar */}
        {activePage !== 'riskmap' && (
          <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md border-b border-border px-10 py-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
              <div className="relative flex items-center justify-center">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 z-10"></div>
                <div className="absolute h-4 w-4 rounded-full bg-emerald-500/30 animate-ping"></div>
              </div>
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-[0.2em] bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">System Active</span>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => loadInitialData(true)} className="btn-secondary flex items-center gap-2 text-xs font-bold px-4 hover:bg-slate-100">
                <RefreshCw className="w-4 h-4" />
                REFRESH DATA
              </button>
              <button onClick={handleExport} className="btn-secondary flex items-center gap-2 text-xs font-bold px-4">
                <Download className="w-4 h-4" />
                EXPORT CSV
              </button>
              <div className="h-8 w-px bg-border"></div>
              <div className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-1.5 rounded-xl transition-colors">
                <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm">
                  A
                </div>
                <div className="flex flex-col pr-2">
                  <span className="text-sm font-bold text-slate-900 leading-tight">Admin User</span>
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Authority</span>
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Page Content */}
        <main className={activePage === 'riskmap' ? 'h-screen' : ''}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={activePage === 'riskmap' ? 'h-full' : ''}
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default App;
