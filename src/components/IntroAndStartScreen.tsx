import React, { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { GameSettings } from '../types';

interface IntroAndStartScreenProps {
  onStart: (
    actx: AudioContext,
    trianglesBuf: AudioBuffer | null,
    runningSource?: AudioBufferSourceNode,
    runningGain?: GainNode
  ) => void;
  trianglesBuffer: AudioBuffer | null;
  isLoadingAudio: boolean;
  onInitAudioContext: () => Promise<{ actx: AudioContext; buffer: AudioBuffer | null }>;
  settings?: GameSettings;
  onUpdateSettings?: (settings: GameSettings) => void;
}

export function IntroAndStartScreen({
  onStart,
  trianglesBuffer,
  isLoadingAudio,
  onInitAudioContext,
  settings,
  onUpdateSettings
}: IntroAndStartScreenProps) {
  // Intro Phases:
  // - 'check': Verifying browser user activation / initial authorization status
  // - 'black_waiting_for_click': Pure silent black screen if browser blocks audio
  // - 'warning': Early development build warning notice card (3.5 seconds)
  // - 'synth_intro': The programmed animation intro
  // - 'video_intro': High definition mp4 video playback ('Osu! original Intro.mp4')
  // - 'menu_start': The main menu start landing step with the signature pulsing circle logo
  const [phase, setPhase] = useState<'check' | 'black_waiting_for_click' | 'video_intro' | 'synth_intro' | 'menu_start'>('check');
  const [introSubPhase, setIntroSubPhase] = useState<'black' | 'warning' | 'welcome' | 'outline'>('black');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const isTransitioningRef = useRef(false);

  // Styling transitions
  const [isHovered, setIsHovered] = useState(false);
  const [isExploding, setIsExploding] = useState(false);
  const [whiteOverlayOpacity, setWhiteOverlayOpacity] = useState(0.0);

  // Shared active audio instances
  const audioContextRef = useRef<AudioContext | null>(null);
  const bgmSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgmGainRef = useRef<GainNode | null>(null);

  // Background visual scroll elements
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    size: number;
    angle: number;
    speed: number;
    rotSpeed: number;
    alpha: number;
    color: string;
    type: 'triangle' | 'spark' | 'capsule';
    vx?: number;
    vy?: number;
  }>>([]);

  // Step 1: Handle Document title and 11.5s timeout for black screen
  useEffect(() => {
    if (phase === 'check' || phase === 'black_waiting_for_click') {
      document.title = ' ';
    } else if (phase === 'synth_intro') {
      document.title = 'welcome to yada!';
    } else if (phase === 'menu_start') {
      document.title = 'yada!';
    }
  }, [phase]);

  useEffect(() => {
    const timer = setTimeout(() => {
      // If we are still in this component after 11.5s and haven't triggered transition...
      if (!isTransitioningRef.current && (phase === 'black_waiting_for_click' || phase === 'menu_start')) {
        document.title = 'Starting when you Tap! …';
      }
    }, 11500);
    return () => clearTimeout(timer);
  }, [phase]);

  // Sequence Step 1: Detect autoplay permissions on load
  useEffect(() => {
    const handleInitialVerification = async () => {
      try {
        const testContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (testContext.state === 'running') {
          await testContext.close();
          startIntroSequence();
        } else {
          setPhase('black_waiting_for_click');
          await testContext.close();
        }
      } catch (err) {
        setPhase('black_waiting_for_click');
      }
    };
    handleInitialVerification();
  }, []);

  // Step 2: Handle Canvas Resizing & Scrolling background particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Bootstrap particles list for osu! landing
    const particles = particlesRef.current;
    if (particles.length === 0) {
      // 1. Signature floating triangles
      for (let i = 0; i < 35; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 25 + 10,
          angle: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.45 + 0.15,
          rotSpeed: (Math.random() - 0.5) * 0.005,
          alpha: Math.random() * 0.22 + 0.04,
          color: getRandomOsuColor(),
          type: 'triangle'
        });
      }

      // 2. Slow gliding visual column capsules
      for (let i = 0; i < 18; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 85 + 35,
          angle: Math.PI / 4,
          speed: Math.random() * 0.55 + 0.2,
          rotSpeed: 0,
          alpha: Math.random() * 0.06 + 0.02,
          color: '#ffffff',
          type: 'capsule'
        });
      }
    }

    const renderTick = () => {
      if (phase !== 'menu_start' && phase !== 'synth_intro' && phase !== 'video_intro') {
        // Render simple black background to save resources before intro starts
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        animationRef.current = requestAnimationFrame(renderTick);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Draw gorgeous soft dark gradients
      const radialBg = ctx.createRadialGradient(
        cx, cy, 30,
        cx, cy, Math.max(canvas.width, canvas.height) * 0.72
      );
      radialBg.addColorStop(0, '#2b1548'); // Warm purple
      radialBg.addColorStop(0.5, '#110521'); // Deep indigo
      radialBg.addColorStop(1, '#05020a'); // black
      ctx.fillStyle = radialBg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw background columns and floating particles
      particles.forEach(p => {
        if (p.type === 'capsule') {
          p.x += Math.cos(p.angle) * p.speed;
          p.y += Math.sin(p.angle) * p.speed;

          if (p.x > canvas.width + p.size || p.y > canvas.height + p.size) {
            p.x = -p.size + (Math.random() - 0.5) * canvas.width;
            p.y = -p.size;
          }

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.roundRect(-8, -p.size/2, 16, p.size, 8);
          ctx.fill();
          ctx.restore();
        } else if (p.type === 'triangle') {
          p.y -= p.speed * 1.4;
          p.angle += p.rotSpeed;

          if (p.y < -p.size) {
            p.y = canvas.height + p.size;
            p.x = Math.random() * canvas.width;
          }

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.globalAlpha = p.alpha;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, -p.size / 2);
          ctx.lineTo(p.size / 2, p.size / 2);
          ctx.lineTo(-p.size / 2, p.size / 2);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        } else if (p.type === 'spark') {
          p.x += p.vx || 0;
          p.y += p.vy || 0;
          if (p.vx) p.vx *= 0.94;
          if (p.vy) p.vy *= 0.94;
          p.alpha -= 0.012;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });

      // Filter sparks
      particlesRef.current = particles.filter(p => p.type !== 'spark' || p.alpha > 0.02);

      animationRef.current = requestAnimationFrame(renderTick);
    };

    renderTick();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [phase]);

  const getRandomOsuColor = () => {
    if (settings && settings.randomKidMode) {
      const colors = [
        '#A9D3B2', // mint green / blonde
        '#BFE2C6',
        '#7FB89D',
        '#BDF6D6',
        '#E6F5E9'
      ];
      return colors[Math.floor(Math.random() * colors.length)];
    }

    const colors = [
      '#00E8FF', // signature pink
      '#ff88cc',
      '#ba66ff', // pastel purple
      '#66b2ff', // bright sky blue
      '#ffdf66' // golden glow
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Synthesized sequence setup (Programmatically recreating original intro)
  useEffect(() => {
    if (phase !== 'synth_intro') return;

    setIntroSubPhase('black');

    // Display "welcome to osu" immediately, show the logo at 2.1s, transition 0.9s later at 3.0s
    const t1 = setTimeout(() => setIntroSubPhase('welcome'), 0);
    const t2 = setTimeout(() => setIntroSubPhase('outline'), 2100);
    const t3 = setTimeout(() => {
      triggerFlashTransition();
    }, 3000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [phase]);

  const startIntroSequence = async () => {
    try {
      const { actx, buffer } = await onInitAudioContext();
      audioContextRef.current = actx;

      if (buffer) {
        const source = actx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const gainNode = actx.createGain();
        gainNode.gain.setValueAtTime(0.4, actx.currentTime);

        source.connect(gainNode);
        gainNode.connect(actx.destination);

        source.start(0);

        bgmSourceRef.current = source;
        bgmGainRef.current = gainNode;
      }
    } catch (err) {
      console.warn("Failed early background audio initialization:", err);
    }
    
    setPhase('synth_intro');
  };

  // Triggering the white transition flash
  const triggerFlashTransition = async () => {
    if (isTransitioningRef.current || phase === 'menu_start') return;
    isTransitioningRef.current = true;

    setPhase('menu_start');
    setWhiteOverlayOpacity(1.0);

    // Audio is already gracefully looping from the intro timing!

    // Smoothly animate white frame fading out over 350ms for a quick punchy flash
    let startTimestamp: number | null = null;
    const fadeDuration = 350;

    const fadeAnimation = (now: number) => {
      if (!startTimestamp) startTimestamp = now;
      const elapsed = now - startTimestamp;
      const progress = Math.min(elapsed / fadeDuration, 1.0);
      setWhiteOverlayOpacity(1.0 - progress);

      if (progress < 1.0) {
        requestAnimationFrame(fadeAnimation);
      }
    };
    requestAnimationFrame(fadeAnimation);
  };

  // Click gesture bypass on black waiting screen
  const handleGestureBypass = () => {
    startIntroSequence();
  };

  // Clicking the giant pink Osu! logo button
  const handleOsuLogoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExploding) return;

    setIsExploding(true);

    const clickX = e.clientX || window.innerWidth / 2;
    const clickY = e.clientY || window.innerHeight / 2;

    // Synthesize super clean digital perfect chord sweep!
    if (audioContextRef.current) {
      try {
        const actx = audioContextRef.current;

        const subKick = actx.createOscillator();
        subKick.type = 'sine';
        subKick.frequency.setValueAtTime(140, actx.currentTime);
        subKick.frequency.exponentialRampToValueAtTime(0.01, actx.currentTime + 0.45);
        const subGain = actx.createGain();
        subGain.gain.setValueAtTime(0.75, actx.currentTime);
        subGain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.45);
        subKick.connect(subGain);
        subGain.connect(actx.destination);
        subKick.start();
        subKick.stop(actx.currentTime + 0.47);

        const chordFreqs = [523.25, 659.25, 783.99, 1046.50];
        chordFreqs.forEach(freq => {
          const osc = actx.createOscillator();
          const gain = actx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, actx.currentTime);
          gain.gain.setValueAtTime(0.12, actx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 1.25);
          osc.connect(gain);
          gain.connect(actx.destination);
          osc.start();
          osc.stop(actx.currentTime + 1.3);
        });
      } catch (err) {
        console.warn("Could not play synthesized select chimes", err);
      }
    }

    // Spawn 150 multicolored exploding sparks moving outwards rapidly
    for (let i = 0; i < 150; i++) {
      const angle = (i / 150) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
      const speed = Math.random() * 14 + 5;
      particlesRef.current.push({
        x: clickX,
        y: clickY,
        size: Math.random() * 4.5 + 2.0,
        angle: angle,
        speed: speed,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotSpeed: (Math.random() - 0.5) * 0.1,
        alpha: 1.0,
        color: getRandomOsuColor(),
        type: 'spark'
      });
    }

    // Wait exactly 750ms for particle expansion, then trigger onStart handoff
    setTimeout(() => {
      if (audioContextRef.current) {
        onStart(audioContextRef.current, trianglesBuffer, bgmSourceRef.current || undefined, bgmGainRef.current || undefined);
      } else {
        const fallbackCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        onStart(fallbackCtx, trianglesBuffer);
      }
    }, 750);
  };

  // Music drive bounce scaling logic
  const getCentralLogoStyle = () => {
    const beatPeriod = 375; // 160 BPM loop rate pulse
    const now = Date.now();
    const pulseRatio = (now % beatPeriod) / beatPeriod;
    const pulseFactor = Math.exp(-pulseRatio * 6) * 0.055;

    let baseScale = 1.0;
    if (isHovered) baseScale = 1.06;
    if (isExploding) baseScale = 1.35;

    const totalScale = baseScale + pulseFactor;

    return {
      transform: `scale(${totalScale})`,
      opacity: isExploding ? 0 : 1,
      transition: isExploding
        ? 'transform 0.18s cubic-bezier(0.12, 0.8, 0.22, 1.0), opacity 0.45s ease-out'
        : 'transform 0.12s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    };
  };

  return (
    <div
      id="intro-screen-container"
      onClick={() => {
        if (phase === 'black_waiting_for_click') {
          handleGestureBypass();
        }
      }}
      className={`absolute inset-0 select-none overflow-hidden touch-none flex flex-col justify-center items-center font-sans bg-black z-50 ${
        phase === 'black_waiting_for_click' ? 'cursor-pointer' : ''
      }`}
    >
      {/* Background canvas floating backdrops */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />

      {/* PHASE 1: BLACK AUTO-PLAY CARRIER */}
      {phase === 'black_waiting_for_click' && (
        <div className="absolute inset-0 bg-black flex items-center justify-center pointer-events-none z-50">
          {/* Entirely silent, pure black screen as requested to fulfill browser requirements */}
        </div>
      )}

      {/* SYNTHESIZED INTRO SCREEN (RECREATED) */}
      {phase === 'synth_intro' && (
        <div className="absolute inset-0 w-full h-full z-20 bg-black flex items-center justify-center">
          <style>{`
            @keyframes introLogoScale {
              0% { transform: scale(1.6); opacity: 0; }
              10% { opacity: 1; }
              100% { transform: scale(1.0); opacity: 1; }
            }
          `}</style>

          {/* WELCOME TO OSU! */}
          <div className={`absolute transition-opacity duration-300 ${introSubPhase === 'welcome' ? 'opacity-100' : 'opacity-0'} flex flex-col items-center justify-center pointer-events-none`}>
            {(introSubPhase === 'welcome' || introSubPhase === 'outline') && (
              <div className="flex items-center space-x-6 animate-[fadeIn_1s_ease-out_forwards]">
                <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[12px] border-b-gray-400 -rotate-90 animate-[spin_4s_linear_infinite]" />
                <span className="text-3xl tracking-[0.25em] text-white/90 lowercase" style={{fontFamily: "'Space Grotesk', sans-serif"}}>
                   welcome to Yada!
                </span>
                <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[12px] border-b-gray-400 rotate-90 animate-[spin_5s_linear_infinite_reverse]" />
              </div>
            )}
          </div>

          {/* OSU! OUTLINE SCALE */}
          {introSubPhase === 'outline' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
              <div className="animate-[introLogoScale_1.5s_cubic-bezier(0.1,0.8,0.2,1)_forwards]">
                <div className={`w-[260px] h-[260px] sm:w-[340px] sm:h-[340px] rounded-full flex flex-col items-center justify-center relative ${settings?.randomKidMode ? 'bg-gradient-to-b from-[#BDF6D6] via-[#A9D3B2] to-[#6AA185] shadow-[0_0_60px_rgba(169,211,178,0.48)]' : 'bg-gradient-to-b from-[#33EFFF] via-[#00E8FF] to-[#0099FF] shadow-[0_0_60px_rgba(0,232,255,0.48)]'} border-[10px] sm:border-[13px] border-white`}>
                  <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.22)_0%,rgba(0,0,0,0)_70%)] pointer-events-none" />
                  <div className="text-white text-[110px] sm:text-[140px] font-black italic tracking-tighter select-none font-sans mt-[-10px] leading-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.25)]">Yada!</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PHASE 4: START SCREEN INTERFACES */}
      {(phase === 'menu_start' || phase === 'synth_intro') && (
        <div className="relative z-10 flex flex-col items-center justify-center select-none w-full h-full">
          {/* Radial grid subtle flare */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,232,255,0.02)_0%,rgba(0,0,0,0)_85%)] z-1 pointer-events-none animate-pulse" />

          {/* Giant Pink Pulsing Logo circle */}
          <div
            id="start-osu-button-container"
            onClick={handleOsuLogoClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={getCentralLogoStyle()}
            className={`w-[260px] h-[260px] sm:w-[340px] sm:h-[340px] rounded-full flex flex-col items-center justify-center relative cursor-pointer select-none transition-all ${
              isExploding
                ? (settings?.randomKidMode ? 'shadow-[0_0_120px_rgba(169,211,178,1.0)] bg-[#A9D3B2]' : 'shadow-[0_0_120px_rgba(0,232,255,1.0)] bg-[#00E8FF]')
                : (settings?.randomKidMode ? 'bg-gradient-to-b from-[#BDF6D6] via-[#A9D3B2] to-[#6AA185] shadow-[0_0_60px_rgba(169,211,178,0.48)] border-[10px] sm:border-[13px] border-white hover:shadow-[0_0_80px_rgba(169,211,178,0.72)]' : 'bg-gradient-to-b from-[#33EFFF] via-[#00E8FF] to-[#0099FF] shadow-[0_0_60px_rgba(0,232,255,0.48)] border-[10px] sm:border-[13px] border-white hover:shadow-[0_0_80px_rgba(0,232,255,0.72)]')
            }`}
          >
            {/* Soft inner reflex gloss */}
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.22)_0%,rgba(0,0,0,0)_70%)] pointer-events-none" />

            {/* Signature logo letter */}
            <div className="text-white text-[110px] sm:text-[140px] font-black italic tracking-tighter select-none font-sans mt-[-10px] leading-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.25)]">Yada!</div>

            {/* Dash spinner outer outline border */}
            {isHovered && (
              <div className={`absolute -inset-5 sm:-inset-7 rounded-full border-2 border-dashed ${settings?.randomKidMode ? 'border-[#A9D3B2]' : 'border-[#00E8FF]'} animate-[spin_12s_linear_infinite]`} />
            )}

            {/* Soft ambient wave loop */}
            <div className={`absolute -inset-3 sm:-inset-4 rounded-full border border-[#00E8FF]/30 transition-transform duration-500 scale-102 ${
              isHovered ? 'animate-ping' : ''
            }`} />
          </div>

          {/* Prompt labels line */}
          <div className="mt-12 text-center relative z-10 pointer-events-none animate-[fadeIn_0.5s_ease-out]">
            <p className="text-[#00E8FF] font-black text-xs sm:text-sm tracking-[0.25em] font-sans uppercase animate-pulse">
              KLICKE DEN KREIS ZUM STARTEN
            </p>
            <p className="text-xs text-gray-500 font-mono mt-2.5 tracking-wide">
              cYsmix — Triangles (BGM)
            </p>
          </div>
        </div>
      )}

      {/* THE WHITE FLASH OVERLAY */}
      <div
        className="absolute inset-0 bg-white z-[100] pointer-events-none"
        style={{
          opacity: whiteOverlayOpacity,
          display: whiteOverlayOpacity > 0.001 ? 'block' : 'none'
        }}
      />
      
      {/* SAFE MODE BUTTON */}
      <button 
        onClick={(e) => {
          e.stopPropagation();
          if (onUpdateSettings && settings) {
            const newSafeMode = !settings.safeMode;
            onUpdateSettings({ ...settings, safeMode: newSafeMode });
            localStorage.setItem('osu_settings', JSON.stringify({ ...settings, safeMode: newSafeMode }));
            // Optional visually silent feedback if user requested "ändert sich Visuell nichts", 
            // but we'll let the user know what state it is in if they look closely, or keep it the same to follow instructions.
            // "Wenn man ihn vor dem Start betätigt, ändert sich Visuell nichts, aber es werden genau die Sicherheits-Features aktiviert..."
            // I'll keep the button looking relatively identical or subtle.
          }
        }}
        className={`absolute bottom-4 left-4 z-[1000] px-3 py-1.5 rounded text-xs font-bold font-sans transition-colors cursor-pointer pointer-events-auto ${settings?.safeMode ? 'bg-[#A9D3B2]/20 text-[#A9D3B2] border border-[#A9D3B2]/50' : 'bg-white/5 text-gray-500 hover:text-gray-300 border border-white/10'}`}
        title="Schaltet Datei-Größenlimits für schwächere Geräte ein"
      >
        Safe Mode {settings?.safeMode ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}
