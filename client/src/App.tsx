import { useState, useEffect } from 'react';
import { CANDIDATE_SITES } from './data/candidateSites';
import { assessLandingSiteRisk } from './engine/riskEngine';
import { 
  computeSiteIllumination, 
  computeSiteEarthLos,
  estimateLunarTerrain,
  formatMissionUtc,
  parseMissionUtcInputs,
} from './utils/lunarTelemetry';
import { CandidateSite, LanderProfile } from './types';
import { LunarGlobe3D } from './components/LunarGlobe3D';
import { LandingParametersPanel, DEFAULT_MISSION_PARAMETERS } from './components/LandingParametersPanel';
import { HorizonPlot } from './components/HorizonPlot';
import { ElevationProfile } from './components/ElevationProfile';
import { CountdownTimers } from './components/CountdownTimers';
import { Starfield } from './components/Starfield';
import { MethodologyModal } from './components/MethodologyModal';
import { DataAttribution } from './components/DataAttribution';
import { PlainEnglishSummary } from './components/PlainEnglishSummary';
import { ViewModeContext, ViewMode, Term, GlossaryKey } from './components/Glossary';
import { 
  ShieldCheck, 
  AlertTriangle, 
  XCircle, 
  Compass, 
  Sun, 
  Sliders,
  BarChart3,
  X,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Flame,
  Activity,
  Scale,
  GraduationCap,
  Crosshair,
  Clock
} from 'lucide-react';

// Maps engine factor names to glossary terms (used for Educator-mode tooltips)
const FACTOR_TERM: Record<string, GlossaryKey> = {
  'Terrain Slope': 'slope',
  'Surface Roughness': 'roughness',
  'Solar Illumination': 'illumination',
  'Earth Line-of-Sight (LOS)': 'los',
};

export default function App() {
  const [allSites, setAllSites] = useState<CandidateSite[]>(CANDIDATE_SITES);
  const [landingParams, setLandingParams] = useState<LanderProfile>(DEFAULT_MISSION_PARAMETERS);
  const [selectedSite, setSelectedSite] = useState<CandidateSite>(CANDIDATE_SITES[0]);
  const [simulatedDateOffset, setSimulatedDateOffset] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [customLatInput, setCustomLatInput] = useState<string>('-89.54');
  const [customLonInput, setCustomLonInput] = useState<string>('0.00');
  const [customNameInput, setCustomNameInput] = useState<string>('');
  const [customCoordError, setCustomCoordError] = useState<string>('');

  const missionUtc = formatMissionUtc(simulatedDateOffset);

  const handleDeployCustomCoordinates = (lat: number, lon: number, customName?: string) => {
    const newSite = estimateLunarTerrain(Number(lat.toFixed(2)), Number(lon.toFixed(2)), customName);
    setAllSites((prev) => {
      // Keep the 5 canonical sites + up to 6 most recent custom targets
      const presets = prev.slice(0, CANDIDATE_SITES.length);
      const custom = prev.slice(CANDIDATE_SITES.length).slice(-5);
      return [...presets, ...custom, newSite];
    });
    setSelectedSite(newSite);
    setCustomLatInput(newSite.coordinates.latitude.toFixed(2));
    setCustomLonInput(newSite.coordinates.longitude.toFixed(2));
    setCustomNameInput('');
    setCustomCoordError('');
    setIsRightDrawerOpen(true);
  };

  const handleSubmitDrawerCoordinates = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(customLatInput);
    const lon = Number(customLonInput);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setCustomCoordError('Latitude must be between -90° and +90°.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setCustomCoordError('Longitude must be between -180° and +180°.');
      return;
    }
    handleDeployCustomCoordinates(lat, lon, customNameInput.trim() || undefined);
  };

  // Left & Right drawer toggles for clean, centered map experience
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState<boolean>(false);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState<boolean>(false);

  // Audience view (Mission Planner vs. Educator) and methodology modal
  const [viewMode, setViewMode] = useState<ViewMode>('planner');
  const [isMethodologyOpen, setIsMethodologyOpen] = useState<boolean>(false);

  // Synodic lunar day/night cycle animation loop (-14d to +14d)
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setSimulatedDateOffset(prev => {
        const next = Math.round((prev + 0.1 * playbackSpeed) * 10) / 10;
        if (next > 14) {
          return -14;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed]);

  const computedIllumination = computeSiteIllumination(selectedSite, simulatedDateOffset);
  const computedEarthLos = computeSiteEarthLos(selectedSite, simulatedDateOffset);

  const assessment = assessLandingSiteRisk(
    selectedSite, 
    computedIllumination, 
    computedEarthLos, 
    landingParams
  );

  const getStatusBadge = (status: 'GREEN' | 'YELLOW' | 'RED') => {
    switch (status) {
      case 'GREEN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] font-mono text-[10px] uppercase tracking-wider font-semibold bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/40">
            <ShieldCheck className="w-3 h-3 text-[#10B981]" /> GO
          </span>
        );
      case 'YELLOW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] font-mono text-[10px] uppercase tracking-wider font-semibold bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/40">
            <AlertTriangle className="w-3 h-3 text-[#F59E0B]" /> CAUTION
          </span>
        );
      case 'RED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] font-mono text-[10px] uppercase tracking-wider font-semibold bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/40">
            <XCircle className="w-3 h-3 text-[#EF4444]" /> NO-GO
          </span>
        );
    }
  };

  return (
    <ViewModeContext.Provider value={viewMode}>
    <div
      className="fixed inset-0 w-full h-full bg-black text-white flex flex-col font-sans overflow-hidden select-none"
      style={{ overflow: 'clip' }}
    >
      {/* Background Monochrome Starfield */}
      <Starfield />

      {/* Centralized Obsidian Header with Integrated Drawer Toggles */}
      <header className="border-b border-white/[0.14] bg-[#090A0D]/95 backdrop-blur-md px-5 py-2 flex items-center justify-between relative z-40 shrink-0">
        {/* Left Drawer Trigger */}
        <button
          onClick={() => setIsLeftDrawerOpen(prev => !prev)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-[2px] font-mono text-[11px] uppercase tracking-wider font-semibold border transition-all ${
            isLeftDrawerOpen
              ? 'bg-white text-black border-white'
              : 'bg-black text-[#9CA3AF] border-white/[0.14] hover:border-white/35 hover:text-white'
          }`}
          title="Toggle Mission Inputs & Landing Parameters"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Inputs &amp; Parameters</span>
          <span className="sm:hidden">Inputs</span>
        </button>

        {/* Centralized Header Title */}
        <div className="text-center px-4">
          <h1 className="text-sm md:text-base font-mono font-bold uppercase tracking-[0.2em] text-white leading-tight">
            To Land or Not to Land
          </h1>
          <p className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280] leading-tight mt-0.5">
            Lunar Landing Site Risk Assessment &amp; Flight Telemetry
          </p>
        </div>

        {/* Right Drawer Trigger */}
        <button
          onClick={() => setIsRightDrawerOpen(prev => !prev)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-[2px] font-mono text-[11px] uppercase tracking-wider font-semibold border transition-all ${
            isRightDrawerOpen
              ? 'bg-[#12141A] text-white border-white/50'
              : 'bg-black text-[#9CA3AF] border-white/[0.14] hover:border-white/35 hover:text-white'
          }`}
          title="Toggle Risk Assessment & Telemetry Analysis"
        >
          <BarChart3 className="w-3.5 h-3.5 text-white" />
          <span className="hidden sm:inline">Telemetry</span>
          {getStatusBadge(assessment.overall_status)}
        </button>
      </header>

      {/* Main Interactive Stage with Full-Viewport 3D Lunar Globe */}
      <div
        className="flex-1 relative w-full h-full overflow-hidden"
        style={{ overflow: 'clip' }}
      >
        
        {/* Full Viewport 3D Lunar Globe */}
        <div className="absolute inset-0 z-0">
          <LunarGlobe3D 
            sites={allSites} 
            selectedSite={selectedSite} 
            onSelectSite={(site) => {
              setSelectedSite(site);
              setIsRightDrawerOpen(true);
            }} 
            sunIlluminationOffset={simulatedDateOffset}
            lander={landingParams}
            onProbeCoordinate={handleDeployCustomCoordinates}
            onChangeDateOffset={(offset) => {
              setIsPlaying(false);
              setSimulatedDateOffset(offset);
            }}
            leftDrawerOpen={isLeftDrawerOpen}
            rightDrawerOpen={isRightDrawerOpen}
          />
        </div>

        {/* ========================================================= */}
        {/* LEFT DRAWER: INPUTS (Sites, Parameters, Cycle Simulator) */}
        {/* ========================================================= */}
        <aside 
          className={`absolute top-0 bottom-0 left-0 w-96 max-w-[90vw] z-30 bg-[#090A0D]/95 backdrop-blur-xl border-r border-white/[0.14] p-4 overflow-y-auto space-y-3.5 transition-all duration-300 ease-in-out ${
            isLeftDrawerOpen ? 'translate-x-0 visible pointer-events-auto' : '-translate-x-full invisible pointer-events-none'
          }`}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-white/[0.14] pb-2.5">
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#9CA3AF]" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Mission Inputs
              </h2>
            </div>
            <button
              onClick={(e) => {
                e.currentTarget.blur();
                setIsLeftDrawerOpen(false);
              }}
              className="p-1 rounded-[2px] bg-[#12141A] hover:bg-[#1C1F26] border border-white/[0.14] text-[#9CA3AF] hover:text-white transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 1. Candidate Sites Selector (Reactive to Parameters + Synodic Time) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Compass className="w-3.5 h-3.5 text-[#9CA3AF]" /> Landing Sites ({allSites.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {allSites.map((site) => {
                const siteIllum = computeSiteIllumination(site, simulatedDateOffset);
                const siteLos = computeSiteEarthLos(site, simulatedDateOffset);
                const siteRisk = assessLandingSiteRisk(site, siteIllum, siteLos, landingParams);
                const isSelected = site.id === selectedSite.id;
                return (
                  <button
                    key={site.id}
                    onClick={() => {
                      setSelectedSite(site);
                      setIsRightDrawerOpen(true);
                    }}
                    className={`w-full text-left p-2.5 rounded-[2px] border transition-all flex flex-col gap-1 ${
                      isSelected 
                        ? 'bg-[#12141A] border-white/60' 
                        : 'bg-black border-white/[0.14] hover:border-white/35 hover:bg-[#090A0D]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-white truncate">{site.name}</span>
                      {getStatusBadge(siteRisk.overall_status)}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-[#9CA3AF] font-mono uppercase tracking-wider tabular-nums">
                      <span>{site.region}</span>
                      <span>
                        {site.terrain.slope_deg.toFixed(1)}° · {siteIllum}% SUN
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 1b. Custom Target Coordinate Input (Lat / Lon) */}
          <form
            onSubmit={handleSubmitDrawerCoordinates}
            className="bg-[#090A0D] border border-white/[0.14] rounded-[2px] p-3.5 space-y-2.5"
          >
            <div className="flex items-center justify-between border-b border-white/[0.1] pb-2">
              <h3 className="text-[11px] font-bold text-white flex items-center gap-1.5 font-mono uppercase tracking-wider">
                <Crosshair className="w-3.5 h-3.5 text-[#9CA3AF]" /> Target Coordinate Entry
              </h3>
              <span className="text-[9px] font-mono text-[#6B7280] uppercase">DEG (LOLA)</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="drawer-coord-lat" className="block text-[9px] font-mono text-[#9CA3AF] uppercase tracking-wider mb-1">
                  Latitude (-90..90)
                </label>
                <input
                  id="drawer-coord-lat"
                  type="number"
                  step="0.01"
                  min={-90}
                  max={90}
                  value={customLatInput}
                  onChange={(e) => setCustomLatInput(e.target.value)}
                  className="w-full px-2 py-1.5 bg-black border border-white/[0.14] rounded-[2px] text-xs font-mono text-white tabular-nums focus:outline-none focus:border-white/50"
                />
              </div>
              <div>
                <label htmlFor="drawer-coord-lon" className="block text-[9px] font-mono text-[#9CA3AF] uppercase tracking-wider mb-1">
                  Longitude (-180..180)
                </label>
                <input
                  id="drawer-coord-lon"
                  type="number"
                  step="0.01"
                  min={-180}
                  max={180}
                  value={customLonInput}
                  onChange={(e) => setCustomLonInput(e.target.value)}
                  className="w-full px-2 py-1.5 bg-black border border-white/[0.14] rounded-[2px] text-xs font-mono text-white tabular-nums focus:outline-none focus:border-white/50"
                />
              </div>
            </div>

            <div>
              <label htmlFor="drawer-coord-name" className="block text-[9px] font-mono text-[#9CA3AF] uppercase tracking-wider mb-1">
                Site Designation (Optional)
              </label>
              <input
                id="drawer-coord-name"
                type="text"
                placeholder="E.G. SHACKLETON FLOOR / CABEUS RIM"
                value={customNameInput}
                onChange={(e) => setCustomNameInput(e.target.value)}
                className="w-full px-2 py-1.5 bg-black border border-white/[0.14] rounded-[2px] text-[10px] font-mono text-white uppercase tracking-wider placeholder:text-[#4B5563] focus:outline-none focus:border-white/50"
              />
            </div>

            {customCoordError && (
              <div className="text-[10px] font-mono text-[#EF4444]">
                {customCoordError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-1.5 rounded-[2px] bg-white text-black hover:bg-neutral-200 font-mono text-[10px] font-bold uppercase tracking-widest transition"
            >
              Evaluate &amp; Deploy Coordinate
            </button>
          </form>

          {/* 2. Landing Safety Parameters Panel */}
          <LandingParametersPanel 
            parameters={landingParams} 
            onChange={setLandingParams} 
          />

          {/* 3. Launch Window Slip & Day/Night Animation */}
          <div className="bg-[#090A0D] border border-white/[0.14] rounded-[2px] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold text-white flex items-center gap-1.5 font-mono uppercase tracking-wider">
                <Sun className="w-3.5 h-3.5 text-[#9CA3AF]" /> Synodic Cycle Simulator
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-[2px] bg-black text-white border border-white/[0.14] tabular-nums">
                T {simulatedDateOffset >= 0 ? `+${simulatedDateOffset.toFixed(1)}` : simulatedDateOffset.toFixed(1)}d
              </span>
            </div>

            {/* Explicit Mission UTC Date & Time Picker */}
            <div className="bg-black border border-white/[0.14] rounded-[2px] p-2.5 space-y-2">
              <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-[#9CA3AF]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-white" /> Mission Epoch UTC
                </span>
                <span className="text-white font-semibold tabular-nums">{missionUtc.fullUtc}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label="Simulation UTC Date"
                  type="date"
                  value={missionUtc.dateStr}
                  onChange={(e) => {
                    const nextOffset = parseMissionUtcInputs(e.target.value, missionUtc.timeStr);
                    if (nextOffset !== null) {
                      setIsPlaying(false);
                      setSimulatedDateOffset(nextOffset);
                    }
                  }}
                  className="px-2 py-1 bg-[#090A0D] border border-white/[0.14] rounded-[2px] text-[10px] font-mono text-white tabular-nums [color-scheme:dark] focus:outline-none focus:border-white/50"
                />
                <input
                  aria-label="Simulation UTC Time"
                  type="time"
                  value={missionUtc.timeStr}
                  onChange={(e) => {
                    const nextOffset = parseMissionUtcInputs(missionUtc.dateStr, e.target.value);
                    if (nextOffset !== null) {
                      setIsPlaying(false);
                      setSimulatedDateOffset(nextOffset);
                    }
                  }}
                  className="px-2 py-1 bg-[#090A0D] border border-white/[0.14] rounded-[2px] text-[10px] font-mono text-white tabular-nums [color-scheme:dark] focus:outline-none focus:border-white/50"
                />
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { label: '-1d', delta: -1 },
                  { label: '-6h', delta: -0.25 },
                  { label: '+6h', delta: 0.25 },
                  { label: '+1d', delta: 1 },
                ].map((step) => (
                  <button
                    key={step.label}
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setSimulatedDateOffset((prev) => Math.max(-14.77, Math.min(14.77, prev + step.delta)));
                    }}
                    className="py-1 rounded-[2px] bg-[#12141A] hover:bg-white/15 border border-white/[0.12] text-[9px] font-mono uppercase text-[#9CA3AF] hover:text-white transition"
                  >
                    {step.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Play/Pause & Speed Controller */}
            <div className="flex items-center justify-between bg-black p-2 rounded-[2px] border border-white/[0.14]">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsPlaying(prev => !prev)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] text-[10px] font-mono uppercase tracking-wider font-semibold transition border ${
                    isPlaying 
                      ? 'bg-white text-black border-white' 
                      : 'bg-[#12141A] text-white border-white/[0.14] hover:border-white/40'
                  }`}
                >
                  {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>

                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setSimulatedDateOffset(0);
                  }}
                  className="p-1 rounded-[2px] bg-[#12141A] hover:bg-[#1C1F26] text-[#9CA3AF] hover:text-white border border-white/[0.14] transition"
                  title="Reset to T-0"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>

              {/* Speed Buttons */}
              <div className="flex items-center gap-1 text-[10px] font-mono">
                {[1, 2, 5].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setPlaybackSpeed(speed)}
                    className={`px-1.5 py-0.5 rounded-[2px] font-mono transition border ${
                      playbackSpeed === speed
                        ? 'bg-white text-black border-white font-bold'
                        : 'text-[#9CA3AF] border-transparent hover:text-white'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            <input 
              type="range" 
              min="-14" 
              max="14" 
              step="0.1"
              value={simulatedDateOffset}
              onChange={(e) => {
                setIsPlaying(false);
                setSimulatedDateOffset(Number(e.target.value));
              }}
              className="w-full"
            />
            <div className="flex justify-between text-[9px] font-mono uppercase tracking-wider text-[#6B7280]">
              <span>-14 Days</span>
              <span>Nominal (T-0)</span>
              <span>+14 Days</span>
            </div>

            {/* Quick Demo Presets */}
            <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-white/[0.14]">
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setSimulatedDateOffset(0);
                  setSelectedSite(CANDIDATE_SITES[0]);
                }}
                className="px-2 py-1.5 rounded-[2px] bg-black hover:bg-[#12141A] text-[10px] text-white border border-white/[0.14] flex items-center justify-center gap-1 font-mono uppercase tracking-wider"
              >
                <Zap className="w-3 h-3 text-[#10B981]" />
                <span>Nominal (T-0)</span>
              </button>
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setSimulatedDateOffset(6);
                  setSelectedSite(CANDIDATE_SITES[2]);
                }}
                className="px-2 py-1.5 rounded-[2px] bg-black hover:bg-[#12141A] text-[10px] text-[#EF4444] border border-[#EF4444]/40 flex items-center justify-center gap-1 font-mono uppercase tracking-wider"
              >
                <Flame className="w-3 h-3 text-[#EF4444]" />
                <span>Shadow Trap (+6d)</span>
              </button>
            </div>
          </div>
        </aside>

        {/* ========================================================= */}
        {/* RIGHT DRAWER: OUTPUTS (Telemetry, Risk Evaluation, Altimetry) */}
        {/* ========================================================= */}
        <aside 
          className={`absolute top-0 bottom-0 right-0 w-[500px] max-w-[92vw] z-30 bg-[#090A0D]/95 backdrop-blur-xl border-l border-white/[0.14] p-4 overflow-y-auto space-y-3.5 transition-all duration-300 ease-in-out ${
            isRightDrawerOpen ? 'translate-x-0 visible pointer-events-auto' : 'translate-x-full invisible pointer-events-none'
          }`}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-white/[0.14] pb-2.5">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-[#9CA3AF]" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Telemetry &amp; Risk Assessment
              </h2>
            </div>
            <button
              onClick={(e) => {
                e.currentTarget.blur();
                setIsRightDrawerOpen(false);
              }}
              className="p-1 rounded-[2px] bg-[#12141A] hover:bg-[#1C1F26] border border-white/[0.14] text-[#9CA3AF] hover:text-white transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Top Banner: Site Status Summary */}
          <div className="bg-black border border-white/[0.14] rounded-[2px] p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280] block">
                  {selectedSite.region} Target
                </span>
                <h3 className="text-base font-bold text-white tracking-tight mt-0.5">{selectedSite.name}</h3>
                <span className="text-[11px] text-[#9CA3AF] font-mono tabular-nums">
                  {selectedSite.coordinates.latitude}° N, {selectedSite.coordinates.longitude}° E · ELEV {selectedSite.coordinates.elevation_m}M
                </span>
              </div>
              <div className="shrink-0">{getStatusBadge(assessment.overall_status)}</div>
            </div>

            <p className="text-xs text-[#9CA3AF] leading-relaxed border-l-2 border-white/30 pl-2.5">
              {selectedSite.description}
            </p>

            <div className="bg-[#090A0D] rounded-[2px] p-2.5 border border-white/[0.14] text-[11px] font-mono flex items-center gap-2 text-white">
              <Activity className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
              <span>{assessment.overall_reason}</span>
            </div>
          </div>

          {/* Educator view: same assessment, no jargon */}
          {viewMode === 'educator' && (
            <PlainEnglishSummary
              site={selectedSite}
              assessment={assessment}
              parameters={landingParams}
              illuminationPct={computedIllumination}
            />
          )}

          {/* 4-Factor Engineering Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {assessment.factors.map((factor, idx) => {
              const isGreen = factor.level === 'GREEN';
              const isYellow = factor.level === 'YELLOW';
              return (
                <div 
                  key={idx}
                  className="bg-black border border-white/[0.14] rounded-[2px] p-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-[#9CA3AF]">
                        {FACTOR_TERM[factor.name] ? <Term k={FACTOR_TERM[factor.name]}>{factor.name}</Term> : factor.name}
                      </span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-[2px] border font-bold uppercase tracking-wider ${
                        isGreen
                          ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/40'
                          : isYellow
                            ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/40'
                            : 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/40'
                      }`}>
                        {factor.level}
                      </span>
                    </div>
                    <div className="text-sm font-bold font-mono text-white mb-1 tabular-nums">{factor.value}</div>
                  </div>
                  <p className="text-[10px] text-[#6B7280] border-t border-white/[0.14] pt-1.5 leading-tight">
                    {factor.explanation}
                  </p>
                </div>
              );
            })}
          </div>

          {/* 2D Local Horizon & Elevation SkyPlot (Sun & Earth Angles) */}
          <HorizonPlot 
            site={selectedSite} 
            simulatedDateOffset={simulatedDateOffset} 
          />

          {/* Topographic Elevation Cross-Section Profile (2 km Altimetry Slice) */}
          <ElevationProfile 
            site={selectedSite} 
          />

          {/* Telemetry Survival & Countdown Timers */}
          <CountdownTimers 
            site={selectedSite}
            simulatedDateOffset={simulatedDateOffset}
            computedIllumination={computedIllumination}
            parameters={landingParams}
          />
        </aside>

      </div>

      {/* Footer: data attribution, scoring methodology, and audience view toggle */}
      <footer className="relative z-40 shrink-0 border-t border-white/[0.14] bg-[#090A0D]/95 backdrop-blur-md px-4 py-1.5 flex flex-wrap items-center justify-between gap-2">
        <DataAttribution />

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMethodologyOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] border border-white/[0.14] bg-black text-[10px] font-mono uppercase tracking-wider font-semibold text-white hover:bg-[#12141A] hover:border-white/35 transition"
            title="See the exact thresholds behind every Green / Yellow / Red rating"
          >
            <Scale className="w-3.5 h-3.5 text-[#9CA3AF]" />
            Scoring Methodology
          </button>

          <div
            className="flex items-center rounded-[2px] border border-white/[0.14] bg-black p-0.5 text-[10px] font-mono uppercase tracking-wider font-semibold"
            role="group"
            aria-label="Audience view"
          >
            <button
              onClick={() => setViewMode('planner')}
              aria-pressed={viewMode === 'planner'}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-[2px] transition ${
                viewMode === 'planner' ? 'bg-white text-black font-bold' : 'text-[#9CA3AF] hover:text-white'
              }`}
              title="Technical view for mission planners and engineers"
            >
              <Sliders className="w-3 h-3" /> Planner
            </button>
            <button
              onClick={() => setViewMode('educator')}
              aria-pressed={viewMode === 'educator'}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-[2px] transition ${
                viewMode === 'educator' ? 'bg-white text-black font-bold' : 'text-[#9CA3AF] hover:text-white'
              }`}
              title="Plain-English explanations for students and the public"
            >
              <GraduationCap className="w-3 h-3" /> Educator
            </button>
          </div>
        </div>
      </footer>

      <MethodologyModal
        isOpen={isMethodologyOpen}
        onClose={() => setIsMethodologyOpen(false)}
        parameters={landingParams}
      />
    </div>
    </ViewModeContext.Provider>
  );
}
