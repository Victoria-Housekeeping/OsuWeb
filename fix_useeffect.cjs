const fs = require('fs');

let lines = fs.readFileSync('src/components/BeatmapEditor.tsx', 'utf8').split('\n');

const endIdx = lines.findIndex(l => l.includes('return () => { active = false; };'));
const hookCloseIdx = lines.findIndex((l, i) => i > endIdx && l.includes('}, [group, version]);'));

if (endIdx !== -1 && hookCloseIdx !== -1) {
  // Extract those lines
  const extracted = [lines[endIdx], lines[hookCloseIdx]];
  
  // Remove them from their current position
  lines.splice(endIdx, hookCloseIdx - endIdx + 1);

  // Find loadMedia();
  const loadMediaIdx = lines.findIndex(l => l.includes('loadMedia();'));
  if (loadMediaIdx !== -1) {
    // Insert them right after loadMedia();
    lines.splice(loadMediaIdx + 1, 0, ...extracted);
    fs.writeFileSync('src/components/BeatmapEditor.tsx', lines.join('\n'));
    console.log("Fixed successfully.");
  } else {
    console.log("Could not find loadMedia();");
  }
} else {
  console.log("Could not find the end of useEffect.");
}
