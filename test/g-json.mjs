// g) toJson -> loadJson round trip; Android-style files; defaults; bad input
import { Scene, BodyType, JointKind, MK, Anchor, P2 } from '../js/model.js';
import { check, done } from './util.mjs';

const s = new Scene();
s.buildDemo();
const coil = s.addSolenoid(100, 100, true);
const sj = s.solenoidOf(coil);
s.setSolenoid(sj, true);
const lever = s.add(BodyType.RECT, 45, -80); lever.w = 100; lever.h = 10; lever.noGravity = false;
const pj = s.pin(new P2(0, -80), lever, null);
s.setTorsion(pj, 1);
const tube = s.add(BodyType.TUBE, 0, -200); tube.wall = 3.5;
const rod = s.add(BodyType.RECT, 0, -200);
const tj = s.slide(rod, tube); s.setSpring(tj, 2);
s.addMeasure(MK.DIST, [new Anchor(-1, 1.5, 2.25), s.anchorAt(lever, new P2(90, -80))]);
s.addMeasure(MK.GAP, [], lever.id, rod.id);
s.addMeasure(MK.CROSS, [], 1, 1);

const js = s.toJson();
const o = JSON.parse(js);
check(JSON.stringify(Object.keys(o)) === JSON.stringify(['nextId', 'bodies', 'joints', 'measures', 'nextMeasure', 'traceBody', 'traceLx', 'traceLy']), 'top-level keys/order');
check(JSON.stringify(Object.keys(o.bodies[0])) === JSON.stringify(['id', 'type', 'x', 'y', 'a', 'w', 'h', 'teeth', 'module', 'fixed', 'noGrav', 'strong', 'stroke', 'push', 'wall']), 'body keys');
check(JSON.stringify(Object.keys(o.joints[0])) === JSON.stringify(['kind', 'a', 'b', 'ax', 'ay', 'bx', 'by', 'c', 'lo', 'hi', 'phi', 'spring', 'rest', 'sol']), 'joint keys');
check(JSON.stringify(Object.keys(o.measures[0])) === JSON.stringify(['kind', 'num', 'refA', 'refB', 'pts']), 'measure keys');

const s2 = new Scene();
check(s2.loadJson(js) === true, 'loadJson returns true');
check(s2.toJson() === js, 'round trip: identical JSON');
check(s2.bodies.length === s.bodies.length && s2.joints.length === s.joints.length && s2.measures.length === 3, 'counts');
const sj2 = s2.solenoidOf(s2.byId(coil.id));
check(sj2.sol === 2 && sj2.spring === 1 && sj2.rest === sj.rest && sj2.kind === JointKind.SLIDE, 'solenoid joint sol/spring/rest');
const pj2 = s2.joints.find((j) => j.kind === JointKind.PIN && j.a === lever.id);
check(pj2.spring === 1 && pj2.rest === pj.rest, 'torsion spring rest');
check(s2.byId(tube.id).wall === 3.5 && s2.byId(coil.id).pushType === true && s2.byId(lever.id).noGravity === false, 'body optional fields');
check(s2.byId(1).type === BodyType.RAIL && s2.byId(3).type === BodyType.GEAR, 'enum identity');
check(s2.measures[1].kind === MK.GAP && s2.measures[1].refA === lever.id && s2.measures[0].pts[0].lx === 1.5, 'measures');
check(s2.nextId === s.nextId && s2.nextMeasure === 4 && s2.traceBody === s.traceBody && s2.trace.length === 1, 'nextId/nextMeasure/trace');

// Android-style file: integral doubles written as ints, optional keys missing
const android = '{"nextId":3,"bodies":[{"id":1,"type":"RECT","x":0,"y":5.5,"a":0,"w":100,"h":20,"teeth":20,"module":2,"fixed":true},' +
  '{"id":2,"type":"PULLEY","x":1e7,"y":0,"a":0,"w":40,"h":40,"teeth":20,"module":2,"fixed":false}],' +
  '"joints":[{"kind":"PIN","a":2,"b":-1,"ax":0,"ay":0,"bx":0,"by":0,"c":0,"lo":0,"hi":0,"phi":0}]}';
const s3 = new Scene();
check(s3.loadJson(android) === true, 'Android-style file without optional keys loads');
const b1 = s3.byId(1), b2 = s3.byId(2);
check(b1.noGravity === false && b1.strong === false && b1.stroke === 10.0 && b1.pushType === false && b1.wall === 2.0, 'optBoolean/optDouble defaults');
check(b2.x === 0.0, 'huge x reset to 0');
check(s3.joints[0].spring === 0 && s3.joints[0].rest === 0.0 && s3.joints[0].sol === 0, 'optInt/optDouble joint defaults');
check(s3.measures.length === 0 && s3.nextMeasure === 1 && s3.traceBody === -1, 'measures/trace defaults');

// failures
const s4 = new Scene(); s4.buildDemo(); const before = s4.toJson();
check(s4.loadJson('not json') === false, 'garbage -> false');
check(s4.loadJson('{"nextId":1,"bodies":[{"id":1,"type":"NOPE","x":0,"y":0,"a":0,"w":1,"h":1,"teeth":1,"module":1,"fixed":false}],"joints":[]}') === false, 'unknown type -> false');
check(s4.loadJson('{"bodies":[],"joints":[]}') === false, 'missing nextId -> false (Kotlin: after clearing)');
check(s4.toJson() !== before && s4.bodies.length === 0, 'like Kotlin, bodies were already replaced before nextId failed');
check(BodyType.values().length === 9 && JointKind.valueOf('BELT') === JointKind.BELT, 'values/valueOf');
let threw = false; try { BodyType.valueOf('X'); } catch (e) { threw = true; } check(threw, 'valueOf throws');
done('g) json round trip');
