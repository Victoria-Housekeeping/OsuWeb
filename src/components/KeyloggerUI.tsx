import React, { useEffect, useState, useRef } from 'react';
import { MousePointer2, PenTool } from 'lucide-react';
import { GameSettings } from '../types';

interface KeyloggerUIProps {
  settings: GameSettings;
  activeKeysRef: React.MutableRefObject<{
    k1: boolean;
    k2: boolean;
    m1: boolean;
    m2: boolean;
  }>;
  mousePosRef: React.MutableRefObject<{ x: number, y: number } | null>;
}

export const KeyloggerUI: React.FC<KeyloggerUIProps> = ({ settings, activeKeysRef, mousePosRef }) => {
  const inputDevice = settings.inputDevice || 'desktop';
  const scale = (settings.keyloggerSize || 100) / 100;
  
  const [activeKeys, setActiveKeys] = useState({ k1: false, k2: false, m1: false, m2: false });
  const [mousePos, setMousePos] = useState({ x: window.innerWidth/2, y: window.innerHeight/2 });
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  // Touchpad trailing logic
  const [touchpadTrail, setTouchpadTrail] = useState<{x: number, y: number, id: number}[]>([]);
  const trailIdRef = useRef(0);
  const touchpadCalRef = useRef({
    minX: settings.touchpadCalibration?.centerX ? settings.touchpadCalibration.centerX - window.innerWidth/(2 * (settings.touchpadCalibration.scaleX || 1)) : 0,
    maxX: settings.touchpadCalibration?.centerX ? settings.touchpadCalibration.centerX + window.innerWidth/(2 * (settings.touchpadCalibration.scaleX || 1)) : window.innerWidth,
    minY: settings.touchpadCalibration?.centerY ? settings.touchpadCalibration.centerY - window.innerHeight/(2 * (settings.touchpadCalibration.scaleY || 1)) : 0,
    maxY: settings.touchpadCalibration?.centerY ? settings.touchpadCalibration.centerY + window.innerHeight/(2 * (settings.touchpadCalibration.scaleY || 1)) : window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    
    const loop = (time: number) => {
      setActiveKeys({ ...activeKeysRef.current });
      if (mousePosRef.current) {
        setMousePos({ ...mousePosRef.current });

        if (inputDevice === 'touchpad') {
          const cal = touchpadCalRef.current;
          let px = mousePosRef.current.x;
          let py = mousePosRef.current.y;
          
          if (px < cal.minX) cal.minX = px;
          if (px > cal.maxX) cal.maxX = px;
          if (py < cal.minY) cal.minY = py;
          if (py > cal.maxY) cal.maxY = py;
          
          const tw = cal.maxX - cal.minX || 1;
          const th = cal.maxY - cal.minY || 1;
          const relX = (px - cal.minX) / tw;
          const relY = (py - cal.minY) / th;

          setTouchpadTrail(prev => {
            let next = prev.filter(pt => time - pt.id < 300);
            if (time - lastTime > 16) {
              next = [...next, { x: relX, y: relY, id: time }];
              lastTime = time;
            }
            return next;
          });
        }
      }
      animId = requestAnimationFrame(loop);
    };
    
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [inputDevice, activeKeysRef, mousePosRef]);

  if (!inputDevice) return null;

  const w = windowSize.w;
  const h = windowSize.h;
  const isPressing = activeKeys.m1 || activeKeys.m2 || activeKeys.k1 || activeKeys.k2;

  return (
    <div 
      className="absolute top-1/2 left-4 -translate-y-1/2 pointer-events-none z-50 transition-transform flex flex-col items-center justify-center gap-2"
      style={{ transform: `scale(${scale}) translateY(-50%)`, transformOrigin: 'left center' }}
    >
      <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-2xl flex flex-col items-center gap-2">
        {inputDevice === 'touch' && (
          <div 
            className="relative border-2 border-gray-400 rounded-md bg-gradient-to-br from-gray-900 to-black overflow-hidden"
            style={{ width: 120, height: 120 * (h / w) }}
          >
            {isPressing && (
              <div 
                className="absolute w-1.5 h-1.5 bg-white rounded-full"
                style={{ 
                  left: `${(mousePos.x / w) * 100}%`, 
                  top: `${(mousePos.y / h) * 100}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              />
            )}
          </div>
        )}

        {inputDevice === 'desktop' && (
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-16 h-24 border-2 border-gray-400 rounded-full flex flex-col items-center pt-2 bg-gradient-to-b from-gray-800 to-black overflow-hidden">
              <div className="flex w-full px-2 gap-1 h-10">
                <div className={`flex-1 rounded-t-full transition-colors ${activeKeys.m1 ? 'bg-[#00E8FF]' : 'bg-white/10'}`} />
                <div className="w-1 bg-gray-600 rounded-full" />
                <div className={`flex-1 rounded-t-full transition-colors ${activeKeys.m2 ? 'bg-[#00E8FF]' : 'bg-white/10'}`} />
              </div>
              <div className="mt-2 text-gray-500">
                <MousePointer2 className="w-5 h-5" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className={`w-8 h-8 flex items-center justify-center border-2 rounded-md font-bold text-xs ${activeKeys.k1 ? 'bg-[#00E8FF] border-[#00E8FF] text-black' : 'border-gray-500 text-gray-400'}`}>Y</div>
              <div className={`w-8 h-8 flex items-center justify-center border-2 rounded-md font-bold text-xs ${activeKeys.k2 ? 'bg-[#00E8FF] border-[#00E8FF] text-black' : 'border-gray-500 text-gray-400'}`}>X</div>
            </div>
          </div>
        )}

        {inputDevice === 'pen' && (
          <div 
            className="relative border-2 border-gray-400 rounded-md bg-gradient-to-br from-gray-900 to-black overflow-hidden"
            style={{ width: 120, height: 120 * (h / w) }}
          >
             <div 
               className="absolute transition-all duration-75 text-[#00E8FF]"
               style={{ 
                 left: `${(mousePos.x / w) * 100}%`, 
                 top: `${(mousePos.y / h) * 100}%`,
                 transform: 'translate(-2px, -10px)' // adjust icon center
               }}
             >
               <PenTool className="w-3 h-3 -rotate-45 drop-shadow-[0_2px_2px_rgba(0,232,255,0.4)]" />
             </div>
             {isPressing && (
                <div 
                  className="absolute w-3 h-3 bg-white/40 rounded-full blur-[1px]"
                  style={{ 
                    left: `${(mousePos.x / w) * 100}%`, 
                    top: `${(mousePos.y / h) * 100}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                />
             )}
          </div>
        )}

        {inputDevice === 'touchpad' && (() => {
          const tw = touchpadCalRef.current.maxX - touchpadCalRef.current.minX || 1;
          const th = touchpadCalRef.current.maxY - touchpadCalRef.current.minY || 1;
          const boxW = 120;
          const boxH = 120 * (th / tw);
          return (
            <div 
              className="relative border-2 border-gray-400 rounded-md bg-gradient-to-br from-gray-900 to-black overflow-hidden"
              style={{ width: boxW, height: Math.max(40, boxH) }}
            >
              {touchpadTrail.map((pt, i) => (
                <div 
                  key={pt.id}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    left: `${pt.x * 100}%`,
                    top: `${pt.y * 100}%`,
                    transform: `translate(-50%, -50%) scale(${((i + 1) / touchpadTrail.length) * 0.8 + 0.2})`,
                    backgroundColor: isPressing ? '#00E8FF' : 'white',
                    opacity: (i + 1) / touchpadTrail.length
                  }}
                />
              ))}
            </div>
          );
        })()}
      </div>
      
      <span className="text-[10px] font-mono font-bold tracking-widest text-[#00E8FF] uppercase bg-black/50 px-2 py-0.5 rounded border border-[#00E8FF]/30">
        {inputDevice}
      </span>
    </div>
  );
};
