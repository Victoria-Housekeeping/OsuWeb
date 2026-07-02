import JSZip from 'jszip';
import { Beatmap, HitObject } from '../types';

export async function checkAndParseSkin(file: File): Promise<{ isSkin: boolean; skinName?: string; customSkinColors?: any; customSkinImages?: any } | null> {
  try {
    const zip = new JSZip();
    const contents = await zip.loadAsync(file);
    const skinIniName = Object.keys(contents.files).find(path => path.toLowerCase().endsWith('skin.ini'));
    const hasPngs = Object.keys(contents.files).some(path => path.toLowerCase().endsWith('.png'));
    
    if (!skinIniName && !hasPngs) return { isSkin: false };

    let customSkinColors: any = {};
    if (skinIniName) {
      const skinIniText = await contents.files[skinIniName].async('string');
      // Parse basic colors from skin.ini
      const lines = skinIniText.split(/\r?\n/);
    let currentSection = '';
    let currentManiaKeys = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed;
        if (currentSection === '[Mania]') {
           currentManiaKeys = 0; // reset until we see Keys:
        }
        continue;
      }
      
      const [key, ...vals] = trimmed.split(':');
      if (key && vals.length > 0) {
        const val = vals.join(':').trim();
        const rgbMatch = val.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        let hex = '';
        if (rgbMatch) {
          const r = parseInt(rgbMatch[1]);
          const g = parseInt(rgbMatch[2]);
          const b = parseInt(rgbMatch[3]);
          hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
        }
        
        const kLower = key.trim().toLowerCase();
        
        if (currentSection === '[Colours]') {
          if (hex) {
            if (kLower.startsWith('combo')) {
              const numMatch = kLower.match(/combo(\d+)/);
              if (numMatch) {
                if (!customSkinColors.comboColors) customSkinColors.comboColors = [];
                const idx = parseInt(numMatch[1], 10) - 1;
                customSkinColors.comboColors[idx] = hex;
              }
            }
            if (kLower === 'slidertrackoverride') customSkinColors.sliderTrackColor = hex;
            if (kLower === 'sliderborder') customSkinColors.sliderBorderColor = hex;
            if (kLower === 'spinnerapproachcircle') customSkinColors.spinnerColor = hex;
          }
        } else if (currentSection === '[Fonts]') {
          if (!customSkinColors.fonts) customSkinColors.fonts = {};
          if (kLower === 'hitcircleprefix') customSkinColors.fonts.hitCirclePrefix = val.trim();
          if (kLower === 'scoreprefix') customSkinColors.fonts.scorePrefix = val.trim();
          if (kLower === 'comboprefix') customSkinColors.fonts.comboPrefix = val.trim();
        } else if (currentSection === '[Mania]') {
          if (!customSkinColors.mania) customSkinColors.mania = {};
          
          if (kLower === 'keys') {
            currentManiaKeys = parseInt(val, 10);
            if (!customSkinColors.mania[currentManiaKeys]) {
              customSkinColors.mania[currentManiaKeys] = { colors: {}, images: {} };
            }
          } else if (currentManiaKeys > 0) {
            if (hex && kLower.startsWith('colour')) {
              customSkinColors.mania[currentManiaKeys].colors[kLower] = hex;
            } else if (kLower.startsWith('keyimage') || kLower.startsWith('noteimage')) {
              customSkinColors.mania[currentManiaKeys].images[kLower] = val.trim();
            }
          }
        }
      }
    }
    }
    
    if (customSkinColors.comboColors) {
      customSkinColors.comboColors = customSkinColors.comboColors.filter((c: string | undefined) => c !== undefined);
    }

    // Attempt to extract name from filename
    let skinName = file.name.replace(/\.zip|\.osk/i, '');

    // Extract skin images
    const customSkinImages: any = {};
    const imageNamesToFind = [
      'cursor', 'hitcircle', 'hitcircleoverlay', 'approachcircle', 'sliderb', 'sliderfollowcircle',
      'sliderendcircle', 'sliderendcircleoverlay',
      'reversearrow', 'hit0', 'hit50', 'hit100', 'hit300', 'hit100k', 'hit300k', 'hit300g',
      'spinner-approachcircle', 'spinner-background', 'spinner-circle', 'spinner-metre', 'spinner-osu', 'spinner-clear', 'spinner-spin',
      'scorebar-bg', 'scorebar-colour', 'scorebar-marker',
      'pause-overlay', 'pause-continue', 'pause-retry', 'pause-back',
      'selection-mode', 'selection-mode-over', 'menu-button-background'
    ];

    // Determine the prefixes, default to 'default', 'score', 'combo'
    const hitCirclePrefix = customSkinColors.fonts?.hitCirclePrefix || 'default';
    const scorePrefix = customSkinColors.fonts?.scorePrefix || 'score';
    const comboPrefix = customSkinColors.fonts?.comboPrefix || 'combo';

    // We still want to map them to 'default-0', 'score-0' etc in the customSkinImages object
    // so the rest of the game can find them using a predictable key.
    const prefixMappings = [
      { prefix: hitCirclePrefix, internalName: 'default' },
      { prefix: scorePrefix, internalName: 'score' },
      { prefix: comboPrefix, internalName: 'combo' }
    ];

    for (const mapping of prefixMappings) {
      // Map 0-9
      for (let i = 0; i <= 9; i++) {
        // the actual file name without extension
        const targetName = `${mapping.prefix}-${i}`;
        // we'll store it as 'default-0Url', 'score-0Url'
        const internalKey = `${mapping.internalName}-${i}Url`;
        
        let imgPath = Object.keys(contents.files).find(path => path.toLowerCase().endsWith(`${targetName.toLowerCase()}@2x.png`));
        if (!imgPath) {
          imgPath = Object.keys(contents.files).find(path => path.toLowerCase().endsWith(`${targetName.toLowerCase()}.png`));
        }
        if (imgPath) {
          const imgData = await contents.files[imgPath].async('base64');
          customSkinImages[internalKey] = `data:image/png;base64,${imgData}`;
        }
      }
      
      // Map symbols (comma, dot, percent, x)
      const symbols = ['comma', 'dot', 'percent', 'x'];
      for (const sym of symbols) {
        const targetName = `${mapping.prefix}-${sym}`;
        const internalKey = `${mapping.internalName}-${sym}Url`;
        
        let imgPath = Object.keys(contents.files).find(path => path.toLowerCase().endsWith(`${targetName.toLowerCase()}@2x.png`));
        if (!imgPath) {
          imgPath = Object.keys(contents.files).find(path => path.toLowerCase().endsWith(`${targetName.toLowerCase()}.png`));
        }
        if (imgPath) {
          const imgData = await contents.files[imgPath].async('base64');
          customSkinImages[internalKey] = `data:image/png;base64,${imgData}`;
        }
      }
    }
    
    // Add referenced mania images to the list to find
    if (customSkinColors.mania) {
      for (const keys of Object.keys(customSkinColors.mania)) {
        const images = customSkinColors.mania[parseInt(keys)].images;
        for (const val of Object.values(images)) {
           if (typeof val === 'string') {
             const cleaned = val.replace('.png', '').toLowerCase();
             if (!imageNamesToFind.includes(cleaned)) {
                 imageNamesToFind.push(cleaned);
             }
           }
        }
      }
    }

    for (const imgName of imageNamesToFind) {
      // Try to find animated frame 0 first (@2x then normal), then fallback to base image
      let imgPath = Object.keys(contents.files).find(path => path.toLowerCase().endsWith(`${imgName}-0@2x.png`));
      if (!imgPath) {
        imgPath = Object.keys(contents.files).find(path => path.toLowerCase().endsWith(`${imgName}-0.png`));
      }
      if (!imgPath) {
        imgPath = Object.keys(contents.files).find(path => path.toLowerCase().endsWith(`${imgName}@2x.png`));
      }
      if (!imgPath) {
        imgPath = Object.keys(contents.files).find(path => path.toLowerCase().endsWith(`${imgName}.png`));
      }
      
      if (imgPath) {
        const imgData = await contents.files[imgPath].async('base64');
        customSkinImages[`${imgName}Url`] = `data:image/png;base64,${imgData}`;
      }
    }
    
    // Also load all mania-related images dynamically by scanning the zip for any .png
    // so we don't miss user's custom mania keys and notes
    for (const path of Object.keys(contents.files)) {
       if (path.toLowerCase().endsWith('.png') && path.toLowerCase().includes('mania')) {
           const imgName = path.split('/').pop()?.replace('@2x.png', '').replace('.png', '').toLowerCase();
           if (imgName && !customSkinImages[`${imgName}Url`]) {
               const imgData = await contents.files[path].async('base64');
               customSkinImages[`${imgName}Url`] = `data:image/png;base64,${imgData}`;
           }
       }
    }

    return { isSkin: true, skinName, customSkinColors, customSkinImages };
  } catch (err) {
    return null;
  }
}

interface TimingPoint {
  time: number;
  beatLength: number; // positive = ms per beat, negative = velocity multiplier
  uninherited: boolean;
}

export async function extractFileFromOsz(oszBlob: Blob, filename: string): Promise<Blob | null> {
  const zip = new JSZip();
  const contents = await zip.loadAsync(oszBlob);
  const key = findFileInZip(contents, filename);
  if (!key) return null;
  return await contents.files[key].async('blob');
}

export async function parseOszFile(file: File): Promise<Beatmap[]> {
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);
  
  // Find all .osu files
  const osuFilePaths = Object.keys(contents.files).filter(path => path.endsWith('.osu'));
  
  if (osuFilePaths.length === 0) {
    throw new Error('Keine .osu-Dateien in der .osz-Datei gefunden.');
  }

  const beatmaps: Beatmap[] = [];

  // Parse each .osu file
  for (const osuPath of osuFilePaths) {
    try {
      const osuText = await contents.files[osuPath].async('string');
      const beatmap = await parseOsuText(osuText);
      
      // Hook up audio file
      if (beatmap.audioFilename) {
        // Look for audio file in zip, case-insensitive
        const audioKey = findFileInZip(contents, beatmap.audioFilename);
        if (audioKey) {
          beatmap.audioFilename = audioKey; // Just save the exact key, don't extract the blob yet
        }
      }

      // Hook up background image
      if (beatmap.bgFilename) {
        const bgKey = findFileInZip(contents, beatmap.bgFilename);
        if (bgKey) {
          const bgBlob = await contents.files[bgKey].async('blob');
          beatmap.bgBlob = bgBlob;
          beatmap.bgUrl = URL.createObjectURL(bgBlob);
        }
      }

      // Hook up video file (Only store filename, don't extract blob yet to save memory)
      if (beatmap.videoFilename) {
        const videoKey = findFileInZip(contents, beatmap.videoFilename);
        if (videoKey) {
          beatmap.videoFilename = videoKey;
        }
      } else {
        // Fallback: search for any .mp4 or .webm or similar video file in the zip if we didn't resolve one
        const videoKeys = Object.keys(contents.files).filter(k => {
          const lower = k.toLowerCase();
          return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.avi');
        });
        if (videoKeys.length > 0) {
          beatmap.videoFilename = videoKeys[0];
        }
      }

      // Add a unique ID
      beatmap.id = `${file.name}-${beatmap.version}-${Math.random().toString(36).substr(2, 9)}`;
      beatmaps.push(beatmap);
    } catch (err) {
      console.error(`Fehler beim Parsen der Beatmap ${osuPath}:`, err);
    }
  }

  if (beatmaps.length === 0) {
    throw new Error('Keine der .osu-Dateien im Archiv konnte erfolgreich parsiert werden.');
  }

  return beatmaps;
}

function findFileInZip(zip: JSZip, filename: string): string | null {
  const normalizedFilename = filename.trim().toLowerCase().replace(/\\/g, '/');
  
  // Search exact match or relative
  for (const key of Object.keys(zip.files)) {
    const normalizedKey = key.toLowerCase().replace(/\\/g, '/');
    if (normalizedKey === normalizedFilename || normalizedKey.endsWith('/' + normalizedFilename)) {
      return key;
    }
  }
  return null;
}

export async function parseOsuText(text: string): Promise<Beatmap> {
  const lines = text.split(/\r?\n/);
  
  const beatmap: Partial<Beatmap> = {
    title: 'Unbekannt',
    artist: 'Unbekannt',
    creator: 'Unbekannt',
    version: 'Normal',
    audioFilename: '',
    bgFilename: '',
    hpDrain: 5,
    circleSize: 5,
    overallDifficulty: 5,
    approachRate: 5,
    sliderMultiplier: 1.4,
    sliderTickRate: 1,
    hitObjects: [],
    duration: 0
  };

  let currentSection = '';
  const timingPoints: TimingPoint[] = [];

  // Pass 1: Parse variables
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('//')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line;
      continue;
    }

    const colonIndex = line.indexOf(':');
    const key = colonIndex !== -1 ? line.substring(0, colonIndex).trim() : '';
    const value = colonIndex !== -1 ? line.substring(colonIndex + 1).trim() : '';

    if (currentSection === '[General]') {
      if (key === 'AudioFilename') beatmap.audioFilename = value;
    } else if (currentSection === '[Metadata]') {
      if (key === 'Title') beatmap.title = value;
      if (key === 'TitleUnicode') beatmap.titleUnicode = value;
      if (key === 'Artist') beatmap.artist = value;
      if (key === 'ArtistUnicode') beatmap.artistUnicode = value;
      if (key === 'Creator') beatmap.creator = value;
      if (key === 'Version') beatmap.version = value;
    } else if (currentSection === '[Difficulty]') {
      if (key === 'HPDrainRate') beatmap.hpDrain = parseFloat(value);
      if (key === 'CircleSize') beatmap.circleSize = parseFloat(value);
      if (key === 'OverallDifficulty') beatmap.overallDifficulty = parseFloat(value);
      if (key === 'ApproachRate') beatmap.approachRate = parseFloat(value);
      if (key === 'SliderMultiplier') beatmap.sliderMultiplier = parseFloat(value);
      if (key === 'SliderTickRate') beatmap.sliderTickRate = parseFloat(value);
    } else if (currentSection === '[Events]') {
      // Background is usually defined as:
      // 0,0,"bg.jpg",0,0
      // or: 3,0,"bg.jpg"
      // or similar
      const parts = line.split(',');
      if (parts[0] === '0' && parts[1] === '0') {
        let bgStr = parts[2];
        if (bgStr && bgStr.startsWith('"') && bgStr.endsWith('"')) {
          bgStr = bgStr.substring(1, bgStr.length - 1);
        }
        beatmap.bgFilename = bgStr;
      } else if (parts[0] === 'Video' || parts[0] === '1') {
        // Videos are typically: Video, offset, "video.mp4" or 1, offset, "video.mp4"
        let videoStr = parts[2] || parts[1];
        if (videoStr && videoStr.startsWith('"') && videoStr.endsWith('"')) {
          videoStr = videoStr.substring(1, videoStr.length - 1);
        }
        if (videoStr) {
          const lower = videoStr.toLowerCase();
          if (lower.endsWith('.mp4') || lower.endsWith('.avi') || lower.endsWith('.flv') || lower.endsWith('.webm') || lower.endsWith('.mkv') || lower.endsWith('.mov')) {
            beatmap.videoFilename = videoStr;
          }
        }
      }
    } else if (currentSection === '[Colours]') {
      if (key.trim().toLowerCase().startsWith('combo')) {
        const rgbMatch = value.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (rgbMatch) {
          const r = parseInt(rgbMatch[1]);
          const g = parseInt(rgbMatch[2]);
          const b = parseInt(rgbMatch[3]);
          const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).padStart(6, '0').toUpperCase();
          if (!beatmap.colors) beatmap.colors = [];
          beatmap.colors.push(hex);
        }
      }
    } else if (currentSection === '[TimingPoints]') {
      const parts = line.split(',');
      if (parts.length >= 2) {
        const time = parseFloat(parts[0]);
        const beatLength = parseFloat(parts[1]);
        const uninherited = parts.length < 7 || parts[6] === '1';
        timingPoints.push({ time, beatLength, uninherited });
      }
    }
  }

  // Pass 2: Parse hit objects
  currentSection = '';
  let comboIndex = 1;
  let comboSet = 0;
  const hitObjects: HitObject[] = [];

  // Sort timing points by time
  timingPoints.sort((a, b) => a.time - b.time);

  // Helper to find parent beat length and slider velocity multiplier
  const getBeatInfoAtTime = (time: number) => {
    let currentBeatLength = 600; // default 100bpm
    let velocityMultiplier = 1.0;
    
    for (const tp of timingPoints) {
      if (tp.time > time) break;
      if (tp.uninherited) {
        currentBeatLength = tp.beatLength;
        velocityMultiplier = 1.0;
      } else {
        // Negative beat length means negative percentage (e.g. -100 = 100% speed, -50 = 200% speed)
        velocityMultiplier = Math.max(0.1, 100 / Math.abs(tp.beatLength));
      }
    }
    
    return { currentBeatLength, velocityMultiplier };
  };

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('//')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line;
      continue;
    }

    if (currentSection === '[HitObjects]') {
      const parts = line.split(',');
      if (parts.length < 5) continue;

      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);
      const time = parseFloat(parts[2]);
      const typeByte = parseInt(parts[3], 10);
      const hitSound = parseInt(parts[4], 10);

      const isCircle = (typeByte & 1) !== 0;
      const isSlider = (typeByte & 2) !== 0;
      const isSpinner = (typeByte & 8) !== 0;
      const isHold = (typeByte & 128) !== 0;
      const isNewCombo = (typeByte & 4) !== 0;

      if (isNewCombo) {
        comboIndex = 1;
        comboSet = (comboSet + 1) % 4; // Cycle through 4 combo colors
      }

      const id = `${time}-${x}-${y}`;

      if (isCircle) {
        hitObjects.push({
          id,
          x,
          y,
          time,
          type: 'circle',
          comboIndex: comboIndex++,
          comboSet
        });
      } else if (isHold && parts.length >= 6) {
        // Mania Hold Note: x,y,time,type,hitSound,endTime:hitSample
        const endTimeStr = parts[5].split(':')[0];
        const endTime = parseFloat(endTimeStr);
        hitObjects.push({
          id,
          x,
          y,
          time,
          endTime,
          type: 'slider', // Treat hold note as a slider for internal typing simplicity
          duration: endTime - time,
          comboIndex: comboIndex++,
          comboSet
        });
      } else if (isSlider && parts.length >= 8) {
        // Slider format:
        // x,y,time,type,hitSound, curveType|curvePoints, slides, length, edgeSounds, edgeSets, hitSample
        const sliderTypeAndPoints = parts[5].split('|');
        const curveType = sliderTypeAndPoints[0];
        
        // Parse slider control points
        const pointsList = [{ x, y }];
        for (let i = 1; i < sliderTypeAndPoints.length; i++) {
          const pt = sliderTypeAndPoints[i].split(':');
          if (pt.length === 2) {
            pointsList.push({
              x: parseFloat(pt[0]),
              y: parseFloat(pt[1])
            });
          }
        }

        const slides = parseInt(parts[6], 10) || 1;
        const length = parseFloat(parts[7]) || 100;

        // Calculate slider duration
        const { currentBeatLength, velocityMultiplier } = getBeatInfoAtTime(time);
        
        // Duration in ms = (length / (SliderMultiplier * 100 * velocityMultiplier)) * BeatLength * slides
        const speed = (beatmap.sliderMultiplier || 1.4) * 100 * velocityMultiplier;
        const baseDuration = (length / speed) * currentBeatLength;
        const totalDuration = baseDuration * slides;
        const endTime = time + totalDuration;

        hitObjects.push({
          id,
          x,
          y,
          time,
          endTime,
          type: 'slider',
          sliderPoints: generateSliderPath(curveType, pointsList, length),
          slides,
          duration: totalDuration,
          comboIndex: comboIndex++,
          comboSet
        });
      } else if (isSpinner && parts.length >= 6) {
        // Spinner format:
        // x,y,time,type,hitSound,endTime,hitSample
        const endTime = parseFloat(parts[5]);
        hitObjects.push({
          id,
          x,
          y,
          time,
          endTime,
          type: 'spinner',
          duration: endTime - time,
          comboIndex: comboIndex++,
          comboSet
        });
      }
    }
  }

  // Sort objects by hit time
  hitObjects.sort((a, b) => a.time - b.time);
  beatmap.hitObjects = hitObjects;

  if (hitObjects.length > 0) {
    beatmap.duration = hitObjects[hitObjects.length - 1].endTime || hitObjects[hitObjects.length - 1].time;
  }

  return beatmap as Beatmap;
}

export function generateSliderPath(
  curveType: string,
  controlPoints: { x: number; y: number }[],
  length: number
): { x: number; y: number }[] {
  if (controlPoints.length < 2) return controlPoints;
  
  let rawPath: { x: number; y: number }[] = [];
  
  if (curveType === 'P' && controlPoints.length === 3) {
    const circlePath = sampleCircle(controlPoints[0], controlPoints[1], controlPoints[2]);
    if (circlePath) {
      rawPath = circlePath;
    } else {
      rawPath = sampleBezier(controlPoints);
    }
  } else if (curveType === 'B') {
    rawPath = sampleBezier(controlPoints);
  } else {
    rawPath = sampleLinear(controlPoints);
  }
  
  return trimPath(rawPath, length);
}

function sampleBezier(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const segments: { x: number; y: number }[][] = [];
  let currentSegment: { x: number; y: number }[] = [points[0]];
  
  for (let i = 1; i < points.length; i++) {
    if (points[i].x === points[i - 1].x && points[i].y === points[i - 1].y) {
      if (currentSegment.length > 1) {
        segments.push(currentSegment);
      }
      currentSegment = [points[i]];
    } else {
      currentSegment.push(points[i]);
    }
  }
  if (currentSegment.length > 1) {
    segments.push(currentSegment);
  }
  
  if (segments.length === 0) return points;
  
  let combined: { x: number; y: number }[] = [];
  for (let s = 0; s < segments.length; s++) {
    const segmentPoints = sampleBezierSegment(segments[s]);
    if (s === 0) {
      combined = segmentPoints;
    } else {
      combined.push(...segmentPoints.slice(1));
    }
  }
  return combined;
}

function sampleBezierSegment(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 2) return points;
  if (points.length === 2) {
    return [points[0], points[1]];
  }
  
  const sampled: { x: number; y: number }[] = [];
  const steps = 30; // smooth enough
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    sampled.push(deCasteljau(points, t));
  }
  return sampled;
}

function deCasteljau(points: { x: number; y: number }[], t: number): { x: number; y: number } {
  let temp = [...points];
  const n = temp.length;
  for (let step = 1; step < n; step++) {
    for (let i = 0; i < n - step; i++) {
      temp[i] = {
        x: (1 - t) * temp[i].x + t * temp[i + 1].x,
        y: (1 - t) * temp[i].y + t * temp[i + 1].y
      };
    }
  }
  return temp[0];
}

function sampleCircle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): { x: number; y: number }[] | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 0.0001) return null;
  
  const ux = ((a.x * a.x + a.y * a.y) * (b.y - c.y) + (b.x * b.x + b.y * b.y) * (c.y - a.y) + (c.x * c.x + c.y * c.y) * (a.y - b.y)) / d;
  const uy = ((a.x * a.x + a.y * a.y) * (c.x - b.x) + (b.x * b.x + b.y * b.y) * (a.x - c.x) + (c.x * c.x + c.y * c.y) * (b.x - a.x)) / d;
  const center = { x: ux, y: uy };
  const radius = Math.sqrt((a.x - ux) ** 2 + (a.y - uy) ** 2);
  
  const angleA = Math.atan2(a.y - center.y, a.x - center.x);
  const angleB = Math.atan2(b.y - center.y, b.x - center.x);
  const angleC = Math.atan2(c.y - center.y, c.x - center.x);
  
  let diffAB = angleB - angleA;
  let diffBC = angleC - angleB;
  
  while (diffAB < -Math.PI) diffAB += Math.PI * 2;
  while (diffAB > Math.PI) diffAB -= Math.PI * 2;
  while (diffBC < -Math.PI) diffBC += Math.PI * 2;
  while (diffBC > Math.PI) diffBC -= Math.PI * 2;
  
  if (Math.sign(diffAB) !== Math.sign(diffBC)) {
    return null;
  }
  
  const totalSweep = diffAB + diffBC;
  if (Math.abs(totalSweep) >= Math.PI * 2) return null;
  
  const steps = 40;
  const sampled: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = angleA + t * totalSweep;
    sampled.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    });
  }
  return sampled;
}

function sampleLinear(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const sampled: { x: number; y: number }[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist <= 1) {
      sampled.push(p2);
      continue;
    }
    
    const steps = Math.max(2, Math.ceil(dist / 5));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      sampled.push({
        x: p1.x + dx * t,
        y: p1.y + dy * t
      });
    }
  }
  return sampled;
}

function trimPath(points: { x: number; y: number }[], targetLength: number): { x: number; y: number }[] {
  if (points.length < 2) return points;
  const trimmed: { x: number; y: number }[] = [points[0]];
  let currentLength = 0;
  
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist === 0) continue;
    
    if (currentLength + dist >= targetLength) {
      const remaining = targetLength - currentLength;
      const ratio = remaining / dist;
      trimmed.push({
        x: p1.x + dx * ratio,
        y: p1.y + dy * ratio
      });
      break;
    }
    
    trimmed.push(p2);
    currentLength += dist;
  }
  return trimmed;
}
