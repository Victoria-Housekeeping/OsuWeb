const fs = require('fs');

let code = fs.readFileSync('src/components/BeatmapEditor.tsx', 'utf8');

// I'll rewrite BeatmapEditor to a new file completely to make it easier to manage since it's large.
