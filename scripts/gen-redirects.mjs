// Usage: node scripts/gen-redirects.mjs   -> writes public/_redirects
import { writeFileSync } from 'node:fs';
import { buildRedirects } from './lib/redirects.mjs';

const out = new URL('../public/_redirects', import.meta.url);
writeFileSync(out, buildRedirects());
console.log('เขียน public/_redirects แล้ว');
