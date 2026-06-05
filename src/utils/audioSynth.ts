import { Beatmap, HitObject } from '../types';

/**
 * Procedural Audio Synthesizer & Beatmap Generator
 * Renders a full high-fidelity 44.1kHz stereo track in under 100ms using OfflineAudioContext.
 * This ensures the application is fully standalone and immediately playable with a cool retro track!
 */

export function createSynthwaveTutorial(): { beatmap: Beatmap; audioBuffer: AudioBuffer } {
  const sampleRate = 44100;
  const durationSec = 36; // 36 seconds of beautiful retro grid song
  const numSamples = sampleRate * durationSec;
  
  // Set up OfflineAudioContext
  const ctx = new OfflineAudioContext(2, numSamples, sampleRate);
  
  const bpm = 125;
  const beatDuration = 60 / bpm; // 0.48 seconds (480ms)
  const barDuration = beatDuration * 4; // 1.92 seconds (1920ms)

  // --- 1. Synthesize Drums (Kick & Snare) ---
  const dest = ctx.destination;

  // Synthesize white noise buffer for Snare
  const noiseSize = sampleRate * 1.5;
  const noiseBuffer = ctx.createBuffer(1, noiseSize, sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseSize; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  // Draw Kick and Snare events over 36 seconds
  const totalBars = Math.floor(durationSec / barDuration);

  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = bar * barDuration;
    
    // 4 beats per bar
    for (let beat = 0; beat < 4; beat++) {
      const beatTime = barStart + beat * beatDuration;
      if (beatTime >= durationSec - 1) break;

      // ---- KICK DRUM (Sine sweep) on every beat ----
      const kickOsc = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kickOsc.type = 'sine';
      
      // Pitch envelope: sweep from 150Hz down to 40Hz in 120ms
      kickOsc.frequency.setValueAtTime(150, beatTime);
      kickOsc.frequency.exponentialRampToValueAtTime(45, beatTime + 0.12);
      
      // Volume envelope
      kickGain.gain.setValueAtTime(0.8, beatTime);
      kickGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.25);
      
      kickOsc.connect(kickGain);
      kickGain.connect(dest);
      
      kickOsc.start(beatTime);
      kickOsc.stop(beatTime + 0.3);

      // ---- SNARE DRUM on beat 1 and 3 (index 1 & 3 of 0-1-2-3, i.e., second and fourth beat) ----
      if (beat === 1 || beat === 3) {
        // Noise component
        const snareNoise = ctx.createBufferSource();
        snareNoise.buffer = noiseBuffer;
        
        const snareNoiseFilter = ctx.createBiquadFilter();
        snareNoiseFilter.type = 'bandpass';
        snareNoiseFilter.frequency.setValueAtTime(1000, beatTime);
        
        const snareNoiseGain = ctx.createGain();
        snareNoiseGain.gain.setValueAtTime(0.35, beatTime);
        snareNoiseGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.22);
        
        snareNoise.connect(snareNoiseFilter);
        snareNoiseFilter.connect(snareNoiseGain);
        snareNoiseGain.connect(dest);
        
        // Tone component of Snare (combining pitch sweet)
        const snareOsc = ctx.createOscillator();
        const snareOscGain = ctx.createGain();
        snareOsc.type = 'triangle';
        snareOsc.frequency.setValueAtTime(180, beatTime);
        snareOsc.frequency.exponentialRampToValueAtTime(90, beatTime + 0.1);
        
        snareOscGain.gain.setValueAtTime(0.4, beatTime);
        snareOscGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.15);
        
        snareOsc.connect(snareOscGain);
        snareOscGain.connect(dest);
        
        snareNoise.start(beatTime);
        snareNoise.stop(beatTime + 0.3);
        snareOsc.start(beatTime);
        snareOsc.stop(beatTime + 0.2);
      }
    }
  }

  // --- 2. Synthesize Bassline (Driving 8th notes) ---
  // Simple retro groove: I - V - VI - IV chord progression
  // Chords: Am (A), C, G, F
  const chords = [
    55,  // A2 (110Hz)
    55,
    60,  // C3 (130.81Hz)
    60,
    59,  // G2 (98Hz)
    59,
    57,  // F2 (87.31Hz)
    57
  ];

  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = bar * barDuration;
    const chordRootAndMid = chords[bar % chords.length];
    const rootFreq = 440 * Math.pow(2, (chordRootAndMid - 69) / 12);

    // 8 notes per bar (eighth notes)
    for (let note = 0; note < 8; note++) {
      const noteTime = barStart + note * (beatDuration / 2);
      if (noteTime >= durationSec - 1) break;

      // Bass note is a warm sawtooth wave
      const bassOsc = ctx.createOscillator();
      const bassFilter = ctx.createBiquadFilter();
      const bassGain = ctx.createGain();

      bassOsc.type = 'sawtooth';
      bassOsc.frequency.setValueAtTime(rootFreq, noteTime);

      // Octave jump for rhythmic variation
      if (note % 4 === 2 || note % 4 === 3) {
        bassOsc.frequency.setValueAtTime(rootFreq * 2, noteTime);
      }

      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(800, noteTime);
      bassFilter.frequency.exponentialRampToValueAtTime(250, noteTime + 0.18);
      bassFilter.Q.value = 4;

      bassGain.gain.setValueAtTime(0.18, noteTime);
      bassGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.22);

      bassOsc.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(dest);

      bassOsc.start(noteTime);
      bassOsc.stop(noteTime + 0.25);
    }
  }

  // --- 3. Synthesize Lead Arpeggio / Melody (Dreamy retro sound) ---
  // Retro sci-fi theme melody
  // Notes in MIDI
  const melodyPattern = [
    69, 72, 76, 79, 81, 79, 76, 72, // A minor arpeggiated motif
    72, 76, 79, 83, 84, 83, 79, 76, // C major arpeggiated motif
    67, 71, 74, 76, 79, 76, 74, 71, // G major arpeggiated motif
    65, 69, 72, 76, 77, 76, 72, 69  // F major arpeggiated motif
  ];

  // Delay / Echo effect for the lead Synth!
  const delayNode = ctx.createDelay();
  const delayFeedback = ctx.createGain();
  const delayOutputVolume = ctx.createGain();

  delayNode.delayTime.value = beatDuration * 0.75; // Dotted eighth note delay
  delayFeedback.gain.value = 0.35; // feedback level
  delayOutputVolume.gain.value = 0.15; // echo level

  // Loop delay feedback
  delayNode.connect(delayFeedback);
  delayFeedback.connect(delayNode);
  delayNode.connect(delayOutputVolume);
  delayOutputVolume.connect(dest);

  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = bar * barDuration;
    const melodyIndexOffset = (bar % 4) * 8;

    // Play 16th notes or 8th notes melody
    for (let i = 0; i < 8; i++) {
      const noteTime = barStart + i * (beatDuration / 2) + 0.05; // slightly offset from drum strike
      if (noteTime >= durationSec - 1) break;

      // Skip some notes to create cooler rhythm
      if (i === 3 || i === 7) continue;

      const midiNode = melodyPattern[melodyIndexOffset + i];
      const freq = 440 * Math.pow(2, (midiNode - 69) / 12);

      const leadOsc = ctx.createOscillator();
      const leadFilter = ctx.createBiquadFilter();
      const leadGain = ctx.createGain();

      leadOsc.type = 'triangle'; // Smooth triangle wave layered with brief square helper
      leadOsc.frequency.setValueAtTime(freq, noteTime);

      // Lowpass filter envelope
      leadFilter.type = 'lowpass';
      leadFilter.frequency.setValueAtTime(2500, noteTime);
      leadFilter.frequency.exponentialRampToValueAtTime(1200, noteTime + 0.25);

      // Envelope: Soft attack, crisp decay/release
      leadGain.gain.setValueAtTime(0.001, noteTime);
      leadGain.gain.linearRampToValueAtTime(0.12, noteTime + 0.02);
      leadGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

      leadOsc.connect(leadFilter);
      leadFilter.connect(leadGain);
      
      // Connect to both main master and the custom stereo delay line!
      leadGain.connect(dest);
      leadGain.connect(delayNode);

      leadOsc.start(noteTime);
      leadOsc.stop(noteTime + 0.4);

      // Square layer for rich harmonics (subtle)
      const leadSquare = ctx.createOscillator();
      const sqGain = ctx.createGain();
      leadSquare.type = 'square';
      leadSquare.frequency.setValueAtTime(freq, noteTime);
      
      sqGain.gain.setValueAtTime(0.001, noteTime);
      sqGain.gain.linearRampToValueAtTime(0.02, noteTime + 0.01);
      sqGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.1);

      leadSquare.connect(leadFilter);
      leadFilter.connect(sqGain);
      sqGain.connect(dest);
      sqGain.connect(delayNode);

      leadSquare.start(noteTime);
      leadSquare.stop(noteTime + 0.15);
    }
  }

  // Render the audio
  let finalAudioBuffer: AudioBuffer | null = null;
  ctx.startRendering().then((buf) => {
    finalAudioBuffer = buf;
  });

  // --- 4. Synchronized Beatmap Generation ---
  // Create beautiful patterns of HitObjects linked to this melody!
  const hitObjects: HitObject[] = [];
  let comboIndex = 1;
  let comboSet = 0;

  // Pattern positioning helpers
  // Let's create beautiful loops, triangles, clocks and paths
  const getCirclePosition = (index: number, patternType: string) => {
    const marginIndex = index % 8;
    const centerX = 256;
    const centerY = 192;
    const radius = 100;

    switch (patternType) {
      case 'circle-loop': {
        const angle = (marginIndex / 8) * Math.PI * 2;
        return {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * (radius * 0.8)
        };
      }
      case 'left-right-stream': {
        const offset = marginIndex % 2 === 0 ? -120 : 120;
        return {
          x: centerX + offset,
          y: centerY + (marginIndex - 4) * 20
        };
      }
      case 'triangle': {
        const subIdx = marginIndex % 3;
        if (subIdx === 0) return { x: centerX, y: centerY - 90 };
        if (subIdx === 1) return { x: centerX + 110, y: centerY + 60 };
        return { x: centerX - 110, y: centerY + 60 };
      }
      case 'square-corners': {
        const subIdx = marginIndex % 4;
        if (subIdx === 0) return { x: centerX - 120, y: centerY - 90 };
        if (subIdx === 1) return { x: centerX + 120, y: centerY - 90 };
        if (subIdx === 2) return { x: centerX + 120, y: centerY + 90 };
        return { x: centerX - 120, y: centerY + 90 };
      }
      default:
        return {
          x: centerX + (Math.random() * 200 - 100),
          y: centerY + (Math.random() * 140 - 70)
        };
    }
  };

  // We spawn hits on beats
  // BPM = 125, beat in ms = 480ms.
  const beatMs = 480;
  const barMs = beatMs * 4; // 1920ms

  // Generate 18 bars of interactive hit circles!
  for (let bar = 1; bar < 17; bar++) {
    const barStartMs = bar * barMs;
    const patternNames = ['circle-loop', 'left-right-stream', 'triangle', 'square-corners'];
    const patternType = patternNames[bar % patternNames.length];
    
    // Cycle combo color at the start of each bar!
    comboIndex = 1;
    comboSet = (comboSet + 1) % 4;

    if (bar % 4 === 3) {
      // Create slider instead of simple circles for a cool rhythm transition!
      const startX = 100;
      const startY = 192;
      const length = 312;
      const totalDuration = beatMs * 2; // Lasts 2 beats
      
      hitObjects.push({
        id: `procedural-slider-${barStartMs}`,
        x: startX,
        y: startY,
        time: barStartMs,
        endTime: barStartMs + totalDuration,
        type: 'slider',
        sliderPoints: [
          { x: startX, y: startY },
          { x: startX + length / 2, y: startY - 80 },
          { x: startX + length, y: startY }
        ],
        duration: totalDuration,
        comboIndex: comboIndex++,
        comboSet
      });

      // Spawn normal circles on the remaining beats
      const endCircleTime = barStartMs + beatMs * 2;
      const pos = getCirclePosition(2, patternType);
      hitObjects.push({
        id: `procedural-circle-${barStartMs + beatMs * 2}`,
        x: pos.x,
        y: pos.y,
        time: endCircleTime,
        type: 'circle',
        comboIndex: comboIndex++,
        comboSet
      });

      const pos3 = getCirclePosition(3, patternType);
      hitObjects.push({
        id: `procedural-circle-${barStartMs + beatMs * 3}`,
        x: pos3.x,
        y: pos3.y,
        time: barStartMs + beatMs * 3,
        type: 'circle',
        comboIndex: comboIndex++,
        comboSet
      });

    } else if (bar === 8 || bar === 16) {
      // Giant Spinner at the middle and end build-ups!
      const spinnerDuration = beatMs * 3.5;
      hitObjects.push({
        id: `procedural-spinner-${barStartMs}`,
        x: 256,
        y: 192,
        time: barStartMs,
        endTime: barStartMs + spinnerDuration,
        type: 'spinner',
        duration: spinnerDuration,
        comboIndex: comboIndex++,
        comboSet
      });
    } else {
      // Standard rhythmic hits matching the lead synth arp (8th notes and Quarter notes)
      // Beat 0, Beat 1, Beat 2, Beat 3
      for (let beat = 0; beat < 4; beat++) {
        const beatTime = barStartMs + beat * beatMs;
        const pos = getCirclePosition(beat, patternType);

        hitObjects.push({
          id: `procedural-${beatTime}`,
          x: pos.x,
          y: pos.y,
          time: beatTime,
          type: 'circle',
          comboIndex: comboIndex++,
          comboSet
        });

        // Add 8th note double taps on bar 2/6/10/14 to increase energy!
        if (bar % 2 === 0 && (beat === 1 || beat === 2)) {
          const offbeatTime = beatTime + (beatMs / 2);
          const posOff = getCirclePosition(beat + 4, patternType);
          hitObjects.push({
            id: `procedural-off-${offbeatTime}`,
            x: posOff.x,
            y: posOff.y,
            time: offbeatTime,
            type: 'circle',
            comboIndex: comboIndex++,
            comboSet
          });
        }
      }
    }
  }

  // Final spinner at the very end
  const finalBarStart = 17 * barMs;
  hitObjects.push({
    id: `procedural-spinner-final`,
    x: 256,
    y: 192,
    time: finalBarStart,
    endTime: finalBarStart + beatMs * 4,
    type: 'spinner',
    duration: beatMs * 4,
    comboIndex: 1,
    comboSet: (comboSet + 1) % 4
  });

  const beatmap: Beatmap = {
    id: 'built-in-synthwave-tutorial',
    title: 'New Beginnings',
    artist: 'Peter Lambert',
    creator: 'peppy',
    version: 'osu! Tutorial',
    audioFilename: 'new_beginnings.mp3',
    hpDrain: 4,
    circleSize: 3.8,
    overallDifficulty: 5,
    approachRate: 6.5,
    sliderMultiplier: 1.5,
    sliderTickRate: 1,
    hitObjects,
    duration: durationSec * 1000
  };

  // Wait for rendering to complete (block/sync loop or return buffer safely)
  // Let's create an asynchronous loading wrapper or pass the offline buffer directly!
  return {
    beatmap,
    // Note: the promise will resolve in <100ms, we can store the OfflineAudioContext
    // buffer or resolve it when checking in React. To make it simple, we will return a getBuffer method!
    audioBuffer: null as any // we'll trigger generation and resolve it in React!
  };
}

/**
 * Encapsulates the rendered buffer generator in an easy async promise
 */
export async function generateAudioBufferForBeatmap(): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const durationSec = 36;
  const numSamples = sampleRate * durationSec;
  const ctx = new OfflineAudioContext(2, numSamples, sampleRate);
  
  const bpm = 125;
  const beatDuration = 60 / bpm;
  const barDuration = beatDuration * 4;
  const dest = ctx.destination;

  // --- Noise for Snare ---
  const noiseSize = sampleRate * 1.5;
  const noiseBuffer = ctx.createBuffer(1, noiseSize, sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseSize; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const totalBars = Math.floor(durationSec / barDuration);

  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = bar * barDuration;
    
    for (let beat = 0; beat < 4; beat++) {
      const beatTime = barStart + beat * beatDuration;
      if (beatTime >= durationSec - 0.5) break;

      // Kick drum
      const kickOsc = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(140, beatTime);
      kickOsc.frequency.exponentialRampToValueAtTime(45, beatTime + 0.12);
      
      kickGain.gain.setValueAtTime(0.7, beatTime);
      kickGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.22);
      
      kickOsc.connect(kickGain);
      kickGain.connect(dest);
      kickOsc.start(beatTime);
      kickOsc.stop(beatTime + 0.25);

      // Snare drum
      if (beat === 1 || beat === 3) {
        const snareNoise = ctx.createBufferSource();
        snareNoise.buffer = noiseBuffer;
        
        const snareNoiseFilter = ctx.createBiquadFilter();
        snareNoiseFilter.type = 'highpass';
        snareNoiseFilter.frequency.setValueAtTime(400, beatTime);
        
        const snareNoiseGain = ctx.createGain();
        snareNoiseGain.gain.setValueAtTime(0.18, beatTime);
        snareNoiseGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.25);
        
        snareNoise.connect(snareNoiseFilter);
        snareNoiseFilter.connect(snareNoiseGain);
        snareNoiseGain.connect(dest);
        
        const snareOsc = ctx.createOscillator();
        const snareOscGain = ctx.createGain();
        snareOsc.type = 'triangle';
        snareOsc.frequency.setValueAtTime(180, beatTime);
        snareOsc.frequency.exponentialRampToValueAtTime(100, beatTime + 0.12);
        
        snareOscGain.gain.setValueAtTime(0.25, beatTime);
        snareOscGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.15);
        
        snareOsc.connect(snareOscGain);
        snareOscGain.connect(dest);
        
        snareNoise.start(beatTime);
        snareNoise.stop(beatTime + 0.25);
        snareOsc.start(beatTime);
        snareOsc.stop(beatTime + 0.2);
      }
    }
  }

  // --- Driving Synth Bassline ---
  const chords = [57, 57, 53, 53, 55, 55, 60, 59]; // Bass chords
  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = bar * barDuration;
    const chordNote = chords[bar % chords.length];
    const rootFreq = 440 * Math.pow(2, (chordNote - 69) / 12);

    for (let note = 0; note < 8; note++) {
      const noteTime = barStart + note * (beatDuration / 2);
      if (noteTime >= durationSec - 0.5) break;

      const bassOsc = ctx.createOscillator();
      const bassFilter = ctx.createBiquadFilter();
      const bassGain = ctx.createGain();

      bassOsc.type = 'sawtooth';
      
      const pitchOffset = note % 8 === 4 || note % 8 === 7 ? rootFreq * 2 : rootFreq;
      bassOsc.frequency.setValueAtTime(pitchOffset, noteTime);

      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(900, noteTime);
      bassFilter.frequency.exponentialRampToValueAtTime(320, noteTime + 0.18);
      bassFilter.Q.value = 2;

      bassGain.gain.setValueAtTime(0.16, noteTime);
      bassGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.22);

      bassOsc.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(dest);

      bassOsc.start(noteTime);
      bassOsc.stop(noteTime + 0.24);
    }
  }

  // --- Lead Synth Arpeggio ---
  const melodyPattern = [
    57, 60, 64, 67, 69, 67, 64, 60, // Am
    53, 57, 60, 64, 65, 64, 60, 57, // F
    55, 59, 62, 65, 67, 65, 62, 59, // G
    60, 64, 67, 71, 72, 71, 67, 64  // C
  ];

  const delayNode = ctx.createDelay();
  const delayFeedback = ctx.createGain();
  const delayOutputVolume = ctx.createGain();

  delayNode.delayTime.value = beatDuration * 0.75;
  delayFeedback.gain.value = 0.3;
  delayOutputVolume.gain.value = 0.12;

  delayNode.connect(delayFeedback);
  delayFeedback.connect(delayNode);
  delayNode.connect(delayOutputVolume);
  delayOutputVolume.connect(dest);

  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = bar * barDuration;
    const patternOffset = (bar % 4) * 8;

    for (let i = 0; i < 8; i++) {
      const noteTime = barStart + i * (beatDuration / 2) + 0.05;
      if (noteTime >= durationSec - 0.5) break;

      if (i === 3 || i === 7) continue; // Cool rhythmic syncopation

      const midiNode = melodyPattern[patternOffset + i] + 12; // Octave higher
      const freq = 440 * Math.pow(2, (midiNode - 69) / 12);

      const leadOsc = ctx.createOscillator();
      const leadFilter = ctx.createBiquadFilter();
      const leadGain = ctx.createGain();

      leadOsc.type = 'triangle';
      leadOsc.frequency.setValueAtTime(freq, noteTime);

      leadFilter.type = 'lowpass';
      leadFilter.frequency.setValueAtTime(3000, noteTime);
      leadFilter.frequency.exponentialRampToValueAtTime(1200, noteTime + 0.2);

      leadGain.gain.setValueAtTime(0.001, noteTime);
      leadGain.gain.linearRampToValueAtTime(0.14, noteTime + 0.02);
      leadGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.32);

      leadOsc.connect(leadFilter);
      leadFilter.connect(leadGain);
      
      leadGain.connect(dest);
      leadGain.connect(delayNode);

      leadOsc.start(noteTime);
      leadOsc.stop(noteTime + 0.35);

      // Layer a high square wave
      const sqOsc = ctx.createOscillator();
      const sqGain = ctx.createGain();
      sqOsc.type = 'sawtooth';
      sqOsc.frequency.setValueAtTime(freq, noteTime);

      sqGain.gain.setValueAtTime(0.001, noteTime);
      sqGain.gain.linearRampToValueAtTime(0.03, noteTime + 0.01);
      sqGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.1);

      sqOsc.connect(leadFilter);
      leadFilter.connect(sqGain);
      sqGain.connect(dest);

      sqOsc.start(noteTime);
      sqOsc.stop(noteTime + 0.12);
    }
  }

  // Generate a gorgeous warm pad chord swell in the background
  const padChords = [
    [45, 57, 60, 64], // Am
    [41, 53, 57, 60], // F
    [43, 55, 59, 62], // G
    [48, 60, 64, 67]  // C
  ];

  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = bar * barDuration;
    const chord = padChords[bar % padChords.length];

    for (const midiNode of chord) {
      const freq = 440 * Math.pow(2, (midiNode - 69) / 12);

      const padOsc = ctx.createOscillator();
      const padGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      padOsc.type = 'sine';
      padOsc.frequency.setValueAtTime(freq, barStart);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, barStart);
      filter.frequency.linearRampToValueAtTime(500, barStart + barDuration / 2);
      filter.frequency.linearRampToValueAtTime(300, barStart + barDuration);

      // Soft envelope
      padGain.gain.setValueAtTime(0.001, barStart);
      padGain.gain.linearRampToValueAtTime(0.06, barStart + 0.5);
      padGain.gain.setValueAtTime(0.06, barStart + barDuration - 0.5);
      padGain.gain.linearRampToValueAtTime(0.001, barStart + barDuration);

      padOsc.connect(filter);
      filter.connect(padGain);
      padGain.connect(dest);

      padOsc.start(barStart);
      padOsc.stop(barStart + barDuration);
    }
  }

  return await ctx.startRendering();
}

/**
 * Generates an high-fidelity 160 BPM electronic theme loop resembling a cool chiptune/cyberpunk track
 * in case the local "Triangles" MP3 cannot be fetched or loaded due to browser restrictions.
 */
export async function generateProceduralTrianglesTheme(): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const durationSec = 16; // 16s loop
  const numSamples = sampleRate * durationSec;
  const ctx = new OfflineAudioContext(2, numSamples, sampleRate);
  
  const bpm = 160;
  const beatSec = 60 / bpm; // 0.375s (375ms)
  const barSec = beatSec * 4; // 1.5s
  const dest = ctx.destination;

  // Synthesize some white noise
  const noiseBuff = ctx.createBuffer(1, sampleRate, sampleRate);
  const noiseData = noiseBuff.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const totalBars = Math.floor(durationSec / barSec);

  // Drums + Synth Bass
  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = bar * barSec;

    // Chord degrees: Am - F - G - Em
    const roots = [57, 53, 55, 52]; // MIDI values
    const rootMidi = roots[bar % roots.length];

    for (let beat = 0; beat < 4; beat++) {
      const beatTime = barStart + beat * beatSec;

      // Kick
      const kickOsc = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(120, beatTime);
      kickOsc.frequency.exponentialRampToValueAtTime(50, beatTime + 0.1);
      kickGain.gain.setValueAtTime(0.65, beatTime);
      kickGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.2);
      kickOsc.connect(kickGain);
      kickGain.connect(dest);
      kickOsc.start(beatTime);
      kickOsc.stop(beatTime + 0.25);

      // Hi-hats
      for (let offset = 0.25; offset < 1.0; offset += 0.5) {
        const hatTime = beatTime + offset * beatSec;
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuff;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 7000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.1, hatTime);
        gain.gain.exponentialRampToValueAtTime(0.001, hatTime + 0.05);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(dest);
        noise.start(hatTime);
        noise.stop(hatTime + 0.06);
      }

      // Snare on 2 and 4 (beat indices 1 and 3)
      if (beat === 1 || beat === 3) {
        const snare = ctx.createBufferSource();
        snare.buffer = noiseBuff;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1200;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2, beatTime);
        gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.22);

        snare.connect(filter);
        filter.connect(gain);
        gain.connect(dest);
        snare.start(beatTime);
        snare.stop(beatTime + 0.25);
      }

      // Rolling Bassline (pumping 1/8 notes)
      for (let noteIdx = 0; noteIdx < 2; noteIdx++) {
        const noteTime = beatTime + noteIdx * (beatSec / 2);
        const bassOsc = ctx.createOscillator();
        const bassGain = ctx.createGain();
        
        bassOsc.type = 'sawtooth';
        // alternating octaves
        const currentMidi = rootMidi - 24 + (noteIdx === 1 ? 12 : 0);
        const freq = 440 * Math.pow(2, (currentMidi - 69) / 12);
        bassOsc.frequency.setValueAtTime(freq, noteTime);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, noteTime);
        filter.frequency.exponentialRampToValueAtTime(150, noteTime + 0.15);

        bassGain.gain.setValueAtTime(0.15, noteTime);
        bassGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.16);

        bassOsc.connect(filter);
        filter.connect(bassGain);
        bassGain.connect(dest);
        bassOsc.start(noteTime);
        bassOsc.stop(noteTime + 0.18);
      }
    }

    // Melodic Arpeggio (16th notes of Triangles scale)
    const scaleDegrees = [0, 3, 7, 10, 12, 15, 19, 12, 7, 3, 0, 7, 12, 15, 19, 24];
    for (let i = 0; i < 16; i++) {
      const noteTime = barStart + i * (beatSec / 4);
      const degree = scaleDegrees[i];
      const noteMidi = rootMidi + degree;
      const freq = 440 * Math.pow(2, (noteMidi - 69) / 12);

      const arpOsc = ctx.createOscillator();
      const arpGain = ctx.createGain();
      arpOsc.type = 'triangle';
      arpOsc.frequency.setValueAtTime(freq, noteTime);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, noteTime);
      filter.frequency.exponentialRampToValueAtTime(600, noteTime + 0.08);

      arpGain.gain.setValueAtTime(0.12, noteTime);
      arpGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.1);

      arpOsc.connect(filter);
      filter.connect(arpGain);
      arpGain.connect(dest);
      arpOsc.start(noteTime);
      arpOsc.stop(noteTime + 0.12);
    }
  }

  return await ctx.startRendering();
}
