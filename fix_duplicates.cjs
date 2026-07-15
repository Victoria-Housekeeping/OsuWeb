const fs = require('fs');

let code = fs.readFileSync('src/components/BeatmapEditor.tsx', 'utf8');
const lines = code.split('\n');

// Find all indices of `const renderTimeline = () => {`
const idx = lines.findIndex(l => l.includes('const renderTimeline = () => {'));
if (idx !== -1) {
    const idx2 = lines.findIndex((l, i) => i > idx && l.includes('const renderTimeline = () => {'));
    if (idx2 !== -1) {
        // We have duplicate!
        // We will just do a dirty fix, wait, what if I just restore it from earlier state?
    }
}
