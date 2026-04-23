#!/usr/bin/env node
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

const tests = [
  ['A1 footer single', () => ((html.match(/<footer\b/gi) || []).length === 1) && /<footer[^>]*id="siteFooter"/i.test(html)],
  ['A2 section transition lock', () => /let\s+__sectionTransitionLock\s*=\s*false/.test(html) && /if\(__sectionTransitionLock\)/.test(html) && /__sectionTransitionLock\s*=\s*true/.test(html)],
  ['A3 applyFilters _gridHasCards guard', () => /const\s+_gridHasCards\s*=/.test(html) && /filterSignature\s*===\s*lastAppliedFilterSignature\s*&&\s*_gridHasCards/.test(html)],
  ['A4 duplicate applyFilters cleanup', () => (html.match(/applyFilters\(\);/g) || []).length < 12],
  ['A5 popstate single-call applySectionState', () => {
    const m = html.match(/window\.addEventListener\('popstate',[\s\S]*?\n\}\);/);
    if(!m) return false;
    return (m[0].match(/applySectionState\(/g) || []).length === 1;
  }],
  ['A6 hashchange queueMicrotask reset', () => /window\.addEventListener\('hashchange',[\s\S]*?queueMicrotask\(\(\)=>\{\s*suppressNextHashChange\s*=\s*false;\s*\}\)/.test(html)],
  ['A7 pagehide fix', () => /window\.addEventListener\('pagehide'/.test(html)],
  ['A8 pageshow fix', () => /window\.addEventListener\('pageshow'/.test(html)],
  ['A9 product observer leak fix', () => /if\(__productObserver\)\{[^\n]*disconnect\(\)/.test(html)],
  ['A10 GitHub fallback removed', () => !/github/i.test(html)],
  ['A11 chunked render FIRST_PAINT 24', () => /const\s+FIRST_PAINT\s*=\s*24;/.test(html)],
  ['A12 initial loading dynamic', () => /products-loading/.test(html) && /loadProducts\(/.test(html)],
  ['A13 loadProducts dedupe 1500ms', () => /1500/.test(html) && /loadProducts\(/.test(html)],
  ['A14 global error logger', () => /window\.addEventListener\('error'/.test(html) && /window\.addEventListener\('unhandledrejection'/.test(html)],
  ['CTA premium css', () => /\.floating-cta\s*\{[\s\S]*bottom:calc\(var\(--mobile-nav-offset, 0px\) \+ env\(safe-area-inset-bottom\) \+ 88px\);/.test(html)],
  ['CTA tooltip span css', () => /\.floating-cta a span\s*\{/.test(html) && /opacity:0/.test(html)],
  ['CTA live button exists', () => /class="cta-live"/.test(html) && /Canlı Destek/.test(html)],
  ['CTA labels preserved', () => /<span>Hızlı Teklif<\/span>/.test(html) && /<span>Hemen Ara<\/span>/.test(html) && /<span>Canlı Destek<\/span>/.test(html)],
];

let pass = 0;
for (const [name, fn] of tests) {
  let ok = false;
  try { ok = !!fn(); } catch (_) { ok = false; }
  if (ok) pass += 1;
  console.log(`${ok ? '✔' : '✖'} ${name}`);
}
console.log(`\n${pass}/${tests.length} ✔`);
process.exit(pass === tests.length ? 0 : 1);
