// Regenerate data/recordings/demo-t20.json: `npm run record -w apps/server [seed]`
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { RECORDINGS_DIR } from '../src/config';
import { generateRecording } from '../src/providers/mock-generator';
import { buildState } from '../src/providers/recording';

const seed = Number(process.argv[2] ?? 20261003);
const rec = generateRecording(seed);
mkdirSync(RECORDINGS_DIR, { recursive: true });
const file = path.join(RECORDINGS_DIR, 'demo-t20.json');
writeFileSync(file, JSON.stringify(rec, null, 1));

const end = buildState(rec, rec.deliveries.length, Date.now());
const fours = rec.deliveries.filter((d) => d.runs === 4).length;
const sixes = rec.deliveries.filter((d) => d.runs === 6).length;
const wickets = rec.deliveries.filter((d) => d.wicket).length;
console.log(`wrote ${file}`);
console.log(`${rec.deliveries.length} balls · ${fours} fours · ${sixes} sixes · ${wickets} wickets`);
console.log(end.innings.map((i) => `${i.battingTeam} ${i.runs}/${i.wickets} (${i.overs})`).join('  |  '));
console.log(end.statusText);
