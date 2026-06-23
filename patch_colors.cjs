const fs = require('fs');
const path = require('path');

// Fix App.tsx
const appPath = path.join(process.cwd(), 'src/App.tsx');
let appCnt = fs.readFileSync(appPath, 'utf8');

// The new Mint Green hair color
const C_HAIR = '#98D2B4'; // minty green/blonde
const C_HAIR_RGB = '152,210,180';

const C_DARK = '#7FB89D'; // darker
const C_FR = '#BDF6D6'; // logo top
const C_TO = '#6AA185'; // logo bottom

appCnt = appCnt.replace(/\{settings\.randomKidMode && \(\s*<style dangerouslySetInnerHTML=\{\{ __html: `[\s\S]*?`\}\} \/>\s*\)\}/g, 
`{settings.randomKidMode && (
        <style dangerouslySetInnerHTML={{ __html: \\\`
          .bg-\\\\\\\\[\\\\\\\\#00E8FF\\\\\\\\] { background-color: \${C_HAIR} !important; }
          .text-\\\\\\\\[\\\\\\\\#00E8FF\\\\\\\\] { color: \${C_HAIR} !important; }
          .border-\\\\\\\\[\\\\\\\\#00E8FF\\\\\\\\] { border-color: \${C_HAIR} !important; }
          .shadow-\\\\\\\\[0_0_10px_rgba\\\\\\\\(0\\\\\\\\,232\\\\\\\\,255\\\\\\\\,0\\\\\\\\.4\\\\\\\\)\\\\\\\\] { box-shadow: 0 0 10px rgba(\${C_HAIR_RGB}, 0.4) !important; }
          .bg-\\\\\\\\[rgba\\\\\\\\(0\\\\\\\\,232\\\\\\\\,255\\\\\\\\,0\\\\\\\\.1\\\\\\\\)\\\\\\\\] { background-color: rgba(\${C_HAIR_RGB}, 0.1) !important; }
          .border-\\\\\\\\[rgba\\\\\\\\(0\\\\\\\\,232\\\\\\\\,255\\\\\\\\,0\\\\\\\\.3\\\\\\\\)\\\\\\\\] { border-color: rgba(\${C_HAIR_RGB}, 0.3) !important; }
          .text-\\\\\\\\[#00CFFF\\\\\\\\] { color: \${C_DARK} !important; }
          .bg-\\\\\\\\[#00E8FF\\\\\\\\]\\\\\\\\/5 { background-color: rgba(\${C_HAIR_RGB}, 0.05) !important; }
          .border-\\\\\\\\[#00E8FF\\\\\\\\]\\\\\\\\/10 { border-color: rgba(\${C_HAIR_RGB}, 0.1) !important; }
          .bg-\\\\\\\\[#00E8FF\\\\\\\\]\\\\\\\\/10 { background-color: rgba(\${C_HAIR_RGB}, 0.1) !important; }
          .bg-\\\\\\\\[#00E8FF\\\\\\\\]\\\\\\\\/25 { background-color: rgba(\${C_HAIR_RGB}, 0.25) !important; }
          .hover\\\\\\\\:text-\\\\\\\\[#00E8FF\\\\\\\\]:hover { color: \${C_HAIR} !important; }
          .focus\\\\\\\\:border-\\\\\\\\[#00E8FF\\\\\\\\]:focus { border-color: \${C_HAIR} !important; }
          .focus\\\\\\\\:ring-\\\\\\\\[#00E8FF\\\\\\\\]\\\\\\\\/20:focus { --tw-ring-color: rgba(\${C_HAIR_RGB}, 0.2); }
          .hover\\\\\\\\:border-\\\\\\\\[#00E8FF\\\\\\\\]\\\\\\\\/40:hover { border-color: rgba(\${C_HAIR_RGB}, 0.4) !important; }

          .from-\\\\\\\\[\\\\\\\\#33EFFF\\\\\\\\] { --tw-gradient-from: \${C_FR} !important; --tw-gradient-to: rgba(207,240,217,0) !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important; }
          .via-\\\\\\\\[\\\\\\\\#00E8FF\\\\\\\\] { --tw-gradient-stops: var(--tw-gradient-from), \${C_HAIR}, var(--tw-gradient-to) !important; }
          .to-\\\\\\\\[\\\\\\\\#0099FF\\\\\\\\] { --tw-gradient-to: \${C_TO} !important; }
        \\\`}} />
      )}`);

fs.writeFileSync(appPath, appCnt);

// Fix BeatmapSelector.tsx
const selPath = path.join(process.cwd(), 'src/components/BeatmapSelector.tsx');
let selCnt = fs.readFileSync(selPath, 'utf8');

selCnt = selCnt.replace(/bg-\\[#ff3399\\]/g, 'bg-[#98D2B4]');
selCnt = selCnt.replace(/shadow-\\[0_0_10px_rgba\\(255\\,51\\,153\\,0\\.4\\)\\]/g, 'shadow-[0_0_10px_rgba(152,210,180,0.4)]');

selCnt = selCnt.replace(/toggleSettingBool\('randomKidMode'\);/g, 
`toggleSettingBool('randomKidMode');\n                       const syncSettings = { ...settings, randomKidMode: !settings.randomKidMode };\n                       localStorage.setItem('osu_settings', JSON.stringify(syncSettings));`);

fs.writeFileSync(selPath, selCnt);

console.log('Patched colors.');
