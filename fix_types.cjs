const fs = require('fs');

let typesCode = fs.readFileSync('src/types.ts', 'utf8');
if (!typesCode.includes('interface TimingPoint')) {
  typesCode = typesCode.replace(
    'export interface Beatmap {',
    `export interface TimingPoint {
  time: number;
  beatLength: number; // positive = ms per beat, negative = velocity multiplier
  uninherited: boolean;
}

export interface Beatmap {`
  );
}

if (!typesCode.includes('timingPoints: TimingPoint[]')) {
  typesCode = typesCode.replace(
    '  hitObjects: HitObject[];',
    `  hitObjects: HitObject[];
  timingPoints: TimingPoint[];`
  );
}

fs.writeFileSync('src/types.ts', typesCode);

let parserCode = fs.readFileSync('src/utils/osuParser.ts', 'utf8');
parserCode = parserCode.replace(
  `interface TimingPoint {
  time: number;
  beatLength: number; // positive = ms per beat, negative = velocity multiplier
  uninherited: boolean;
}`,
  ``
);
parserCode = parserCode.replace(
  `import { Beatmap, HitObject } from '../types';`,
  `import { Beatmap, HitObject, TimingPoint } from '../types';`
);

parserCode = parserCode.replace(
  `  return beatmap as Beatmap;`,
  `  beatmap.timingPoints = timingPoints;
  return beatmap as Beatmap;`
);

fs.writeFileSync('src/utils/osuParser.ts', parserCode);
