import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBotAction } from '../bot.js';
import { room, join, start, rank, snapshot, tick } from '../poker.js';
const card=(rank,suit)=>({rank,suit});
function view(cards, extra={}) {
  return {players:[{id:'bot',cards,stack:1000,bet:0}],board:[],currentBet:20,minRaise:20,pot:60,canRaise:true,...extra};
}
test('premium starting hands can raise instead of only calling',()=>{
  const decision=chooseBotAction(view([card(14,0),card(14,1)]),'bot',rank,()=>0.2);
  assert.equal(decision.action,'raise');assert.ok(decision.amount>=40);
});
test('weak hands can fold expensive calls but never fold a free check',()=>{
  const weak=[card(2,0),card(7,1)];
  assert.equal(chooseBotAction(view(weak,{currentBet:600,pot:600}),'bot',rank,()=>0.2).action,'fold');
  assert.equal(chooseBotAction(view(weak,{currentBet:0}),'bot',rank,()=>0.2).action,'check');
});
test('post-flop decisions consider the visible board',()=>{
  const hole=[card(2,0),card(7,1)];
  const strongBoard=[card(2,1),card(2,2),card(7,2)];
  const weakBoard=[card(10,1),card(11,2),card(14,2)];
  assert.equal(chooseBotAction(view(hole,{board:strongBoard,currentBet:0}),'bot',rank,()=>0.2).action,'raise');
  assert.equal(chooseBotAction(view(hole,{board:weakBoard,currentBet:0}),'bot',rank,()=>0.2).action,'check');
});
test('strategy cannot see opponents cards or the future deck',()=>{
  const table=room('bot','Bot');join(table,'other','Other');start(table,'bot');
  const first=chooseBotAction(snapshot(table,'bot'),'bot',rank,()=>0.2);
  table.players[1].cards=[card(14,0),card(14,1)];table.shoe.reverse();
  const second=chooseBotAction(snapshot(table,'bot'),'bot',rank,()=>0.2);
  assert.deepEqual(first,second);
});
test('strategy respects closed betting and short all-in limits',()=>{
  const strong=[card(14,0),card(14,1)];
  assert.equal(chooseBotAction(view(strong,{canRaise:false}),'bot',rank,()=>0.2).action,'call');
  const short=view(strong,{players:[{id:'bot',cards:strong,stack:30,bet:0}]});
  assert.deepEqual(chooseBotAction(short,'bot',rank,()=>0.2),{action:'raise',amount:30});
});
test('tick uses the strategy and full simulated tables preserve chips',()=>{
  for(let n=0;n<100;n++) {
    const table=room('a','A');for(let i=1;i<6;i++)join(table,String(i),'Bot '+i);
    table.players.forEach(player=>{player.bot=true;});start(table,'a');
    let actions=0;
    while(table.phase!=='showdown' && actions++<300) {
      assert.equal(tick(table,table.deadline),true);
      const sum=table.players.reduce((total,p)=>total+p.stack+(table.phase==='showdown'?0:p.total),0);
      assert.equal(sum,12000);
    }
    assert.equal(table.phase,'showdown');
  }
});

test('a royal flush on the board is never folded to a bet',()=>{
 const board=[10,11,12,13,14].map(value=>card(value,0));
 const decision=chooseBotAction(view([card(2,1),card(7,2)],{board,currentBet:900,pot:1000,canRaise:false}),'bot',rank,()=>0.2);
 assert.equal(decision.action,'call');
});

test('shared trips with weak private kickers are not treated as a strong private hand',()=>{
 const board=[card(12,0),card(12,1),card(12,2)];
 assert.equal(chooseBotAction(view([card(2,1),card(7,2)],{board,currentBet:0}),'bot',rank,()=>0.2).action,'check');
});
