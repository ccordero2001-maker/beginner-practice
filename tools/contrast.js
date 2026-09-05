/* Validates every text/background pairing in css/palettes.css.
   Run: node tools-contrast.js   */
const fs = require('fs');
const css = fs.readFileSync('css/palettes.css', 'utf8');

const hex = h => { h = h.replace('#',''); if (h.length===3) h = h.split('').map(c=>c+c).join('');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) }; };
const lin = v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
const lum = c => 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b);
const ratio = (a,b) => { const l1=lum(hex(a)), l2=lum(hex(b)); const hi=Math.max(l1,l2), lo=Math.min(l1,l2); return (hi+0.05)/(lo+0.05); };

const blocks = {};
css.replace(/\[data-palette="(\w+)"\](\[data-theme="dark"\])?\s*\{([^}]*)\}/g, (_, pal, dark, body) => {
  const key = pal + (dark ? '/dark' : '/light');
  const t = {};
  body.replace(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{3,6})/g, (_, k, v) => { t[k] = v; });
  blocks[key] = t;
});

// what must pass, and against which ground
const CHECKS = [
  ['--fg','--bg',4.5], ['--fg-body','--bg',4.5], ['--fg-muted','--bg',4.5], ['--fg-subtle','--bg',4.5],
  ['--fg','--bg-elev',4.5], ['--fg-body','--bg-elev',4.5], ['--fg-muted','--bg-elev',4.5], ['--fg-subtle','--bg-elev',4.5],
  ['--fg-body','--bg-sunken',4.5], ['--fg-muted','--bg-sunken',4.5], ['--fg-subtle','--bg-sunken',4.5],
  ['--accent','--bg',4.5], ['--accent','--bg-elev',4.5], ['--accent','--bg-sunken',4.5],
  ['--accent-ink','--accent',4.5],
  ['--accent-2-ink','--bg',4.5], ['--accent-2-ink','--bg-elev',4.5], ['--accent-2-ink','--bg-sunken',4.5],
  ['--accent-3','--bg',4.5], ['--accent-3','--bg-elev',4.5], ['--accent-3','--bg-sunken',4.5],

];

/* --accent-2 is the source palette's soft colour. On light grounds sage (#9DC183)
   and burnished gold (#C5B358) cannot reach 3:1, so in these combinations they are
   DECORATIVE FILL ONLY — never a border, icon, or text. styles.css uses
   --accent-2-ink wherever that colour has to carry meaning. Encoded here so the
   rule is enforced rather than remembered. */
const DECORATIVE_ONLY = new Set(['wellness/light', 'tradition/light']);

let fails = 0, checked = 0, notes = [];
for (const [name, t] of Object.entries(blocks)) {
  const merged = name.endsWith('/dark') ? { ...blocks[name.split('/')[0]+'/light'], ...t } : t;
  const bad = [];
  if (!DECORATIVE_ONLY.has(name)) CHECKS.push(['--accent-2', '--bg-elev', 3.0]);
  else notes.push(`   note ${name}: --accent-2 (${merged['--accent-2']}) is fill-only here; --accent-2-ink carries meaning.`);
  for (const [fg, bg, need] of CHECKS) {
    if (!merged[fg] || !merged[bg]) continue;
    checked++;
    const r = ratio(merged[fg], merged[bg]);
    if (r < need) { bad.push(`   FAIL ${fg} (${merged[fg]}) on ${bg} (${merged[bg]}) = ${r.toFixed(2)} < ${need}`); fails++; }
  }
  console.log((bad.length ? 'x ' : 'ok ') + name + (bad.length ? '\n' + bad.join('\n') : ''));
  if (!DECORATIVE_ONLY.has(name)) CHECKS.pop();
}
if (notes.length) console.log(notes.join('\n'));
console.log(`\n${checked} pairings checked, ${fails} failing.`);
process.exit(fails ? 1 : 0);
