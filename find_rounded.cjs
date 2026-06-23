const fs = require('fs');
const path = require('path');

const srcDir = path.join(process.cwd(), 'src', 'components');
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.tsx'));

const roundedClasses = new Set();
files.forEach(f => {
  const filePath = path.join(srcDir, f);
  const cnt = fs.readFileSync(filePath, 'utf8');
  const matches = cnt.match(/rounded-[a-zA-Z0-9-]+/g) || [];
  matches.forEach(m => roundedClasses.add(m));
});

console.log(Array.from(roundedClasses).join('\n'));
