#!/usr/bin/env node
/* Generates the three palette pages from one markup source.
   The output is committed, so serving the site needs no build step —
   run this only after editing src/page.html.
     node build.js                                                   */
const fs = require('fs');
const src = fs.readFileSync('src/page.html', 'utf8');

const PAGES = [
  { file: 'index.html',     palette: 'wellness',  label: 'Modern Wellness',  title: 'Grounded in Strength. Driven by Data.', themeColor: '#FFFFFF' },
  { file: 'heritage.html',  palette: 'heritage',  label: 'Heritage Chalk',   title: 'Grounded in Strength (Heritage Chalk)', themeColor: '#ECEEEE' },
  { file: 'tradition.html', palette: 'tradition', label: 'Warm Tradition',   title: 'Grounded in Strength (Warm Tradition)', themeColor: '#F5EEDA' }
];

const ACCENT = { wellness: '008080', heritage: 'A94442', tradition: '1B6F1B' };

for (const p of PAGES) {
  const others = PAGES.filter(o => o.file !== p.file)
    .map(o => `<a href="${o.file}">${o.label}</a>`).join(' or ');

  const out = src
    .replace(/\{\{PALETTE\}\}/g, p.palette)
    .replace(/\{\{TITLE\}\}/g, p.title)
    .replace(/\{\{THEME_COLOR\}\}/g, p.themeColor)
    .replace(/\{\{PALETTE_LABEL\}\}/g, p.label)
    .replace(/\{\{OTHER_LINKS\}\}/g, others)
    .replace(/stroke='%23008080'/g, `stroke='%23${ACCENT[p.palette]}'`);

  if (/\{\{\w+\}\}/.test(out)) {
    console.error('! unresolved placeholder in ' + p.file + ': ' + out.match(/\{\{\w+\}\}/)[0]);
    process.exit(1);
  }
  fs.writeFileSync(p.file, out);
  console.log('wrote ' + p.file.padEnd(16) + '(' + p.label + ', ' + Math.round(out.length / 1024) + 'KB)');
}
