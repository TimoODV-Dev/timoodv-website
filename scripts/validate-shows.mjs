// `npm run validate:shows` — exits non-zero if src/content/shows.json (or the declined list) has any bad entry.
import { readFile } from 'node:fs/promises';
import { cleanShows, cleanDeclined } from './shows.mjs';
const read = async (f) => JSON.parse(await readFile(new URL(`../src/content/${f}`, import.meta.url), 'utf8'));
let problems = [];
try { problems.push(...cleanShows(await read('shows.json')).problems); } catch (e) { problems.push('shows.json is not valid JSON: ' + e.message); }
try { problems.push(...cleanDeclined(await read('shows.declined.json')).problems); } catch (e) { problems.push('shows.declined.json is not valid JSON: ' + e.message); }
if (problems.length) { console.error('shows validation FAILED:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('shows validation OK');
