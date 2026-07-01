const fs = require('fs');
const skinIniText = fs.readFileSync('skin(2).txt', 'utf8');
const customSkinColors = {};
const lines = skinIniText.split(/\r?\n/);
let currentSection = '';

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//')) continue;
  
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    currentSection = trimmed;
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
      hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).padStart(6, '0').toUpperCase();
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
      }
    }
  }
}
console.log(customSkinColors);
