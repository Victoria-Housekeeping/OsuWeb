const fs = require('fs');

let synth = fs.readFileSync('src/utils/audioSynth.ts', 'utf8');
synth = synth.replace(/duration: durationSec \* 1000/g, 'duration: durationSec * 1000,\n      timingPoints: []');
fs.writeFileSync('src/utils/audioSynth.ts', synth);

