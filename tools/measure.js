// Measures label widths (em) and cap height in the Airborne font -> tools/emw.json
// usage: node tools/measure.js   (needs playwright)
const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
(async()=>{const root=path.join(__dirname,'..'),L=JSON.parse(fs.readFileSync(path.join(__dirname,'labels.json')));
const CO=fs.existsSync(path.join(root,'assets/countries.json'))?JSON.parse(fs.readFileSync(path.join(root,'assets/countries.json'))):{};L.forEach(l=>{const o=CO[l.hex]||{};l.en=o.en||l.en;l.ru=o.ru||l.ru}); // site edits win
const f=fs.readFileSync(path.join(root,'static/fonts/a.woff2')).toString('base64');
const b=await chromium.launch(),pg=await b.newPage();
await pg.setContent(`<style>@font-face{font-family:A;src:url(data:font/woff2;base64,${f})}</style><canvas id=c></canvas>`);
const r=await pg.evaluate(async n=>{await document.fonts.load('100px A','аАaA');const o=c.getContext('2d');o.font='1000px A';const R={cap:o.measureText('H').actualBoundingBoxAscent/1000};n.forEach(t=>R[t]=o.measureText(t.toUpperCase()).width/1000);return R},L.flatMap(l=>[l.en,l.ru]));
fs.writeFileSync(path.join(__dirname,'emw.json'),JSON.stringify(r));console.log(r);await b.close()})()
