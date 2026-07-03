// Parser for "yadaintro.ini" files that can be bundled inside a beatmap (.osz)
// to fully customize the pre-game intro sequence when that beatmap is chosen
// as the player's custom intro.
//
// Example yadaintro.ini:
//
// [Video]
// PlayBeforeTap = true
// LoopStart = 0
// LoopEnd = 4000
// PlayAfterTap = true
//
// [Audio]
// StartOffset = 12500
//
// [Text]
// 0 = Willkommen bei meiner Map!
// 2000 = Viel Spaß beim Spielen
// 2000EndAt = 5000
// 5000 = Los geht's...
//
// [Logo]
// AppearAt = 6000
// TitleScreenAt = 7500

export interface IntroTextCue {
  time: number; // ms after tap
  text: string;
  endTime?: number; // ms after tap, optional - when it disappears
}

export interface IntroIniConfig {
  // [Video]
  videoPlayBeforeTap: boolean; // video plays (muted, looping) before the user taps
  videoPlayBeforeTapMode: 'video' | 'gif' | 'same_video'; // 'video' = separate loop video, 'gif' = separate loop gif, 'same_video' = original video looped
  videoLoopStart: number; // ms, loop point start for pre-tap looping video
  videoLoopEnd: number | null; // ms, loop point end for pre-tap looping video
  videoPlayAfterTap: boolean; // video continues playing after tap (with audio)
  videoWaitForLoopEnd: boolean; // wait for loop end after tap before transitioning/jumping

  // [Audio]
  audioStartOffset: number; // ms position in the audio/video to start at after tap

  // [Text]
  textCues: IntroTextCue[];

  // [Logo]
  logoAppearAt: number | null; // ms after tap when the logo/menu logo should appear
  titleScreenAt: number | null; // ms after tap when it should transition to the title/start screen
}

export const DEFAULT_INTRO_INI_CONFIG: IntroIniConfig = {
  videoPlayBeforeTap: false,
  videoPlayBeforeTapMode: 'same_video',
  videoLoopStart: 0,
  videoLoopEnd: null,
  videoPlayAfterTap: true,
  videoWaitForLoopEnd: false,
  audioStartOffset: 0,
  textCues: [],
  logoAppearAt: null,
  titleScreenAt: null,
};

function parseBool(val: string): boolean {
  const v = val.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function parseNum(val: string): number | null {
  const n = parseFloat(val.trim());
  return isNaN(n) ? null : n;
}

/**
 * Parses the textual contents of a yadaintro.ini file into an IntroIniConfig.
 * Unknown sections/keys are ignored. Missing values fall back to defaults.
 */
export function parseIntroIni(text: string): IntroIniConfig {
  const config: IntroIniConfig = {
    ...DEFAULT_INTRO_INI_CONFIG,
    textCues: [],
  };

  const lines = text.split(/\r?\n/);
  let currentSection = '';

  // Collect raw [Text] key/value pairs first so we can match "<time>" with
  // an optional matching "<time>EndAt" key regardless of file ordering.
  const textStarts = new Map<number, string>();
  const textEnds = new Map<number, number>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('//') || line.startsWith('#')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).trim().toLowerCase();
      continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!key) continue;

    switch (currentSection) {
      case 'video': {
        const kLower = key.toLowerCase();
        if (kLower === 'playbeforetap') config.videoPlayBeforeTap = parseBool(value);
        else if (kLower === 'playbeforetapmode') {
          const val = value.trim().toLowerCase();
          if (val === 'video' || val === 'gif' || val === 'same_video') {
            config.videoPlayBeforeTapMode = val as 'video' | 'gif' | 'same_video';
          }
        }
        else if (kLower === 'loopstart') {
          const n = parseNum(value);
          if (n !== null) config.videoLoopStart = n;
        } else if (kLower === 'loopend') {
          config.videoLoopEnd = parseNum(value);
        } else if (kLower === 'playaftertap') config.videoPlayAfterTap = parseBool(value);
        else if (kLower === 'waitforloopend' || kLower === 'loopendwait') config.videoWaitForLoopEnd = parseBool(value);
        break;
      }
      case 'audio': {
        const kLower = key.toLowerCase();
        if (kLower === 'startoffset') {
          const n = parseNum(value);
          if (n !== null) config.audioStartOffset = n;
        }
        break;
      }
      case 'text': {
        // Keys look like "0", "2000", or "2000EndAt" (case-insensitive suffix)
        const endMatch = key.match(/^(\d+(?:\.\d+)?)\s*endat$/i);
        if (endMatch) {
          const t = parseFloat(endMatch[1]);
          const end = parseNum(value);
          if (!isNaN(t) && end !== null) textEnds.set(t, end);
        } else {
          const t = parseFloat(key);
          if (!isNaN(t)) {
            // If a text already exists at this exact time, the later one in the
            // file replaces it (spec: "wird er ersetzt").
            textStarts.set(t, value);
          }
        }
        break;
      }
      case 'logo': {
        const kLower = key.toLowerCase();
        if (kLower === 'appearat') config.logoAppearAt = parseNum(value);
        else if (kLower === 'titlescreenat') config.titleScreenAt = parseNum(value);
        break;
      }
      default:
        break;
    }
  }

  const cues: IntroTextCue[] = Array.from(textStarts.entries())
    .map(([time, cueText]) => ({
      time,
      text: cueText,
      endTime: textEnds.has(time) ? textEnds.get(time) : undefined,
    }))
    .sort((a, b) => a.time - b.time);

  config.textCues = cues;

  return config;
}

export function stringifyIntroIni(config: IntroIniConfig): string {
  const lines: string[] = [];
  
  lines.push('[Video]');
  lines.push(`PlayBeforeTap = ${config.videoPlayBeforeTap}`);
  lines.push(`PlayBeforeTapMode = ${config.videoPlayBeforeTapMode || 'same_video'}`);
  lines.push(`LoopStart = ${Math.round(config.videoLoopStart)}`);
  if (config.videoLoopEnd !== null) {
    lines.push(`LoopEnd = ${Math.round(config.videoLoopEnd)}`);
  }
  lines.push(`PlayAfterTap = ${config.videoPlayAfterTap}`);
  lines.push(`WaitForLoopEnd = ${config.videoWaitForLoopEnd}`);
  lines.push('');
  
  lines.push('[Audio]');
  lines.push(`StartOffset = ${Math.round(config.audioStartOffset)}`);
  lines.push('');
  
  lines.push('[Text]');
  config.textCues.forEach(cue => {
    lines.push(`${Math.round(cue.time)} = ${cue.text}`);
    if (cue.endTime !== undefined) {
      lines.push(`${Math.round(cue.time)}EndAt = ${Math.round(cue.endTime)}`);
    }
  });
  lines.push('');
  
  lines.push('[Logo]');
  if (config.logoAppearAt !== null) {
    lines.push(`AppearAt = ${Math.round(config.logoAppearAt)}`);
  }
  if (config.titleScreenAt !== null) {
    lines.push(`TitleScreenAt = ${Math.round(config.titleScreenAt)}`);
  }
  
  return lines.join('\n');
}

