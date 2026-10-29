import assert from 'node:assert/strict';
import { rank } from '../poker.js';

const choose=(n,k)=>{let value=1;for(let i=1;i<=k;i++)value=value*(n-i+1)/i;return value;};
const expected=[
  (choose(13,5)-10)*(4**5-4),
  13*choose(4,2)*choose(12,3)*4**3,
  choose(13,2)*choose(4,2)**2*11*4,
  13*choose(4,3)*choose(12,2)*4**2,
  10*4**5-40,
  4*choose(13,5)-40,
  13*choose(4,3)*12*choose(4,2),
  13*48,
  10*4
];
const deck=Array.from({length:52},(_,i)=>({rank:i%13+2,suit:Math.floor(i/13)}));
const counts=Array(9).fill(0);
let hands=0;
for(let a=0;a<48;a++)for(let b=a+1;b<49;b++)for(let c=b+1;c<50;c++)
  for(let d=c+1;d<51;d++)for(let e=d+1;e<52;e++) {
    counts[Math.floor(rank([deck[a],deck[b],deck[c],deck[d],deck[e]])/15**5)]++;
    hands++;
  }
assert.equal(hands,choose(52,5));
assert.deepEqual(counts,expected);
console.log(`Exhaustive check passed: ${hands.toLocaleString('en-US')} five-card hands across all nine categories.`);
