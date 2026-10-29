import { randomInt, randomBytes } from 'node:crypto';
import { chooseBotAction } from './bot.js';

export class GameError extends Error {}
const demand = (condition, message) => { if (!condition) throw new GameError(message); };
export function deck() {
  const cards = Array.from({length:52}, (_, i) => ({rank:i % 13 + 2, suit:Math.floor(i / 13)}));
  for (let i=cards.length-1; i>0; i--) { const j=randomInt(i+1); [cards[i],cards[j]]=[cards[j],cards[i]]; }
  return cards;
}
// Lexicographic ranking encoded in base 15, including every relevant kicker.
function five(cards) {
  const ranks=cards.map(c=>c.rank).sort((a,b)=>b-a);
  const groups=[...new Set(ranks)].map(r=>[r,ranks.filter(x=>x===r).length]).sort((a,b)=>b[1]-a[1] || b[0]-a[0]);
  const flush=cards.every(c=>c.suit===cards[0].suit);
  const unique=[...new Set(ranks)];
  const straight=unique.length===5 && (unique[0]-unique[4]===4 ? unique[0] : unique.join(',')==='14,5,4,3,2' ? 5 : 0);
  let value;
  if(flush && straight) value=[8,straight];
  else if(groups[0][1]===4) value=[7,groups[0][0],groups[1][0]];
  else if(groups[0][1]===3 && groups[1][1]===2) value=[6,groups[0][0],groups[1][0]];
  else if(flush) value=[5,...ranks];
  else if(straight) value=[4,straight];
  else if(groups[0][1]===3) value=[3,...groups.map(g=>g[0])];
  else if(groups[0][1]===2 && groups[1][1]===2) value=[2,...groups.map(g=>g[0])];
  else if(groups[0][1]===2) value=[1,...groups.map(g=>g[0])];
  else value=[0,...ranks];
  while(value.length<6) value.push(0);
  return value.reduce((a,b)=>a*15+b,0);
}
export function rank(cards) {
  demand(cards.length>=5 && cards.length<=7,'invalid_cards');
  let best=0;
  for(let a=0;a<cards.length-4;a++) for(let b=a+1;b<cards.length-3;b++)
    for(let c=b+1;c<cards.length-2;c++) for(let d=c+1;d<cards.length-1;d++)
      for(let e=d+1;e<cards.length;e++) best=Math.max(best,five([cards[a],cards[b],cards[c],cards[d],cards[e]]));
  return best;
}
export function player(id,name,bot=false) {
  return {id,name:String(name).trim().slice(0,24)||'Player',bot,stack:2000,cards:[],bet:0,total:0,folded:false,actedAt:null};
}
export function room(id,name,practice=false) {
  return {code:randomBytes(4).toString('hex').toUpperCase(),host:id,players:[player(id,name)],practice,
    phase:'waiting',board:[],shoe:[],dealer:-1,actor:-1,currentBet:0,minRaise:20,hand:0,version:0,
    winners:[],refunds:[],showdownRevealed:false,log:[],deadline:0,updated:Date.now()};
}
export function join(r,id,name) {
  if(r.players.some(p=>p.id===id)) return;
  demand(r.phase==='waiting' || r.phase==='showdown','hand_in_progress');
  demand(r.players.length<6,'table_full');
  r.players.push(player(id,name)); r.version++;
}
const active = r => r.players.filter(p=>!p.folded);
const canAct = p => !p.folded && p.stack>0;
const bettingReopened = (r,p) => p.actedAt===null || r.currentBet-p.actedAt>=r.minRaise;
const needsAction = (r,p) => canAct(p) && (p.actedAt===null || p.bet<r.currentBet);
function next(r,from,predicate) {
  for(let offset=1;offset<=r.players.length;offset++) {
    const i=(from+offset+r.players.length)%r.players.length;
    if(predicate(r.players[i])) return i;
  }
  return -1;
}
function pay(p,amount) { amount=Math.min(amount,p.stack); p.stack-=amount; p.bet+=amount; p.total+=amount; }
function setActor(r,i) { r.actor=i; r.deadline=i<0 ? 0 : Date.now()+45000; }
export function start(r,id) {
  demand(r.host===id,'host_only');
  demand(r.phase==='waiting'||r.phase==='showdown','hand_in_progress');
  if(r.practice) for(const p of r.players) if(p.bot && p.stack===0) p.stack=2000;
  demand(r.players.filter(p=>p.stack>0).length>=2,'need_players');
  r.shoe=deck(); r.board=[]; r.winners=[]; r.refunds=[]; r.showdownRevealed=false; r.log=[]; r.hand++; r.version++;
  r.currentBet=20; r.minRaise=20; r.phase='preflop';
  for(const p of r.players) { p.cards=[]; p.bet=0; p.total=0; p.folded=p.stack===0; p.actedAt=null; }
  r.dealer=next(r,r.dealer,p=>!p.folded);
  for(let n=0;n<2;n++) for(const p of r.players) if(!p.folded) p.cards.push(r.shoe.pop());
  const headsUp=active(r).length===2;
  const small=headsUp ? r.dealer : next(r,r.dealer,p=>!p.folded);
  const big=next(r,small,p=>!p.folded);
  pay(r.players[small],10); pay(r.players[big],20);
  setActor(r,next(r,big,p=>needsAction(r,p)));
  advance(r);
}
function reveal(r) {
  r.shoe.pop(); // Burn a card before every community street.
  const count=r.board.length===0 ? 3 : 1;
  for(let i=0;i<count;i++) r.board.push(r.shoe.pop());
}
export function settle(r) {
  const remaining=active(r);
  const winnings=new Map();
  const refunds=new Map();
  r.showdownRevealed=remaining.length>1;
  const levels=[...new Set(r.players.map(p=>p.total).filter(n=>n>0))].sort((a,b)=>a-b);
  let previous=0;
  for(const level of levels) {
    const contributors=r.players.filter(p=>p.total>=level);
    const amount=(level-previous)*contributors.length; previous=level;
    if(contributors.length===1) {
      const id=contributors[0].id; refunds.set(id,(refunds.get(id)||0)+amount); continue;
    }
    const candidates=contributors.filter(p=>!p.folded);
    demand(candidates.length>0,'invalid_pot');
    const scores=candidates.map(p=>[p,remaining.length===1 || candidates.length===1 ? 0 : rank([...p.cards,...r.board])]);
    const best=Math.max(...scores.map(x=>x[1]));
    const winners=scores.filter(x=>x[1]===best).map(x=>x[0]);
    winners.sort((a,b)=>((r.players.indexOf(a)-r.dealer-1+r.players.length)%r.players.length)-((r.players.indexOf(b)-r.dealer-1+r.players.length)%r.players.length));
    winners.forEach((p,i)=>winnings.set(p.id,(winnings.get(p.id)||0)+Math.floor(amount/winners.length)+(i<amount%winners.length?1:0)));
  }
  r.winners=[...winnings].map(([id,amount])=>({id,amount,category:remaining.length>1 ? Math.floor(rank([...r.players.find(p=>p.id===id).cards,...r.board])/15**5) : -1}));
  r.refunds=[...refunds].map(([id,amount])=>({id,amount}));
  for(const p of r.players) p.stack+=(winnings.get(p.id)||0)+(refunds.get(p.id)||0);
  r.phase='showdown'; setActor(r,-1);
}
function advance(r) {
  if(active(r).length===1) { settle(r); return; }
  const able=r.players.filter(canAct);
  // A sole non-all-in player only acts if there is an outstanding call.
  if(able.length<=1 && able.every(p=>p.bet>=r.currentBet)) {
    while(r.board.length<5) reveal(r);
    settle(r); return;
  }
  if(r.players.some(p=>needsAction(r,p))) {
    if(r.actor<0 || !needsAction(r,r.players[r.actor])) setActor(r,next(r,r.actor,p=>needsAction(r,p)));
    return;
  }
  if(r.phase==='river') { settle(r); return; }
  reveal(r); r.phase=r.board.length===3?'flop':r.board.length===4?'turn':'river';
  r.currentBet=0; r.minRaise=20;
  for(const p of r.players) { p.bet=0; p.actedAt=null; }
  setActor(r,next(r,r.dealer,p=>needsAction(r,p)));
  advance(r);
}
export function act(r,id,action,amount,version) {
  demand(version===r.version,'stale_state');
  demand(r.actor>=0 && r.players[r.actor].id===id,'not_your_turn');
  const p=r.players[r.actor]; const call=r.currentBet-p.bet;
  const openingBet=r.currentBet===0;
  const previousPlayerBet=p.bet;
  if(action==='fold') p.folded=true;
  else if(action==='check') demand(call===0,'must_call');
  else if(action==='call') { demand(call>0,'nothing_to_call'); pay(p,call); }
  else if(action==='raise') {
    demand(r.players.some(other=>other.id!==id && canAct(other)),'no_raise_opponent');
    demand(Number.isSafeInteger(amount) && amount>r.currentBet && amount<=p.bet+p.stack,'invalid_raise');
    demand(bettingReopened(r,p),'raise_not_reopened');
    const increment=amount-r.currentBet;
    demand(increment>=r.minRaise || amount===p.bet+p.stack,'raise_too_small');
    pay(p,amount-p.bet); r.currentBet=amount;
    if(increment>=r.minRaise) r.minRaise=increment;
  } else throw new GameError('invalid_action');
  p.actedAt=r.currentBet;
  r.log.push({name:p.name,action:action==='raise' && openingBet?'bet':action,amount:action==='call'?p.bet-previousPlayerBet:p.bet}); r.log=r.log.slice(-8);
  r.version++; r.updated=Date.now();
  setActor(r,next(r,r.actor,x=>needsAction(r,x)));
  advance(r);
}
export function snapshot(r,id) {
  demand(r.players.some(p=>p.id===id),'not_at_table');
  const me=r.players.find(p=>p.id===id);
  return {code:r.code,host:r.host,practice:r.practice,phase:r.phase,board:r.board,dealer:r.dealer,actor:r.actor,
    currentBet:r.currentBet,minRaise:r.minRaise,hand:r.hand,version:r.version,winners:r.winners,refunds:r.refunds,log:r.log,deadline:r.deadline,
    pot:r.phase==='showdown'?0:r.players.reduce((s,p)=>s+p.total,0),
    handCategory:me.cards.length===2 && r.board.length>=3 ? Math.floor(rank([...me.cards,...r.board])/15**5) : -1,
    canRaise:r.actor>=0 && r.players[r.actor].id===id && bettingReopened(r,me) && me.bet+me.stack>r.currentBet && r.players.some(p=>p.id!==id && canAct(p)),
    players:r.players.map(p=>({id:p.id,name:p.name,stack:p.stack,bet:p.bet,folded:p.folded,bot:p.bot,
      cards:p.id===id || (r.phase==='showdown' && !p.folded && r.showdownRevealed===true) ? p.cards : []}))};
}
// Bots answer 1.5 seconds into their turn; people get the full 45 seconds.
export const due = (r,now=Date.now()) => r.actor>=0 && now>=r.deadline-(r.players[r.actor].bot ? 43500 : 0);
export function tick(r,now=Date.now()) {
  if(!due(r,now)) return false;
  const p=r.players[r.actor];
  if(p.bot) {
    const decision=chooseBotAction(snapshot(r,p.id),p.id,rank);
    act(r,p.id,decision.action,decision.amount,r.version); return true;
  }
  act(r,p.id,r.currentBet===p.bet?'check':'fold',0,r.version); return true;
}
