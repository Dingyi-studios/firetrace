import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { containment, drones, resources } from '../src/data.js';
import { denseFires } from '../src/combustion.js';
import { heatAt, hotspotsAt, nearbyHotspot } from '../src/thermal.js';
import { airDrops, airOperation, aircraftRate, dropOccurrences } from '../src/air-operations.js';
import { createFireGraphics, createWind, place } from '../src/objects.js';
import { state, seekTo, tick } from '../src/state.js';
import { replayRate, retardantTotal, waterTotal } from '../src/operations.js';
import { fireAt } from '../src/terrain.js';

test('event navigation accelerates, shows intermediate fire states, and brakes at its target', () => {
 const saved={hour:state.hour,playing:state.playing,seeking:state.seeking};
 try {
  state.hour=.44;seekTo(containment);const duration=state.seeking.duration, samples=[state.hour];
  for(let i=0;i<20;i++){tick(duration/20);samples.push(state.hour)}
  assert.ok(samples.every((value,index)=>!index||value>=samples[index-1]));
  assert.ok(samples[10]>30&&samples[10]<65);
  assert.ok(samples[1]-samples[0]<(samples[10]-samples[9])/8);
  assert.ok(samples[20]-samples[19]<(samples[10]-samples[9])/8);
  assert.ok(Math.abs(state.hour-containment)<1e-8);
  state.hour=50;seekTo(5);tick(.4);const current=state.hour;seekTo(70);assert.equal(state.seeking.from,current);
  state.seeking=null;state.playing=false;tick(10);assert.equal(state.hour,current);
 } finally {Object.assign(state,saved)}
});

test('ordinary replay slows fourfold while aircraft retain their wall-clock cruise speed',()=>{
 assert.equal(replayRate,.84/4);assert.equal(replayRate*aircraftRate,.84);
 const saved={hour:state.hour,playing:state.playing,seeking:state.seeking};
 try{state.hour=30;state.seeking=null;state.playing=true;tick(1);assert.ok(Math.abs(state.hour-30-.21)<1e-8)}finally{Object.assign(state,saved)}
});

test('dense woodland burns persistently, ordinary burned ground cools, and containment extinguishes hotspots',()=>{
 const dense=heatAt(-15,7,65),cooled=heatAt(-5,10,65);
 assert.ok(dense.temperature>950);assert.ok(cooled.temperature<160);
 assert.ok(dense.temperature>cooled.temperature+700);
 for(const zone of denseFires)assert.ok(heatAt(zone.x,zone.z,Math.max(60,fireAt(zone.x,zone.z).arrival+5)).dense>.7);
 assert.equal(hotspotsAt(containment).length,0);
 assert.equal(heatAt(-15,7,containment).temperature,32);
});

test('thermal fire fronts distinguish faster and slower expansion and markers track ground heat',()=>{
 const samples=[];
 for(let z=-47;z<20;z+=2)for(let x=-25;x<42;x+=2){const signal=fireAt(x,z);if(signal.edge<-.8&&signal.arrival>12&&signal.arrival<80)samples.push({signal,temperature:heatAt(x,z,signal.arrival).temperature})}
 const fast=samples.filter(p=>p.signal.rate>.85),slow=samples.filter(p=>p.signal.rate<.5);
 assert.ok(fast.length&&slow.length);
 const mean=rows=>rows.reduce((sum,p)=>sum+p.temperature,0)/rows.length;
 assert.ok(mean(fast)>mean(slow)+200);
 const hot=hotspotsAt(60);assert.equal(hot.filter(p=>p.kind==='dense').length,2);assert.ok(hot.length<=4);
 const later=hotspotsAt(62);assert.ok(hot.some(p=>{const b=later.find(q=>q.id===p.id);return b&&Math.hypot(b.x-p.x,b.z-p.z)>.1}));
 const local=nearbyHotspot({x:19,z:-17},40,'test');assert.ok(local&&local.temperature>400);
});

test('new drones include two continuous woodland patrols and a high-altitude global observer',()=>{
 assert.equal(drones.length,9);
 assert.equal(drones.filter(d=>d.role.startsWith('forest')).length,2);
 const observer=drones.find(d=>d.role==='global');assert.ok(place(observer,60).y>100);
});

test('every firefighting aircraft completes repeated load/drop/refill cycles and rewinds consistently',()=>{
 for(const drop of airDrops){
  const unit=resources.find(u=>u.id===drop.id),windows=dropOccurrences(drop);
  assert.ok(windows.length>=3,drop.id);
  const start=airOperation(unit,windows[1].start+.05),finish=airOperation(unit,windows[1].finish+.01);
  assert.equal(start.status,'dropping');assert.equal(start.count,1);assert.ok(start.load<unit.capacity&&start.load>0);
  assert.equal(finish.count,2);assert.equal(finish.load,0);
  const filling=[];for(let h=windows[0].finish;h<windows[1].start;h+=.01){const op=airOperation(unit,h);if(op.phase==='refilling')filling.push(op)}
  assert.ok(filling.length>10);assert.ok(filling.at(-1).load>filling[0].load);assert.ok(filling.at(-1).load>unit.capacity*.9);
  const before=airOperation(unit,windows[1].start-.01);assert.equal(before.load,unit.capacity);
  const expected=place(unit,windows[1].start+.2);place(unit,90);assert.deepEqual(place(unit,windows[1].start+.2),expected);
 }
 assert.ok(waterTotal(80)>waterTotal(45));assert.ok(retardantTotal(80)>retardantTotal(45));
});

test('repeat water drops emit particles again and wind strokes use actual ribbon geometry',()=>{
 const world=new Group();try{
  const {drops}=createFireGraphics(world);
  for(const {drop,mist}of drops){const window=dropOccurrences(drop)[1];mist.update((window.start+window.finish)/2);assert.ok(mist.mesh.visible);assert.ok(mist.mesh.geometry.attributes.opacity.array.some(v=>v>0));}
  const wind=createWind(world);assert.ok(wind.isMesh);assert.ok(wind.geometry.index.count>1000);
 }finally{world.traverse(o=>{o.geometry?.dispose();o.material?.dispose()})}
});

test('containment truncates a late sortie without advancing its release route or spending a full tank',()=>{
 const drop=airDrops.find(d=>d.id==='H-743'),window=dropOccurrences(drop).at(-1);
 assert.ok(window.start<containment&&window.finish>containment);
 const op=airOperation({id:drop.id},containment);
 assert.ok(op.load>drop.quantity*.5);
 const atEnd=waterTotal(containment);assert.equal(waterTotal(containment+.5),atEnd);
 const route=place(resources.find(u=>u.id===drop.id),containment);
 assert.ok(Number.isFinite(route.x)&&Number.isFinite(route.z));
});
