const fs = require('fs');
const path = require('path');

const srcDir = path.join(process.cwd(), 'src', 'components');
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.tsx'));

files.forEach(f => {
  const filePath = path.join(srcDir, f);
  let cnt = fs.readFileSync(filePath, 'utf8');

  // Replace colors globally
  cnt = cnt.replace(/#00DDFF/gi, '#00E5CC');
  cnt = cnt.replace(/rgba\(0, ?221, ?255/g, 'rgba(0,229,204');
  cnt = cnt.replace(/rgb\(0, ?221, ?255\)/g, 'rgb(0,229,204)');
  cnt = cnt.replace(/#00BBFF/gi, '#00C2B0');
  cnt = cnt.replace(/#44EEFF/gi, '#33FFDD');

  if (f === 'IntroAndStartScreen.tsx') {
    cnt = cnt.replace(/welcome to osu!/g, 'welcome to Yada!');
    cnt = cnt.replace(/>\s*osu!\s*<\/div>/g, '>Yada!</div>');
    cnt = cnt.replace(/#ff8ebb/gi, '#33FFDD');
    cnt = cnt.replace(/#cc2277/gi, '#00A396');
  }

  fs.writeFileSync(filePath, cnt);
  console.log(`Updated ${f}`);
});
