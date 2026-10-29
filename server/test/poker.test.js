import test from 'node:test';
import assert from 'node:assert/strict';
import {deck,rank,room,join,start,act,snapshot,settle,tick} from '../poker.js';
const cards = text => text.split(' ').map(v=>({rank:'23456789TJQKA'.indexOf(v[0])+2,suit:'shdc'.indexOf(v[1])}));
function table(n=3) {const r=room('a','Alice');for(let i=1;i<n;i++)join(r,String(i),'Player '+i);return r;}
const chips = r=>r.players.reduce((s,p)=>s+p.stack,0)+(r.phase==='showdown'?0:r.players.reduce((s,p)=>s+p.total,0));
test('deck contains exactly 52 unique cards',()=>{for(let i=0;i<20;i++)assert.equal(new Set(deck().map(c=>c.rank+':'+c.suit)).size,52)});
test('all hand categories, wheel and kickers',()=>{
 const hands=['As Kd 9c 7h 3s','As Ad Kc 9h 3s','As Ad Kc Kh 3s','As Ad Ac 9h 3s','As 2d 3c 4h 5s','As Ts 9s 7s 3s','As Ad Ac 9h 9s','As Ad Ac Ah 3s','9s Ts Js Qs Ks'];
 const values=hands.map(h=>rank(cards(h)));for(let i=1;i<values.length;i++)assert.ok(values[i]>values[i-1]);
 assert.ok(rank(cards('2s 3d 4c 5h 6s'))>rank(cards('As 2d 3c 4h 5s')));
 assert.ok(rank(cards('As Ad Kc 9h 3s'))>rank(cards('As Ad Qc Jh 9s')));
 assert.equal(rank(cards('As Ks Qs Js Ts 2d 3d')),rank(cards('As Ks Qs Js Ts')));
 assert.ok(rank(cards('As Ad Ac Ks Kd Kc 2h'))>rank(cards('Ks Kd Kc Qs Qd 2s 3h')));
});
test('heads up dealer posts small blind and acts first preflop, last postflop',()=>{
 const r=table(2);start(r,'a');assert.equal(r.actor,r.dealer);assert.equal(r.players[r.dealer].bet,10);
 act(r,r.players[r.actor].id,'call',0,r.version);act(r,r.players[r.actor].id,'check',0,r.version);
 assert.equal(r.phase,'flop');assert.notEqual(r.actor,r.dealer);assert.equal(r.board.length,3);
});
test('private projection hides deck and opponents cards',()=>{
 const r=table();start(r,'a');const view=snapshot(r,'a');assert.equal(view.players[0].cards.length,2);
 assert.equal(view.players[1].cards.length,0);assert.equal(view.shoe,undefined);
 assert.throws(()=>snapshot(r,'outsider'));assert.equal(JSON.stringify(view).includes('actedAt'),false);
});
test('turn, stale versions, illegal checks and undersized raises rejected without mutation',()=>{
 const r=table();start(r,'a');const id=r.players[r.actor].id;const before=JSON.stringify(r);
 assert.throws(()=>act(r,'outsider','call',0,r.version));assert.throws(()=>act(r,id,'call',0,r.version-1));
 assert.throws(()=>act(r,id,'check',0,r.version));assert.throws(()=>act(r,id,'raise',21,r.version));
 assert.throws(()=>act(r,id,'raise',NaN,r.version));assert.equal(JSON.stringify(r),before);
});
test('big blind retains option after callers',()=>{
 const r=table();start(r,'a');act(r,r.players[r.actor].id,'call',0,r.version);act(r,r.players[r.actor].id,'call',0,r.version);
 assert.equal(r.phase,'preflop');assert.equal(r.players[r.actor].bet,20);
 act(r,r.players[r.actor].id,'raise',60,r.version);assert.equal(r.currentBet,60);
});
test('short all-in does not reopen raising for previous actors',()=>{
 const r=table();r.players[2].stack=30;start(r,'a');
 act(r,'a','call',0,r.version);act(r,'1','call',0,r.version);act(r,'2','raise',30,r.version);
 assert.equal(snapshot(r,'a').canRaise,false);assert.throws(()=>act(r,'a','raise',60,r.version));
 act(r,'a','call',0,r.version);act(r,'1','call',0,r.version);assert.equal(r.phase,'flop');
});
test('all-in runout, side pots and total chip conservation',()=>{
 const r=table();r.players[0].stack=100;r.players[1].stack=200;r.players[2].stack=300;start(r,'a');
 act(r,'a','raise',100,r.version);act(r,'1','raise',200,r.version);act(r,'2','call',0,r.version);
 assert.equal(r.phase,'showdown');assert.equal(r.board.length,5);assert.equal(chips(r),600);
});
test('deterministic main and side pot awards',()=>{
 const r=table();r.board=cards('2s 3d 7c 9h Js');
 const holdings=['As Ad','Ks Kd','Qs Qd'];const totals=[100,200,300];
 r.players.forEach((p,i)=>{p.cards=cards(holdings[i]);p.total=totals[i];p.stack=0});settle(r);
 assert.deepEqual(r.players.map(p=>p.stack),[300,200,100]);
});
test('ties split pots and odd chips start left of dealer',()=>{
 const r=table();r.board=cards('As Ks Qs Js Ts');r.dealer=0;
 r.players.forEach((p,i)=>{p.cards=cards(['2d 3d','4d 5d','6d 7d'][i]);p.total=5;p.stack=0});r.players[2].folded=true;
 settle(r);assert.deepEqual(r.players.map(p=>p.stack),[7,8,0]);
});
test('fold wins without revealing hole cards',()=>{
 const r=table(2);start(r,'a');act(r,r.players[r.actor].id,'fold',0,r.version);
 assert.equal(r.phase,'showdown');assert.equal(chips(r),4000);assert.equal(snapshot(r,'a').players[1].cards.length,0);
});
test('deadline folds facing a bet and checks for free',()=>{
 const r=table(2);start(r,'a');assert.equal(tick(r,r.deadline-1),false);tick(r,r.deadline);assert.equal(r.phase,'showdown');
});
test('random complete hands preserve chips and terminate',()=>{
 for(let game=0;game<100;game++) {
  const r=table(6);start(r,'a');let moves=0;
  while(r.phase!=='showdown' && moves++<300) {
   const p=r.players[r.actor];const call=r.currentBet-p.bet;
   const option=Math.random();
   if(option<0.12)act(r,p.id,'fold',0,r.version);
   else if(option<0.3 && snapshot(r,p.id).canRaise)act(r,p.id,'raise',p.bet+p.stack,r.version);
   else act(r,p.id,call>0?'call':'check',0,r.version);
   assert.equal(chips(r),12000);
  }
  assert.equal(r.phase,'showdown');
 }
});

test('joining after a fold-only win never reveals the previous winner cards',()=>{
 const r=table(2);start(r,'a');act(r,r.players[r.actor].id,'fold',0,r.version);
 join(r,'new','New player');
 assert.ok(snapshot(r,'new').players.every(p=>p.cards.length===0));
});
test('uncalled excess is returned separately, not labelled a won pot',()=>{
 const r=table();r.board=cards('2s 3d 7c 9h Js');
 r.players.forEach((p,i)=>{p.cards=cards(['As Ad','Ks Kd','Qs Qd'][i]);p.total=[100,200,300][i];p.stack=0;});
 settle(r);assert.deepEqual(r.players.map(p=>p.stack),[300,200,100]);
 assert.equal(r.winners.some(w=>w.id==='2'),false);
 assert.deepEqual(r.refunds,[{id:'2',amount:100}]);
});
test('a remaining player cannot raise into opponents who are all-in',()=>{
 const r=table(2);r.players[0].stack=100;start(r,'a');act(r,'a','raise',100,r.version);
 assert.equal(snapshot(r,'1').canRaise,false);
 assert.throws(()=>act(r,'1','raise',200,r.version));
 act(r,'1','call',0,r.version);assert.equal(r.phase,'showdown');
});

test('action log distinguishes an opening bet from a raise',()=>{
 const r=table();start(r,'a');
 while(r.phase==='preflop') {const p=r.players[r.actor];act(r,p.id,p.bet<r.currentBet?'call':'check',0,r.version);}
 act(r,r.players[r.actor].id,'raise',20,r.version);
 act(r,r.players[r.actor].id,'raise',40,r.version);
 assert.deepEqual(r.log.slice(-2).map(event=>event.action),['bet','raise']);
});

test('call log reports chips paid now rather than the accumulated street bet',()=>{
 const r=table();start(r,'a');act(r,'a','call',0,r.version);
 assert.equal(r.players[1].bet,10);act(r,'1','call',0,r.version);
 assert.equal(r.log.at(-1).amount,10);assert.equal(r.players[1].bet,20);
});
