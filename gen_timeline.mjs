// Writes film/timeline.json (read by the score) from the beats in film/timeline.js, so picture and sound share one source.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./film/timeline.js', import.meta.url), 'utf8');
const body = src.match(/export const T = (\{[\s\S]*?\n\});/)[1];
const T = Function(`return ${body}`)();
fs.writeFileSync(new URL('./film/timeline.json', import.meta.url), JSON.stringify({duration: T.end, beats: T}, null, 1) + '\n');
console.log('timeline.json', T);
