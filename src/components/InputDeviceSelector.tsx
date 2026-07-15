import React, { useState, useEffect } from 'react';
import { Smartphone, Monitor, PenTool, Search, MousePointer2 } from 'lucide-react';
import { GameSettings } from '../types';

interface InputDeviceSelectorProps {
  settings: GameSettings;
  onUpdateSettings: (s: GameSettings) => void;
}

export const InputDeviceSelector: React.FC<InputDeviceSelectorProps> = ({ settings, onUpdateSettings }) => {
  const selected = settings.inputDevice || 'desktop';
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'none' | 'found_touchpad' | 'failed' | null>(null);
  
  // Calibration State
  const [calibrationStage, setCalibrationStage] = useState<'none' | 'x' | 'y' | 'done'>('none');
  const [calMinX, setCalMinX] = useState<number | null>(null);
  const [calMaxX, setCalMaxX] = useState<number | null>(null);
  const [calMinY, setCalMinY] = useState<number | null>(null);
  const [calMaxY, setCalMaxY] = useState<number | null>(null);

  const updateDevice = (device: 'touch' | 'desktop' | 'pen' | 'touchpad') => {
    if (device === 'pen') {
      if (selected === 'pen' && scanResult === 'failed' && isScanning) {
        // Double click while scanning? The prompt says: "Wenn man bei der Stift Option während dem Suchen nochmal drauf tippt, geht es in Touchpad Modus über."
        setIsScanning(false);
        setScanResult(null);
        device = 'touchpad';
      } else {
        setIsScanning(true);
        setScanResult(null);
        // Mock hardware scan
        setTimeout(() => {
          setIsScanning(false);
          setScanResult('failed'); // Fallback to failed/touchpad mode
        }, 1500);
      }
    } else {
      setScanResult(null);
    }
    
    onUpdateSettings({ 
      ...settings, 
      inputDevice: device,
      touchControls: device === 'touch',
      useKeyboard: device === 'desktop' || device === 'pen' || device === 'touchpad'
    });
  };

  useEffect(() => {
    if (selected !== 'touchpad') {
      setCalibrationStage('none');
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'y' && calibrationStage === 'none') {
        setCalibrationStage('x');
        setCalMinX(null); setCalMaxX(null);
      } else if (key === 'x' && calibrationStage === 'x') {
        setCalibrationStage('y');
        setCalMinY(null); setCalMaxY(null);
      } else if (key === 'c' && calibrationStage === 'y') {
        setCalibrationStage('done');
        onUpdateSettings({
          ...settings,
          touchpadCalibration: {
            scaleX: (calMaxX && calMinX && calMaxX > calMinX) ? window.innerWidth / (calMaxX - calMinX) : 1,
            scaleY: (calMaxY && calMinY && calMaxY > calMinY) ? window.innerHeight / (calMaxY - calMinY) : 1,
            centerX: calMinX ? calMinX + (calMaxX ? calMaxX - calMinX : 0) / 2 : window.innerWidth / 2,
            centerY: calMinY ? calMinY + (calMaxY ? calMaxY - calMinY : 0) / 2 : window.innerHeight / 2,
            configured: true
          }
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (calibrationStage === 'x') {
        setCalMinX(prev => prev === null ? e.clientX : Math.min(prev, e.clientX));
        setCalMaxX(prev => prev === null ? e.clientX : Math.max(prev, e.clientX));
      } else if (calibrationStage === 'y') {
        setCalMinY(prev => prev === null ? e.clientY : Math.min(prev, e.clientY));
        setCalMaxY(prev => prev === null ? e.clientY : Math.max(prev, e.clientY));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [selected, calibrationStage, calMinX, calMaxX, calMinY, calMaxY, settings, onUpdateSettings]);


  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {/* Touchscreen Option */}
        <button
          onClick={() => updateDevice('touch')}
          className={`relative group flex flex-col items-center justify-center gap-2 p-3 rounded-md border transition-all cursor-pointer overflow-hidden ${selected === 'touch' ? 'bg-[#00E8FF]/10 border-[#00E8FF]' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
        >
          <div className="relative">
            <Smartphone className={`w-8 h-8 ${selected === 'touch' ? 'text-[#00E8FF]' : 'text-gray-400 group-hover:text-white'} transition-colors`} />
            {selected === 'touch' && (
              <div className="absolute top-1/2 left-1/2 w-3 h-3 bg-[#00E8FF]/50 rounded-full blur-[2px] animate-pulse -translate-x-1/2 -translate-y-1/2" />
            )}
          </div>
          <span className={`text-[10px] font-bold tracking-wider uppercase ${selected === 'touch' ? 'text-[#00E8FF]' : 'text-gray-400 group-hover:text-white'} transition-colors`}>Touch</span>
        </button>

        {/* Desktop / Laptop Option */}
        <button
          onClick={() => updateDevice('desktop')}
          className={`relative group flex flex-col items-center justify-center gap-2 p-3 rounded-md border transition-all cursor-pointer overflow-hidden ${selected === 'desktop' ? 'bg-[#00E8FF]/10 border-[#00E8FF]' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
        >
          <div className="relative">
            <Monitor className={`w-8 h-8 ${selected === 'desktop' ? 'text-[#00E8FF]' : 'text-gray-400 group-hover:text-white'} transition-colors`} />
          </div>
          <span className={`text-[10px] font-bold tracking-wider uppercase ${selected === 'desktop' ? 'text-[#00E8FF]' : 'text-gray-400 group-hover:text-white'} transition-colors`}>Desktop</span>
        </button>

        {/* Pen Tablet Option */}
        <button
          onClick={() => {
            if (isScanning) {
              // Switch to touchpad
              setIsScanning(false);
              setScanResult(null);
              updateDevice('touchpad');
            } else {
              updateDevice('pen');
            }
          }}
          className={`relative group flex flex-col items-center justify-center gap-2 p-3 rounded-md border transition-all cursor-pointer overflow-hidden ${(selected === 'pen' || selected === 'touchpad') ? (scanResult === 'failed' ? 'bg-red-500/10 border-red-500' : 'bg-[#00E8FF]/10 border-[#00E8FF]') : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
        >
          <div className="relative">
            {isScanning ? (
              <Search className="w-8 h-8 text-[#00E8FF] animate-spin" />
            ) : selected === 'touchpad' ? (
              <MousePointer2 className={`w-8 h-8 text-[#00E8FF] transition-colors`} />
            ) : (
              <PenTool className={`w-8 h-8 ${selected === 'pen' ? (scanResult === 'failed' ? 'text-red-500' : 'text-[#00E8FF]') : 'text-gray-400 group-hover:text-white'} transition-colors`} />
            )}
          </div>
          <span className={`text-[10px] font-bold tracking-wider uppercase ${(selected === 'pen' || selected === 'touchpad') ? (scanResult === 'failed' ? 'text-red-500' : 'text-[#00E8FF]') : 'text-gray-400 group-hover:text-white'} transition-colors`}>
            {isScanning ? 'Scanne...' : selected === 'touchpad' ? 'Touchpad' : scanResult === 'failed' ? 'Nicht Erkannt' : 'Stift-Pad'}
          </span>
        </button>
      </div>

      {/* Touchpad Calibration */}
      {selected === 'touchpad' && (
        <div className="mt-2 flex flex-col gap-2 bg-black/40 border border-[#00E8FF]/30 rounded-sm p-4 text-sm text-gray-300">
          <h4 className="font-bold text-[#00E8FF] mb-1">Touchpad Kalibrierung</h4>
          {calibrationStage === 'none' && <p>Drücke <kbd className="bg-white/10 px-1 rounded text-white">Y</kbd> um die X-Achse (links nach rechts) zu kalibrieren.</p>}
          {calibrationStage === 'x' && <p className="text-yellow-400">Streiche über das GANZE Touchpad von ganz links nach ganz rechts. Dann drücke <kbd className="bg-white/10 px-1 rounded text-white">X</kbd>.</p>}
          {calibrationStage === 'y' && <p className="text-yellow-400">Streiche über das GANZE Touchpad von ganz oben nach ganz unten. Dann drücke <kbd className="bg-white/10 px-1 rounded text-white">C</kbd>.</p>}
          {calibrationStage === 'done' && <p className="text-green-400">Kalibrierung abgeschlossen! Keylogger ist bereit.</p>}
        </div>
      )}

      {/* Keylogger Options */}
      <div className="mt-2 flex flex-col gap-2 bg-white/[0.02] border border-white/5 rounded-sm p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-300">Keylogger In-Game Anzeigen</span>
          <button
            onClick={() => onUpdateSettings({ ...settings, keylogger: !settings.keylogger })}
            disabled={selected === 'touchpad' && !settings.touchpadCalibration?.configured}
            className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer [outline:none] ${settings.keylogger ? 'bg-[#00E8FF]' : 'bg-white/10'} ${selected === 'touchpad' && !settings.touchpadCalibration?.configured ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${settings.keylogger ? 'right-1' : 'left-1'}`} />
          </button>
        </div>
        {settings.keylogger && (
          <div className="flex flex-col gap-2 mt-2">
            <div className="flex justify-between items-center text-xs text-gray-400">
              <span>Größe des Keyloggers</span>
              <span className="font-mono text-[#00E8FF]">{settings.keyloggerSize || 100}%</span>
            </div>
            <input 
              type="range" 
              min="50" max="200" step="10"
              value={settings.keyloggerSize || 100}
              onChange={(e) => onUpdateSettings({ ...settings, keyloggerSize: parseInt(e.target.value) })}
              className="w-full accent-[#00E8FF] h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
            />
          </div>
        )}
      </div>
    </div>
  );
};
