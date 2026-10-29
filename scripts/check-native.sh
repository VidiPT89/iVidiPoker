#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
checks_dir=$(mktemp -d "${TMPDIR:-/tmp}/ividipoker-native.XXXXXX")
node --input-type=module - "$checks_dir" <<'JS'
import {writeFileSync} from 'node:fs';
import {room,join,start,snapshot,settle} from './server/poker.js';
const directory=process.argv[2];
const table=room('a','Alice');join(table,'b','Bob');join(table,'c','Carol');start(table,'a');
writeFileSync(directory+'/live.json',JSON.stringify(snapshot(table,'a')));
table.board=[{rank:2,suit:0},{rank:3,suit:1},{rank:7,suit:2},{rank:9,suit:3},{rank:11,suit:0}];
table.players.forEach((p,i)=>{p.cards=[{rank:14-i,suit:1},{rank:14-i,suit:2}];p.total=[100,200,300][i];p.stack=0;p.folded=false;});
settle(table);writeFileSync(directory+'/settled.json',JSON.stringify(snapshot(table,'a')));
JS
xcrun swiftc -parse-as-library -O -module-cache-path "$checks_dir/modules" \
  iVidiPoker/Core/Models.swift iVidiPoker/Core/Account.swift NativeChecks/Main.swift \
  -o "$checks_dir/checks"
"$checks_dir/checks" "$checks_dir"
