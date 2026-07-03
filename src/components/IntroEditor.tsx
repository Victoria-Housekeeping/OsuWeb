import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, Trash2, Plus, Check, RotateCcw, HelpCircle } from 'lucide-react';
import { IntroIniConfig, IntroTextCue, stringifyIntroIni, DEFAULT_INTRO_INI_CONFIG } from '../utils/introIniParser';
import { MapGroup, GameSettings, Beatmap } from '../types';
import { getOszFile, saveOszFile } from '../utils/db';
import { extractFileFromOsz } from '../utils/osuParser';
import JSZip from 'jszip';
// @ts-ignore
import gifshot from 'gifshot';

interface IntroEditorProps {
  group: MapGroup;
  onClose: () => void;
  onSave: () => void;
  settings: GameSettings;
}

export function IntroEditor({ group, onClose, onSave, settings }: IntroEditorProps) {
  const [config, setConfig] = useState<IntroIniConfig>(DEFAULT_INTRO_INI_CONFIG);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // in seconds
  const [duration, setDuration] = useState(0); // in seconds
  const [selectedCueIndex, setSelectedCueIndex] = useState<number | null>(null);
  const [textInput, setTextInput] = useState('');
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [hasExplicitStartOffset, setHasExplicitStartOffset] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Undo / Redo history stacks
  const [history, setHistory] = useState<IntroIniConfig[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Load beatmap assets and existing yadaintro.ini on mount
  useEffect(() => {
    let active = true;
    const loadAssets = async () => {
      try {
        if (!group.fileName) return;
        const oszBlob = await getOszFile(group.fileName);
        if (!oszBlob) return;

        // Find reference version
        const version: Beatmap = group.versions[0];

        // 1. Extract Audio
        if (version.audioFilename) {
          const audioBlob = await extractFileFromOsz(oszBlob, version.audioFilename);
          if (audioBlob && active) {
            setAudioUrl(URL.createObjectURL(audioBlob));
          }
        }

        // 2. Extract Video
        if (version.videoFilename) {
          const videoBlob = await extractFileFromOsz(oszBlob, version.videoFilename);
          if (videoBlob && active) {
            setVideoUrl(URL.createObjectURL(videoBlob));
          }
        }

        // 3. Extract Background
        if (version.bgUrl) {
          setBgUrl(version.bgUrl);
        }

        // 4. Extract & Parse yadaintro.ini
        if (version.introIniFilename) {
          const iniBlob = await extractFileFromOsz(oszBlob, version.introIniFilename);
          if (iniBlob) {
            const iniText = await iniBlob.text();
            // Parse ini config
            const parsedConfig = (await import('../utils/introIniParser')).parseIntroIni(iniText);
            if (active) {
              setConfig(parsedConfig);
              setHasExplicitStartOffset(parsedConfig.audioStartOffset > 0);
              // Initialize history
              setHistory([parsedConfig]);
              setHistoryIndex(0);
            }
          }
        } else {
          if (active) {
            setHistory([DEFAULT_INTRO_INI_CONFIG]);
            setHistoryIndex(0);
          }
        }
      } catch (err) {
        console.error('Failed to load intro editor assets:', err);
      }
    };

    loadAssets();

    return () => {
      active = false;
    };
  }, [group]);

  // Sync state between audio and video
  useEffect(() => {
    const audio = audioRef.current;
    const video = videoRef.current;

    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (video && Math.abs(video.currentTime - audio.currentTime) > 0.15) {
        video.currentTime = audio.currentTime;
      }
    };

    const handleDurationChange = () => {
      setDuration(audio.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [audioUrl]);

  // Sync video play/pause with audio play/pause
  useEffect(() => {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (!audio || !video) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  // Determine active total duration bounds
  const activeMinTime = config.audioStartOffset / 1000;
  const activeMaxTime = config.titleScreenAt !== null 
    ? config.titleScreenAt / 1000 
    : (duration || 30); // Fallback to 30s if duration not loaded yet
  const activeDuration = Math.max(0.1, activeMaxTime - activeMinTime);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // Push new config into history state
  const pushHistory = (newConfig: IntroIniConfig) => {
    const newHistory = history.slice(0, historyIndex + 1);
    setHistory([...newHistory, newConfig]);
    setHistoryIndex(newHistory.length);
    setConfig(newConfig);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setConfig(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setConfig(history[historyIndex + 1]);
    }
  };

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSec = activeMinTime + pct * activeDuration;
    
    setCurrentTime(targetSec);
    if (audioRef.current) {
      audioRef.current.currentTime = targetSec;
    }
    if (videoRef.current) {
      videoRef.current.currentTime = targetSec;
    }
  };

  const handleAddTextCue = () => {
    if (!textInput.trim()) return;
    const currentTimeMs = Math.round(currentTime * 1000);

    // Automatic EndTime Setting:
    // If there is an existing text cue starting before current time that has no endTime or ends after current time,
    // we set its endTime to current time.
    const updatedCues = config.textCues.map(cue => {
      if (cue.time < currentTimeMs && (cue.endTime === undefined || cue.endTime > currentTimeMs)) {
        return { ...cue, endTime: currentTimeMs };
      }
      return cue;
    });

    const newCue: IntroTextCue = {
      time: currentTimeMs,
      text: textInput.trim()
    };

    // Filter out any cue at the exact same millisecond
    const filteredCues = updatedCues.filter(c => c.time !== currentTimeMs);
    const finalCues = [...filteredCues, newCue].sort((a, b) => a.time - b.time);

    const newConfig: IntroIniConfig = {
      ...config,
      textCues: finalCues
    };

    pushHistory(newConfig);
    setSelectedCueIndex(finalCues.findIndex(c => c.time === currentTimeMs));
    setTextInput('');
    setShowAddDropdown(false);
  };

  const handleSetTextEnd = () => {
    if (selectedCueIndex === null) return;
    const activeCue = config.textCues[selectedCueIndex];
    const currentTimeMs = Math.round(currentTime * 1000);

    if (currentTimeMs <= activeCue.time) {
      alert('Das Text-Ende muss zeitlich hinter dem Text-Anfang liegen!');
      return;
    }

    const updatedCues = config.textCues.map((cue, idx) => {
      if (idx === selectedCueIndex) {
        return { ...cue, endTime: currentTimeMs };
      }
      return cue;
    });

    const newConfig: IntroIniConfig = {
      ...config,
      textCues: updatedCues
    };

    pushHistory(newConfig);
    setShowAddDropdown(false);
  };

  const handleSetTitleScreenAt = () => {
    const currentTimeMs = Math.round(currentTime * 1000);

    // "alle Objekte, die nach dem Strich kommen würden werden entfernt"
    const filteredCues = config.textCues.filter(cue => cue.time < currentTimeMs).map(cue => {
      if (cue.endTime !== undefined && cue.endTime > currentTimeMs) {
        return { ...cue, endTime: currentTimeMs };
      }
      return cue;
    });

    const newConfig: IntroIniConfig = {
      ...config,
      titleScreenAt: currentTimeMs,
      logoAppearAt: config.logoAppearAt !== null && config.logoAppearAt > currentTimeMs ? currentTimeMs : config.logoAppearAt,
      textCues: filteredCues
    };

    pushHistory(newConfig);
    setShowAddDropdown(false);
    
    // Auto seek to a safe position inside new bounds if current time is past bounds
    if (currentTime > currentTimeMs / 1000) {
      const safeTime = (currentTimeMs - 100) / 1000;
      setCurrentTime(safeTime);
      if (audioRef.current) audioRef.current.currentTime = safeTime;
      if (videoRef.current) videoRef.current.currentTime = safeTime;
    }
  };

  const handleSetStartOffset = () => {
    const currentTimeMs = Math.round(currentTime * 1000);

    // Filter out objects that would come before the new start
    const filteredCues = config.textCues.filter(cue => cue.time >= currentTimeMs);

    const newConfig: IntroIniConfig = {
      ...config,
      audioStartOffset: currentTimeMs,
      logoAppearAt: config.logoAppearAt !== null && config.logoAppearAt < currentTimeMs ? null : config.logoAppearAt,
      textCues: filteredCues
    };
    pushHistory(newConfig);
    setHasExplicitStartOffset(true);
    setShowAddDropdown(false);
  };

  const handleDeleteActive = () => {
    // Determine which cue/marker the playback head is closest to, or delete the selected cue
    if (selectedCueIndex !== null) {
      const updatedCues = config.textCues.filter((_, idx) => idx !== selectedCueIndex);
      const newConfig = {
        ...config,
        textCues: updatedCues
      };
      pushHistory(newConfig);
      setSelectedCueIndex(null);
      return;
    }

    // Otherwise, check if current time is close to startOffset or titleScreenAt, and clear them
    const currentTimeMs = Math.round(currentTime * 1000);
    const startDiff = Math.abs(config.audioStartOffset - currentTimeMs);
    const titleDiff = config.titleScreenAt !== null ? Math.abs(config.titleScreenAt - currentTimeMs) : Infinity;

    if (startDiff < 2000 && startDiff < titleDiff) {
      const newConfig = { ...config, audioStartOffset: 0 };
      pushHistory(newConfig);
      setHasExplicitStartOffset(false);
      setStatusMsg('Post-Tap Startzeitpunkt zurückgesetzt!');
      setTimeout(() => setStatusMsg(null), 2000);
    } else if (titleDiff < 2000) {
      const newConfig = { ...config, titleScreenAt: null };
      pushHistory(newConfig);
      setStatusMsg('Titelbildschirm-Wechsel zurückgesetzt!');
      setTimeout(() => setStatusMsg(null), 2000);
    }
  };

  const generateGifBlob = async (
    videoUrl: string,
    loopStartMs: number,
    loopEndMs: number | null
  ): Promise<Blob> => {
    const video = videoRef.current;
    if (!video) {
      throw new Error('Video-Element im Editor nicht gefunden');
    }

    // Save current state of the video
    const originalTime = video.currentTime;
    const wasPaused = video.paused;

    try {
      // Pause playing if active to capture clean frames
      if (!wasPaused) {
        video.pause();
      }

      const startSec = loopStartMs / 1000;
      const duration = video.duration || 10;
      let endSec = loopEndMs !== null ? loopEndMs / 1000 : duration;

      // Cap GIF duration to 5 seconds to keep size small and processing fast
      if (endSec - startSec > 5) {
        endSec = startSec + 5;
      }
      if (endSec <= startSec) {
        endSec = startSec + 2; // Default 2s loop
      }

      const gifDuration = endSec - startSec;
      const fps = 10; // 10 fps is great
      const frameInterval = 1 / fps;
      const totalFrames = Math.max(1, Math.floor(gifDuration * fps));

      const frames: string[] = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Target downscaled size for crisp rendering without extreme file sizes
      const targetWidth = 480;
      const targetHeight = Math.round(targetWidth * (video.videoHeight / video.videoWidth || 0.5625));
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      for (let i = 0; i < totalFrames; i++) {
        const seekTime = startSec + (i * frameInterval);
        if (seekTime > duration) break;

        await new Promise<void>((res) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            res();
          };
          video.addEventListener('seeked', onSeeked);
          video.currentTime = seekTime;
        });

        if (ctx) {
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          frames.push(canvas.toDataURL('image/jpeg', 0.95));
        }
      }

      // Restore original video state
      video.currentTime = originalTime;
      if (!wasPaused) {
        video.play().catch(() => {});
      }

      if (frames.length === 0) {
        throw new Error('Keine Frames extrahiert');
      }

      // Create GIF using gifshot with higher quality quantization (sampleInterval: 3)
      return new Promise((resolve, reject) => {
        gifshot.createGIF({
          images: frames,
          gifWidth: targetWidth,
          gifHeight: targetHeight,
          interval: frameInterval,
          numWorkers: 2,
          sampleInterval: 3, // Lower is much better color quality (default is 10)
        }, (obj: any) => {
          if (obj.error) {
            reject(new Error(obj.errorMsg || 'GIF-Erstellung fehlgeschlagen'));
          } else {
            const base64Data = obj.image.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/gif' });
            resolve(blob);
          }
        });
      });

    } catch (err) {
      // Make sure we restore original state even on error
      try {
        video.currentTime = originalTime;
        if (!wasPaused) {
          video.play().catch(() => {});
        }
      } catch (e) {}
      throw err;
    }
  };

  const generateVideoBlob = async (
    videoUrl: string,
    loopStartMs: number,
    loopEndMs: number | null
  ): Promise<Blob> => {
    const video = videoRef.current;
    if (!video) {
      throw new Error('Video-Element im Editor nicht gefunden');
    }

    const originalTime = video.currentTime;
    const wasPaused = video.paused;

    try {
      if (!wasPaused) {
        video.pause();
      }

      const startSec = loopStartMs / 1000;
      const duration = video.duration || 10;
      let endSec = loopEndMs !== null ? loopEndMs / 1000 : duration;

      if (endSec - startSec > 5) {
        endSec = startSec + 5;
      }
      if (endSec <= startSec) {
        endSec = startSec + 2;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const targetWidth = 480;
      const targetHeight = Math.round(targetWidth * (video.videoHeight / video.videoWidth || 0.5625));
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      let stream: MediaStream | null = null;
      if ((canvas as any).captureStream) {
        stream = (canvas as any).captureStream(24);
      } else if ((canvas as any).mozCaptureStream) {
        stream = (canvas as any).mozCaptureStream(24);
      }

      if (!stream) {
        throw new Error('Gerät unterstützt keine Canvas-Stream-Extraktion');
      }

      const chunks: Blob[] = [];
      const mimeTypes = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
      let chosenMime = '';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime)) {
          chosenMime = mime;
          break;
        }
      }

      const recorder = new MediaRecorder(stream, chosenMime ? { mimeType: chosenMime } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      const recordPromise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: chosenMime || 'video/webm' });
          resolve(blob);
        };
        recorder.onerror = (e) => reject(e);
      });

      recorder.start();

      const fps = 24;
      const frameInterval = 1 / fps;
      const loopDuration = endSec - startSec;
      const totalFrames = Math.max(1, Math.floor(loopDuration * fps));

      for (let i = 0; i < totalFrames; i++) {
        const seekTime = startSec + (i * frameInterval);
        if (seekTime > duration) break;

        await new Promise<void>((res) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            res();
          };
          video.addEventListener('seeked', onSeeked);
          video.currentTime = seekTime;
        });

        if (ctx) {
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        }
        
        await new Promise(r => setTimeout(r, 15));
      }

      recorder.stop();
      const videoBlob = await recordPromise;

      video.currentTime = originalTime;
      if (!wasPaused) {
        video.play().catch(() => {});
      }

      return videoBlob;
    } catch (err) {
      try {
        video.currentTime = originalTime;
        if (!wasPaused) {
          video.play().catch(() => {});
        }
      } catch (e) {}
      throw err;
    }
  };

  const handleSaveIni = async () => {
    setIsSaving(true);
    setStatusMsg('Speichere yadaintro.ini...');
    try {
      const iniText = stringifyIntroIni(config);
      
      if (!group.fileName) throw new Error('Missing beatmap filename');
      const oszBlob = await getOszFile(group.fileName);
      if (!oszBlob) throw new Error('Could not find .osz file in DB');

      // Load zip, add file, and save back!
      const zip = await JSZip.loadAsync(oszBlob);
      zip.file('yadaintro.ini', iniText);

      // Handle different Play before Tap modes based on user selection
      if (config.videoPlayBeforeTap && videoUrl) {
        const mode = config.videoPlayBeforeTapMode || 'same_video';
        
        if (mode === 'gif') {
          setStatusMsg('Extrahiere Loop-GIF aus Video... Bitte warten...');
          try {
            const gifBlob = await generateGifBlob(videoUrl, config.videoLoopStart, config.videoLoopEnd);
            zip.file('intro_loop.gif', gifBlob);
            zip.remove('intro_loop.webm');
            group.versions.forEach(v => {
              v.introGifFilename = 'intro_loop.gif';
              delete v.introLoopVideoFilename;
            });
            setStatusMsg('Loop-GIF erfolgreich generiert!');
            await new Promise(r => setTimeout(r, 800));
          } catch (gifErr) {
            console.warn('Could not extract GIF from video:', gifErr);
            setStatusMsg('GIF-Erstellung fehlgeschlagen, speichere ohne GIF...');
            await new Promise(r => setTimeout(r, 1500));
          }
        } else if (mode === 'video') {
          setStatusMsg('Generiere Loop-Video aus Video... Bitte warten...');
          try {
            const videoBlob = await generateVideoBlob(videoUrl, config.videoLoopStart, config.videoLoopEnd);
            zip.file('intro_loop.webm', videoBlob);
            zip.remove('intro_loop.gif');
            group.versions.forEach(v => {
              v.introLoopVideoFilename = 'intro_loop.webm';
              delete v.introGifFilename;
            });
            setStatusMsg('Loop-Video erfolgreich generiert!');
            await new Promise(r => setTimeout(r, 800));
          } catch (videoErr) {
            console.warn('Could not generate loop video:', videoErr);
            setStatusMsg('Loop-Video-Erstellung fehlgeschlagen, speichere ohne Loop-Video...');
            await new Promise(r => setTimeout(r, 1500));
          }
        } else {
          // 'same_video' mode or fallback: clean up generated files
          zip.remove('intro_loop.gif');
          zip.remove('intro_loop.webm');
          group.versions.forEach(v => {
            delete v.introGifFilename;
            delete v.introLoopVideoFilename;
          });
        }
      } else {
        // Option is disabled: remove any existing pre-tap loop assets
        zip.remove('intro_loop.gif');
        zip.remove('intro_loop.webm');
        group.versions.forEach(v => {
          delete v.introGifFilename;
          delete v.introLoopVideoFilename;
        });
      }

      const updatedBlob = await zip.generateAsync({ type: 'blob' });
      await saveOszFile(group.fileName, updatedBlob);

      // Mutate the original group reference so UI immediately updates
      group.versions.forEach(v => {
        v.introIniFilename = 'yadaintro.ini';
      });

      setStatusMsg('Erfolgreich gespeichert! ✨');
      setTimeout(() => {
        setStatusMsg(null);
        setIsSaving(false);
        onSave();
      }, 1500);
    } catch (err: any) {
      console.error('Error saving yadaintro.ini:', err);
      setStatusMsg(`Fehler: ${err.message}`);
      setTimeout(() => {
        setStatusMsg(null);
        setIsSaving(false);
      }, 3000);
    }
  };

  // Find currently active text cue (playback is within its duration range)
  const activeCue = config.textCues.find(cue => {
    const t = currentTime * 1000;
    return t >= cue.time && (cue.endTime === undefined || t < cue.endTime);
  });

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black/95 backdrop-blur-md z-[200] flex flex-col font-sans select-none text-white">
      {/* HEADER BAR */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-[#12121A]">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00E8FF] animate-pulse" />
          <div>
            <h2 className="text-lg font-black tracking-wide uppercase">yadaintro.ini Editor</h2>
            <p className="text-xs text-gray-400 truncate max-w-md">{group.title} – {group.artist}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveIni}
            disabled={isSaving}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-white font-bold text-xs uppercase px-4 py-2 rounded shadow transition-all"
          >
            <Check className="w-4 h-4" /> Speichern
          </button>
          
          <button
            onClick={onClose}
            className="p-2 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* MAIN VIEWPORT */}
      <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden bg-black">
        {/* VIEWPORT & TEXT OVERLAY */}
        <div className="flex-1 flex flex-col items-center justify-center relative bg-gradient-to-b from-[#0e0d16] to-[#040407] p-6 border-b md:border-b-0 md:border-r border-white/5">
          {/* Audio Source Element */}
          {audioUrl && <audio ref={audioRef} src={audioUrl} autoPlay={false} />}
          
          {/* Display/Video Box */}
          <div className="relative aspect-video w-full max-w-2xl bg-black rounded border border-white/10 shadow-2xl overflow-hidden flex items-center justify-center">
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
            ) : bgUrl ? (
              <img
                src={bgUrl}
                alt="Background"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover opacity-40 blur-[2px]"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/20 via-black to-purple-950/20" />
            )}

            {/* Simulated Live Intro Overlay Cues */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
              {activeCue ? (
                <div className="flex items-center space-x-4 animate-[fadeIn_0.3s_ease-out_forwards]">
                  <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-gray-400 -rotate-90 animate-[spin_4s_linear_infinite]" />
                  <span className="text-2xl font-bold tracking-wide text-white text-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] px-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {activeCue.text}
                  </span>
                  <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-gray-400 rotate-90 animate-[spin_5s_linear_infinite_reverse]" />
                </div>
              ) : (
                <div className="text-gray-650 font-mono text-xs tracking-wider select-none opacity-40">Kein Text aktiv</div>
              )}
            </div>
            
            {/* Play/Pause center hover click */}
            <div 
              onClick={handlePlayPause}
              className="absolute inset-0 flex items-center justify-center bg-black/35 hover:bg-black/10 transition-colors cursor-pointer group"
            >
              {!isPlaying && (
                <div className="p-4 rounded-full bg-[#00E8FF] text-black shadow-lg scale-90 group-hover:scale-100 transition-all opacity-80 group-hover:opacity-100">
                  <Play className="w-8 h-8 fill-black ml-1" />
                </div>
              )}
            </div>
          </div>

          {/* STATUS NOTIFICATION BAR */}
          {statusMsg && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/85 border border-white/10 px-4 py-2 rounded shadow-lg text-xs font-semibold text-[#00E8FF] tracking-wider uppercase animate-[fadeIn_0.2s_ease-out_forwards]">
              {statusMsg}
            </div>
          )}
        </div>

        {/* SIDEBAR: PROPERTIES PANEL */}
        <div className="w-full md:w-80 bg-[#12121A] flex flex-col overflow-y-auto border-t md:border-t-0 border-white/10 custom-scrollbar p-5 gap-5">
          <div>
            <h3 className="text-xs font-black tracking-widest text-[#00E8FF] uppercase mb-3">Intro-Einstellungen</h3>
            
            {/* PlayBeforeTap Toggle */}
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-xs text-gray-300">Video vor dem Tap abspielen</span>
              <input
                type="checkbox"
                checked={config.videoPlayBeforeTap}
                onChange={(e) => {
                  pushHistory({
                    ...config,
                    videoPlayBeforeTap: e.target.checked
                  });
                }}
                className="rounded text-[#00E8FF] focus:ring-[#00E8FF] bg-black/40 border-white/20 w-4 h-4"
              />
            </div>

            {/* LoopPoints display if PlayBeforeTap is true */}
            {config.videoPlayBeforeTap && (
              <div className="flex flex-col gap-3 mt-2 bg-black/30 rounded p-2.5 border border-white/5">
                
                {/* Mode selector */}
                <div className="flex flex-col gap-1 border-b border-white/5 pb-2.5 mb-1.5">
                  <span className="text-[11px] font-bold text-gray-400">Vor-Tap Loop-Typ</span>
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    <button
                      onClick={() => pushHistory({ ...config, videoPlayBeforeTapMode: 'same_video' })}
                      className={`text-[10px] py-1 px-1.5 rounded border text-center transition-all font-medium ${
                        (!config.videoPlayBeforeTapMode || config.videoPlayBeforeTapMode === 'same_video')
                          ? 'bg-[#00E8FF]/20 border-[#00E8FF] text-[#00E8FF]'
                          : 'bg-black/20 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                      }`}
                    >
                      Original
                    </button>
                    <button
                      onClick={() => pushHistory({ ...config, videoPlayBeforeTapMode: 'gif' })}
                      className={`text-[10px] py-1 px-1.5 rounded border text-center transition-all font-medium ${
                        config.videoPlayBeforeTapMode === 'gif'
                          ? 'bg-[#00E8FF]/20 border-[#00E8FF] text-[#00E8FF]'
                          : 'bg-black/20 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                      }`}
                    >
                      GIF
                    </button>
                    <button
                      onClick={() => pushHistory({ ...config, videoPlayBeforeTapMode: 'video' })}
                      className={`text-[10px] py-1 px-1.5 rounded border text-center transition-all font-medium ${
                        config.videoPlayBeforeTapMode === 'video'
                          ? 'bg-[#00E8FF]/20 border-[#00E8FF] text-[#00E8FF]'
                          : 'bg-black/20 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                      }`}
                    >
                      Video
                    </button>
                  </div>
                  <p className="text-[9.5px] text-gray-500 mt-1 leading-normal">
                    {(!config.videoPlayBeforeTapMode || config.videoPlayBeforeTapMode === 'same_video') && "Loopet dasselbe Original-Video (ressourcenschonend)."}
                    {config.videoPlayBeforeTapMode === 'gif' && "Generiert ein animiertes GIF. Ideal für maximale Kompatibilität."}
                    {config.videoPlayBeforeTapMode === 'video' && "Generiert ein echtes hochqualitatives WebM Loop-Video."}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">Loop Startzeitpunkt</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-gray-200">{formatTime(config.videoLoopStart / 1000)}</span>
                    <button
                      onClick={() => {
                        pushHistory({ ...config, videoLoopStart: Math.round(currentTime * 1000) });
                        setStatusMsg('Loop Startzeitpunkt gesetzt!');
                        setTimeout(() => setStatusMsg(null), 1500);
                      }}
                      className="text-[9px] uppercase font-bold text-[#00E8FF] bg-[#00E8FF]/10 px-1.5 py-0.5 rounded border border-[#00E8FF]/20"
                    >
                      Setzen
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">Loop Endzeitpunkt</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-gray-200">
                      {config.videoLoopEnd !== null ? formatTime(config.videoLoopEnd / 1000) : 'Ende der Datei'}
                    </span>
                    <button
                      onClick={() => {
                        pushHistory({ ...config, videoLoopEnd: Math.round(currentTime * 1000) });
                        setStatusMsg('Loop Endzeitpunkt gesetzt!');
                        setTimeout(() => setStatusMsg(null), 1500);
                      }}
                      className="text-[9px] uppercase font-bold text-[#00E8FF] bg-[#00E8FF]/10 px-1.5 py-0.5 rounded border border-[#00E8FF]/20"
                    >
                      Setzen
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PlayAfterTap Toggle */}
            <div className="flex items-center justify-between py-2 border-b border-white/5 mt-2">
              <span className="text-xs text-gray-300">Video nach dem Tap weiterabspielen</span>
              <input
                type="checkbox"
                checked={config.videoPlayAfterTap}
                onChange={(e) => {
                  pushHistory({
                    ...config,
                    videoPlayAfterTap: e.target.checked
                  });
                }}
                className="rounded text-[#00E8FF] focus:ring-[#00E8FF] bg-black/40 border-white/20 w-4 h-4"
              />
            </div>

            {/* WaitForLoopEnd (nach dem Tap auf Loop-Erreichen warten) Toggle */}
            {config.videoPlayBeforeTap && (
              <div className="flex items-center justify-between py-2 border-b border-white/5 mt-1">
                <span className="text-xs text-gray-300">Warte bis Loop-Ende vor Sprung</span>
                <input
                  type="checkbox"
                  checked={config.videoWaitForLoopEnd}
                  onChange={(e) => {
                    pushHistory({
                      ...config,
                      videoWaitForLoopEnd: e.target.checked
                    });
                  }}
                  className="rounded text-[#00E8FF] focus:ring-[#00E8FF] bg-black/40 border-white/20 w-4 h-4"
                />
              </div>
            )}
          </div>

          {/* ACTIVE OBJECTS / TEXT CUES LIST */}
          <div className="flex-1 flex flex-col min-h-[160px]">
            <h3 className="text-xs font-black tracking-widest text-[#00E8FF] uppercase mb-2">Text-Objekte</h3>
            <div className="flex-1 border border-white/5 rounded bg-black/30 overflow-y-auto max-h-[30vh] md:max-h-none custom-scrollbar p-2 flex flex-col gap-1.5">
              {config.textCues.length === 0 ? (
                <div className="text-center text-xs text-gray-500 py-6 italic">Noch keine Texteinblendungen hinzugefügt</div>
              ) : (
                config.textCues.map((cue, idx) => {
                  const isSelected = idx === selectedCueIndex;
                  return (
                    <div
                      key={cue.time}
                      onClick={() => {
                        setSelectedCueIndex(idx);
                        // Seek to cue start time
                        setCurrentTime(cue.time / 1000);
                        if (audioRef.current) audioRef.current.currentTime = cue.time / 1000;
                        if (videoRef.current) videoRef.current.currentTime = cue.time / 1000;
                      }}
                      className={`p-2 rounded border text-xs text-left cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                          : 'bg-white/5 border-transparent hover:bg-white/10 text-gray-300 hover:text-white'
                      }`}
                    >
                      <div className="truncate flex-1">
                        <div className="font-mono text-[10px] text-gray-400">
                          {formatTime(cue.time / 1000)} – {cue.endTime !== undefined ? formatTime(cue.endTime / 1000) : 'Ende'}
                        </div>
                        <div className="truncate font-semibold mt-0.5">{cue.text}</div>
                      </div>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const updated = config.textCues.filter((_, i) => i !== idx);
                          pushHistory({ ...config, textCues: updated });
                          if (selectedCueIndex === idx) setSelectedCueIndex(null);
                        }}
                        className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER BAR: CONTROLS & TIMELINE */}
      <div className="border-t border-white/10 px-6 py-4 bg-[#12121A] flex flex-col gap-3">
        {/* BUTTONS / CONTROLS PANEL */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Playback & Undo / Redo Row */}
          <div className="flex items-center gap-2">
            {/* Play/Pause Button */}
            <button
              onClick={handlePlayPause}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
            </button>
            
            {/* Current Time Info */}
            <div className="text-sm font-mono tracking-wide text-gray-300 select-all px-2 bg-black/40 border border-white/5 rounded py-1.5 min-w-[120px] text-center">
              {formatTime(currentTime)} / {formatTime(activeMaxTime)}
            </div>

            {/* Undo Button */}
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-gray-300 disabled:text-gray-600 disabled:hover:bg-white/5 transition-colors text-xs font-bold flex items-center gap-1"
              title="Undo"
            >
              <RotateCcw className="w-4 h-4" /> Undo
            </button>

            {/* Redo Button */}
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-gray-300 disabled:text-gray-600 disabled:hover:bg-white/5 transition-colors text-xs font-bold flex items-center gap-1"
              title="Redo"
            >
              <RotateCcw className="w-4 h-4 -scale-x-100" /> Redo
            </button>
          </div>

          {/* Delete Active Marker & Add Item "+" Dropdown Button */}
          <div className="flex items-center gap-2 relative">
            {/* Delete button (deletes selected text cue or closest marker) */}
            <button
              onClick={handleDeleteActive}
              className="bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 font-bold text-xs px-3 py-2 rounded transition-colors flex items-center gap-1.5"
              title="Objekt löschen"
            >
              <Trash2 className="w-4 h-4" /> Löschen
            </button>

            {/* "+" Add Dropdown Trigger */}
            <button
              onClick={() => setShowAddDropdown(!showAddDropdown)}
              className="bg-[#00E8FF]/10 hover:bg-[#00E8FF]/20 border border-[#00E8FF]/30 text-[#00E8FF] rounded font-bold text-xs px-4 py-2 flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" /> Hinzufügen
            </button>

            {/* "+" Dropdown List */}
            {showAddDropdown && (
              <div className="absolute right-0 bottom-full mb-2 bg-[#12121A] border border-white/10 rounded-lg shadow-2xl p-2 w-64 z-[210] flex flex-col gap-1">
                {/* 1. Add Text Input */}
                <div className="p-1 border-b border-white/5 mb-1 flex flex-col gap-1">
                  <span className="text-[10px] font-black font-mono tracking-widest text-gray-400 uppercase">Text hinzufügen</span>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      placeholder={config.titleScreenAt === null || !hasExplicitStartOffset ? "Bitte zuerst Zeitpunkte setzen" : "Willkommen bei..."}
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddTextCue();
                      }}
                      disabled={config.titleScreenAt === null || !hasExplicitStartOffset}
                      className="bg-black/60 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-gray-500 flex-1 focus:outline-none focus:border-[#00E8FF] disabled:opacity-50"
                    />
                    <button
                      onClick={handleAddTextCue}
                      disabled={config.titleScreenAt === null || !hasExplicitStartOffset}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 2. Set Text End */}
                <button
                  onClick={handleSetTextEnd}
                  disabled={selectedCueIndex === null || config.titleScreenAt === null || !hasExplicitStartOffset}
                  className="text-left py-2 px-2.5 rounded text-xs text-gray-300 hover:bg-white/5 hover:text-white disabled:text-gray-600 disabled:hover:bg-transparent transition-colors flex items-center justify-between"
                >
                  <span>Text Ende setzen</span>
                  <span className="w-2 h-2 rounded bg-orange-500" />
                </button>

                {/* 3. Title Screen At */}
                <button
                  onClick={handleSetTitleScreenAt}
                  className="text-left py-2 px-2.5 rounded text-xs text-gray-300 hover:bg-white/5 hover:text-white transition-colors flex items-center justify-between"
                >
                  <span>Zum Titelbildschirm wechseln</span>
                  <span className="w-2 h-2 rounded bg-purple-500" />
                </button>

                {/* 4. Start Post-Tap Here */}
                <button
                  onClick={handleSetStartOffset}
                  className="text-left py-2 px-2.5 rounded text-xs text-gray-300 hover:bg-white/5 hover:text-white transition-colors flex items-center justify-between"
                >
                  <span>Nach Tap startet hier (Post-Tap)</span>
                  <span className="w-2 h-2 rounded bg-fuchsia-500" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* TIMELINE TRACK */}
        <div className="flex flex-col gap-1 bg-[#12121A]">
          <div className="flex items-center justify-between text-[10px] font-black font-mono tracking-widest text-gray-400 uppercase">
            <span>Zeitleiste</span>
            <span>Klicke zum Navigieren</span>
          </div>

          <div
            onClick={handleTimelineClick}
            className="h-10 w-full relative bg-[#12121A]/90 border border-white/10 rounded cursor-pointer overflow-hidden select-none"
          >
            {/* 1. Draw Text Cue Green Areas (0% transparency / 100% opacity) */}
            {config.textCues.map((cue, idx) => {
              const startPct = ((cue.time / 1000) - activeMinTime) / activeDuration;
              const endPct = cue.endTime !== undefined 
                ? ((cue.endTime / 1000) - activeMinTime) / activeDuration 
                : 1;

              const leftPct = `${Math.max(0, startPct * 100)}%`;
              const widthPct = `${Math.max(0.5, (endPct - startPct) * 100)}%`;
              const isSelected = idx === selectedCueIndex;

              return (
                <div
                  key={cue.time}
                  style={{ left: leftPct, width: widthPct }}
                  className={`absolute top-0 bottom-0 ${
                    isSelected ? 'bg-emerald-500/40 border-l border-r border-emerald-400' : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-l border-emerald-500/40'
                  }`}
                  title={`${cue.text} (${formatTime(cue.time / 1000)})`}
                />
              );
            })}

            {/* 2. Draw Text End Red-Orange Vertical Line Markers */}
            {config.textCues.map((cue) => {
              if (cue.endTime === undefined) return null;
              const endPct = ((cue.endTime / 1000) - activeMinTime) / activeDuration;
              const leftPct = `${Math.max(0, endPct * 100)}%`;

              return (
                <div
                  key={`${cue.time}-end`}
                  style={{ left: leftPct }}
                  className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-10"
                  title={`Text Ende (${formatTime(cue.endTime / 1000)})`}
                />
              );
            })}

            {/* 3. Draw Post-Tap StartOffset Vertical line marker (Pink-to-Magenta) */}
            {(() => {
              const startOffsetPct = ((config.audioStartOffset / 1000) - activeMinTime) / activeDuration;
              if (startOffsetPct > 1 || startOffsetPct < 0) return null;
              const leftPct = `${startOffsetPct * 100}%`;
              return (
                <div
                  style={{ left: leftPct }}
                  className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-pink-500 to-fuchsia-500 z-15"
                  title={`Start nach Tap (${formatTime(config.audioStartOffset / 1000)})`}
                />
              );
            })()}

            {/* 4. Draw Title Screen At Vertical line marker (Purple/Lila) */}
            {config.titleScreenAt !== null && (() => {
              const titleScreenPct = ((config.titleScreenAt / 1000) - activeMinTime) / activeDuration;
              const leftPct = `${titleScreenPct * 100}%`;
              return (
                <div
                  style={{ left: leftPct }}
                  className="absolute top-0 bottom-0 w-0.5 bg-purple-500 z-15"
                  title={`Titelbildschirm-Wechsel (${formatTime(config.titleScreenAt / 1000)})`}
                />
              );
            })()}

            {/* 5. Live playback tracking head line */}
            {(() => {
              const livePct = ((currentTime - activeMinTime) / activeDuration) * 100;
              if (livePct > 100 || livePct < 0) return null;
              return (
                <div
                  style={{ left: `${livePct}%` }}
                  className="absolute top-0 bottom-0 w-[3px] bg-[#00E8FF] shadow-[0_0_8px_rgba(0,232,255,0.8)] z-20"
                />
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
