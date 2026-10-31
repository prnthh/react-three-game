// Original, deterministic vector textures. Regenerate with node scripts/generate-fps-surfaces.mjs.
import { mkdirSync, writeFileSync } from 'node:fs';
const root = new URL('../docs/public/textures/fps/', import.meta.url);
mkdirSync(root, { recursive: true });
let seed = 17;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const save = (name, body) => writeFileSync(new URL(name + '.svg', root), `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${body}</svg>`);
const grain = (n, opacity) => Array.from({length:n}, () => `<circle cx="${(random()*512).toFixed(1)}" cy="${(random()*512).toFixed(1)}" r="${(.3+random()*1.4).toFixed(1)}" fill="${random()>.5?'#fff':'#171b1b'}" opacity="${opacity}"/>`).join('');
save('concrete', `<rect width="512" height="512" fill="#c1beb4"/>${grain(2200,.16)}<path d="M0 256H512M256 0V512" stroke="#77796f" stroke-width="3" opacity=".3"/><path d="M0 259H512M259 0V512" stroke="#e7e1d2" opacity=".35"/>`);
save('asphalt', `<rect width="512" height="512" fill="#707470"/>${grain(3500,.3)}`);
let ribs='';for(let x=0;x<512;x+=32)ribs+=`<path d="M${x} 0V512" stroke="#262e30" stroke-width="6" opacity=".32"/><path d="M${x+5} 0V512" stroke="#e6e8df" stroke-width="3" opacity=".4"/>`;
save('metal', `<rect width="512" height="512" fill="#b3bab7"/>${ribs}${grain(1200,.13)}<path d="M0 8H512M0 504H512" stroke="#303d3e" stroke-width="4" opacity=".4"/>`);
save('arrow', '<path d="M200 468V224H104L256 44l152 180h-96v244z" fill="#e6d9a7" opacity=".85"/>'+Array.from({length:160},()=>`<rect x="${random()*512}" y="${random()*512}" width="${2+random()*7}" height="2" fill="#64665e" opacity=".5"/>`).join(''));
save('hazard', '<defs><pattern id="p" width="128" height="128" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="64" height="128" fill="#e2b74c"/><rect x="64" width="64" height="128" fill="#232c2b"/></pattern></defs><rect x="8" y="160" width="496" height="192" fill="url(#p)" opacity=".85"/>');
let stain='';for(let i=0;i<40;i++)stain+=`<ellipse cx="${130+random()*250}" cy="${130+random()*250}" rx="${20+random()*85}" ry="${15+random()*65}" fill="#242c29" opacity=".07"/>`;
save('stain',stain);
save('service', '<rect x="14" y="110" width="484" height="292" rx="8" fill="#d6cbb1" opacity=".85"/><path d="M30 128H482V384H30z" fill="none" stroke="#35413e" stroke-width="8"/><text x="256" y="225" text-anchor="middle" font-family="sans-serif" font-size="55" font-weight="bold" fill="#35413e">SERVICE</text><text x="256" y="315" text-anchor="middle" font-family="sans-serif" font-size="65" font-weight="bold" fill="#35413e">02</text>');
