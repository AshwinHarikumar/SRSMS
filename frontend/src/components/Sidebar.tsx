import React from 'react';
import { motion } from 'framer-motion';
import {
  ShieldAlert, LayoutDashboard, Map, Layers, Brain, AlertTriangle,
  MapPin, UploadCloud, LogOut,
  Crosshair, PersonStanding, Star, Scale, Globe
} from 'lucide-react';

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'stateanalysis', label: 'State Analysis', icon: Globe },
  { id: 'riskmap', label: 'Risk Map', icon: Map },
  { id: 'categories', label: 'Categories', icon: Layers },
  { id: 'models', label: 'AI Models', icon: Brain },
  { id: 'blackspots', label: 'Black Spots', icon: Crosshair },
  { id: 'vru', label: 'VRU Exposure', icon: PersonStanding },
  { id: 'starrating', label: 'Star Rating', icon: Star },
  { id: 'ahp', label: 'AHP Weights', icon: Scale },
  { id: 'accidents', label: 'Accidents', icon: AlertTriangle },
  { id: 'pois', label: 'Points of Interest', icon: MapPin },
  { id: 'upload', label: 'Data Upload', icon: UploadCloud },
];

export default function Sidebar({ activePage, onNavigate, onLogout }: SidebarProps) {
  return (
    <aside className="sidebar h-screen fixed left-0 top-0 z-50 flex flex-col w-[260px]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-border">
        <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-100 text-blue-600 shadow-sm">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-slate-900 tracking-tight leading-tight">SRSMS</h1>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-0.5">Command Center</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03 }}
              onClick={() => onNavigate(item.id)}
              className={`sidebar-item w-full ${isActive ? 'active' : ''}`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 transition-colors duration-200 ${isActive ? 'text-primary' : 'text-slate-400 group-hover:text-slate-600'}`} />
              <span className="tracking-wide">{item.label}</span>
            </motion.button>
          );
        })}
      </nav>

      {/* Bottom Controls */}
      <div className="px-4 py-5 border-t border-border">
        <button
          onClick={onLogout}
          className="sidebar-item w-full text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span className="tracking-wide">Logout Session</span>
        </button>
      </div>
    </aside>
  );
}
