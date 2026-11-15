const FT=require('./src/engine.js');
let t0=Date.now();
const S=FT.generateSample();
console.log('sample points M',S.M.length,'V',S.V.length,'ms',Date.now()-t0);
// CSV round trip
const csvM=FT.toFirmsCsv(S.M,'M'), csvV=FT.toFirmsCsv(S.V,'V');
console.log('csv size MB',(csvM.length/1e6).toFixed(1),(csvV.length/1e6).toFixed(1));
t0=Date.now();
const pm=FT.parseCsvText(csvM), pv=FT.parseCsvText(csvV);
console.log('parsed',pm.rows,pv.rows,'low M',pm.points.filter(p=>p.low).length,'ms',Date.now()-t0, pm.range.map(FT.isoDate), pv.range.map(FT.isoDate), pv.sats);
t0=Date.now();
const res=FT.analyse(pm.points,pv.points,[pm.range],[pv.range],{});
console.log('analyse ms',Date.now()-t0);
const m=res.meta;
console.log('k',m.k.toFixed(3),'kRange',m.kMin.toFixed(3),m.kMax.toFixed(3),'r',m.r.toFixed(3),'overlapWeeks',m.overlapWeeks,'years',m.years[0],m.years[m.years.length-1],'warn',m.warnings);
// trust level distribution
const lv={};for(const y of m.years)res.weeks[y].forEach(r=>{if(r.complete&&r.level)lv[r.level]=(lv[r.level]||0)+1});console.log('levels',lv);
let fl=0;for(const y of m.years)res.weeks[y].forEach(r=>{if(r.flag==='high')fl++});console.log('high flags',fl);
for(const y of [2019,2026]){const ins=FT.insightsFor(res,y);console.log(y,ins.lines.join('\n   '));}
const ss=FT.seasonShift(res,'autumn');console.log('shift n',ss.n,'slope',ss.slope&&ss.slope.toFixed(2),'t',ss.t&&ss.t.toFixed(2),ss.pts.slice(0,3).map(p=>[p.y,p.d50.toFixed(1)]));
console.log('ringScale',res.ringScale.toFixed(1),'dailyScale',res.dailyScale.toFixed(1));
// edge: single sensor
const r2=FT.analyse(pm.points,[],[pm.range],[],{});console.log('M only warn',r2.meta.warnings, 'trust levels', Object.values(r2.weeks[2020]).filter(r=>r.level).length);
