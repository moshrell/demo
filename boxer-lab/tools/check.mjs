import {E,CYL,FIRE,pose,DISPLACEMENT_CC} from '../src/lab/kin.js';
const d=Math.PI/180;
console.log('displacement cm3:',DISPLACEMENT_CC.toFixed(0),'(assumed bore 97 x stroke 81.5)');
// 1) each cylinder is at firing TDC exactly at its FIRE angle: wrist pin must be at max extension r+L
for(const c of CYL){const p=pose(c,FIRE[c.n]*d);console.log('cyl',c.n,'TDC wrist x*s =',(p.wx*c.s).toFixed(4),'expect',(E.r+E.rod).toFixed(4),'phase',p.phase.toFixed(1),'stroke',p.stroke);}
// 2) mirror pairs (1,4)(2,5)(3,6): wrist x opposite sign, same magnitude at every angle
let maxErr=0;for(let a=0;a<720;a+=7){for(const [i,j] of [[0,3],[1,4],[2,5]]){const A=pose(CYL[i],a*d),B=pose(CYL[j],a*d);maxErr=Math.max(maxErr,Math.abs(A.wx+B.wx));}}
console.log('mirror pair max |xA+xB| over 720deg:',maxErr.toExponential(2));
// 3) firing order & spacing
const order=Object.entries(FIRE).sort((a,b)=>a[1]-b[1]).map(e=>e[0]).join('-');console.log('firing order',order,'spacing',[...new Set(Object.values(FIRE).sort((a,b)=>a-b).map((v,i,a)=>(a[(i+1)%6]-v+720)%720))]);
// 4) rod length constant / no negative sqrt
let minSq=1e9;for(let a=0;a<360;a+=1)for(const c of CYL){const p=pose(c,a*d);minSq=Math.min(minSq,E.rod**2-p.py**2);}
console.log('min rod^2 - py^2 =',minSq.toFixed(3),'(>0 ok)');
// 5) skirt clearance at BDC: piston skirt end x (wrist-0.22) must stay inside liner start 0.55 and clear centre web reach
console.log('BDC wrist x =',(E.rod-E.r).toFixed(4),' skirt end =',(E.rod-E.r-0.22).toFixed(4),' centre-web reach =',(E.r+0.22).toFixed(4));
console.log('TDC crown x =',(E.r+E.rod+0.30).toFixed(4),' head face 2.05 -> gap',(2.05-(E.r+E.rod+0.30)).toFixed(4));
