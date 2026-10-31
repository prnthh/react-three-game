import { BotController, routeTo } from "../app/demo/fps/fakeserver/bot/controller.ts";
import { MatchAuthority } from "../app/demo/fps/fakeserver/authority.ts";
import { copySnapshot, emptySnapshot } from "../app/demo/fps/shared/protocol.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createMatch,
  stepMatch as stepRules,
  fire,
  idleCommand,
  blocked,
  LIMIT,
  advanceGait,
} from "../app/demo/fps/fakeserver/match.ts";

// Exercise shared rules with one input controller and deterministic bot controllers.
const testControllers = new WeakMap();
function stepMatch(match, input) {
  let bots = testControllers.get(match);
  if (!bots) {
    bots = match.actors.map(actor => new BotController(317 + actor.id * 7919));
    testControllers.set(match, bots);
  }
  const commands = new Map(match.actors.map(actor => [actor.id,
    actor.id === 0 ? input : bots[actor.id].command(match, actor, 1 / 60)]));
  stepRules(match, commands);
}

test("shots respect walls, teammates, shields, ammo and the score limit", () => {
  const m = createMatch();
  m.actors.forEach((a) => {
    a.hp = 0;
  });
  const [player, friend] = m.actors,
    enemy = m.actors[4];
  Object.assign(player, { hp: 100, x: -13, z: -20, yaw: Math.PI });
  Object.assign(enemy, { hp: 100, shield: 0, x: -13, z: -12 });
  fire(m, player, Math.PI, 0);
  assert.ok(enemy.hp < 100, "open doorway permits a shot");
  player.cooldown = 0;
  Object.assign(player, { x: -17 });
  Object.assign(enemy, { x: -17, hp: 100 });
  fire(m, player, Math.PI, 0);
  assert.equal(enemy.hp, 100, "end wall stops the shot");
  Object.assign(player, { x: -13, cooldown: 0 });
  Object.assign(enemy, { x: -13 });
  Object.assign(friend, { x: -13, z: -18, hp: 100 });
  fire(m, player, Math.PI, 0);
  assert.equal(friend.hp, 100);
  assert.equal(enemy.hp, 100, "teammate blocks the shot");
  friend.hp = 0;
  enemy.shield = 1;
  player.cooldown = 0;
  fire(m, player, Math.PI, 0);
  assert.equal(enemy.hp, 100);
  enemy.shield = 0;
  enemy.hp = 1;
  player.cooldown = 0;
  m.scores[0] = LIMIT - 1;
  fire(m, player, Math.PI, 0);
  assert.equal(m.winner, 0);
  assert.equal(enemy.deaths, 1);
  assert.equal(player.ammo, 25);
  const snapshot = structuredClone(m);
  stepMatch(m, idleCommand());
  assert.deepEqual(m, snapshot);
});

test("navigation crosses doorways without crossing thin partitions", () => {
  const path = routeTo(-13, -21, -13, 21);
  assert.ok(path.length > 10);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    for (let t = 0; t <= 1; t += 0.1)
      assert.equal(
        blocked(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.36),
        false,
      );
  }
});

test("movement collides, reload completes, and dead players respawn", () => {
  const m = createMatch(),
    a = m.actors[0];
  Object.assign(a, { x: -17, z: -18, ammo: 0 });
  const input = { ...idleCommand(), yaw: Math.PI, forward: 1, reload: true };
  for (let i = 0; i < 120; i++) stepMatch(m, input);
  assert.ok(a.z < -16.5);
  assert.equal(a.ammo, 30);
  a.hp = 0;
  a.respawn = 0.01;
  stepMatch(m, idleCommand());
  assert.equal(a.hp, 100);
  assert.equal(a.z, -21);
  assert.ok(a.shield > 0);
});

test("seeded bots navigate, score and finish a repeatable full match", () => {
  const a = createMatch(),
    b = createMatch();
  const actors = a.actors, shots = a.shots, feed = a.feed;
  const references = a.actors.slice();
  for (let i = 0; i < 18000; i++) {
    const headings = a.actors.map((actor) => [actor.yaw, actor.hp]);
    stepMatch(a, idleCommand());
    stepMatch(b, idleCommand());
    for (const actor of a.actors.slice(1)) {
      const [yaw, hp] = headings[actor.id];
      if (hp > 0 && actor.hp > 0) {
        const turn = Math.abs(Math.atan2(Math.sin(actor.yaw - yaw), Math.cos(actor.yaw - yaw)));
        assert.ok(turn <= 8 / 60 + 1e-9, "living bots cannot snap heading between ticks");
      }
    }
  }
  assert.deepEqual(a, b);
  assert.equal(a.actors, actors);
  assert.equal(a.shots, shots);
  assert.equal(a.feed, feed);
  references.forEach((actor, i) => {
    assert.equal(a.actors[i], actor);
  });
  assert.notEqual(a.winner, null);
  assert.ok(
    Math.max(...a.scores) >= LIMIT,
    "bots reach score limit before timeout",
  );
  assert.ok(
    a.actors.slice(1).every((bot) => bot.kills > 0),
    "every bot engages",
  );
});

// Omit materials when loading real rigs in Node: animation tests need no browser image decoder.
async function loadRig(name) {
  const { readFileSync } = await import("node:fs");
  const { GLTFLoader } =
    await import("three/examples/jsm/loaders/GLTFLoader.js");
  const buffer = readFileSync(
    new URL(`../public/models/fps/${name}.glb`, import.meta.url),
  );
  const length = buffer.readUInt32LE(12),
    data = JSON.parse(buffer.subarray(20, 20 + length));
  for (const mesh of data.meshes)
    for (const primitive of mesh.primitives) delete primitive.material;
  delete data.materials;
  delete data.images;
  delete data.textures;
  const json = Buffer.from(JSON.stringify(data)),
    padding = Buffer.alloc((4 - (json.length % 4)) % 4, 32),
    binary = buffer.subarray(20 + length),
    header = Buffer.alloc(20);
  header.write("glTF");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + padding.length + binary.length, 8);
  header.writeUInt32LE(json.length + padding.length, 12);
  header.write("JSON", 16);
  const glb = Buffer.concat([header, json, padding, binary]);
  return new GLTFLoader().parseAsync(
    glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length),
    "",
  );
}

test("both actual character rigs animate independently, retain proportions and restart after cleanup", async () => {
  const { clone } = await import("three/examples/jsm/utils/SkeletonUtils.js");
  const { retargetLocomotion, LocomotionPlayer, LocomotionClock, GAITS } =
    await import("../app/demo/fps/animation.ts");
  const remilio = await loadRig("pockit-remilio"),
    milady = await loadRig("pockit-milady");
  for (const name of ["walk", "run"]) {
    const { AnimationMixer, Vector3 } = await import("three");
    const clip = remilio.animations.find(c => c.name === name);
    assert.ok(Math.abs(clip.duration - GAITS[name].duration) < 1e-6, "contact metadata matches shipped clips");
    const rig = clone(remilio.scene), mixer = new AnimationMixer(rig);
    mixer.clipAction(clip).play();
    for (const [index, foot] of ["LeftFoot", "RightFoot"].entries()) {
      const bone = rig.getObjectByName(`mixamorig${foot}`), heights = [];
      for (let i = 0; i < 120; i++) {
        mixer.setTime(i / 120 * clip.duration); rig.updateMatrixWorld(true);
        heights.push(bone.getWorldPosition(new Vector3()).y);
      }
      mixer.setTime(GAITS[name].contacts[index] * clip.duration); rig.updateMatrixWorld(true);
      assert.ok(bone.getWorldPosition(new Vector3()).y < Math.min(...heights) + .012, `${name} ${foot} contact is planted`);
    }
    mixer.stopAllAction();
  }
  for (const target of [remilio, milady]) {
    const original = target.scene
      .getObjectByName("mixamorigLeftLeg")
      .position.clone();
    const clips =
      target === remilio
        ? remilio.animations
        : [
            retargetLocomotion(
              remilio.scene,
              target.scene,
              remilio.animations.find((c) => c.name === "idle"),
              "idle",
            ),
            retargetLocomotion(
              remilio.scene,
              target.scene,
              remilio.animations.find((c) => c.name === "walk"),
              "walk",
            ),
            retargetLocomotion(
              remilio.scene,
              target.scene,
              remilio.animations.find((c) => c.name === "run"),
              "run",
            ),
          ];
    const first = clone(target.scene),
      second = clone(target.scene),
      player = new LocomotionPlayer(first, clips);
    const clock = new LocomotionClock();
    for (const speed of [4.6, 7, 4.6]) {
      for (let i = 0; i < 90; i++) {
        clock.advance(speed, 1 / 60);
        player.update(speed, 1 / 60, clock);
        const action = player.mixer.clipAction(clips.find(c => c.name === clock.state));
        assert.ok(Math.abs(action.time / action.getClip().duration - clock.phase) < 1e-6, "visible pose uses the sound clock on both rigs");
      }
    }
    const leg = first.getObjectByName("mixamorigLeftLeg");
    const untouched = second
      .getObjectByName("mixamorigLeftLeg")
      .quaternion.clone();
    for (const speed of [0, 1.3, 3.1, 7]) {
      for (let i = 0; i < 8; i++) player.update(speed, 0.05);
      const pose = leg.quaternion.clone();
      for (let i = 0; i < 4; i++) player.update(speed, 0.05);
      assert.ok(
        pose.angleTo(leg.quaternion) > 1e-5,
        `speed ${speed} advances the leg animation`,
      );
      assert.ok(
        leg.position.distanceTo(original) < 1e-6,
        "target bone lengths are preserved",
      );
      assert.ok(
        second.getObjectByName("mixamorigLeftLeg").quaternion.equals(untouched),
        "mixers are independent",
      );
      assert.ok(
        target.scene
          .getObjectByName("mixamorigLeftLeg")
          .quaternion.equals(untouched),
        "source asset is untouched",
      );
    }
    player.dispose();
    player.update(0, 0.05);
    player.update(3.1, 0.05);
    player.dispose();
  }
});

test("FPS prefab has stable node identities, manager references and matching collision geometry", async () => {
  const { relayYardScene, blocks, mapPrefab, gameplayPrefab, composeScene, compileMap } = await import("../app/demo/fps/shared/map.ts");
  assert.throws(() => composeScene(mapPrefab, mapPrefab), /Duplicate scene node ID/);
  const composed = composeScene(mapPrefab, gameplayPrefab);
  composed.root.children[0].name = "Edited copy";
  assert.notEqual(mapPrefab.root.name, "Edited copy");
  const moved = structuredClone(mapPrefab);
  moved.root.components = { transform: { type: "Transform", properties: { position: [10, 0, 0], scale: [2, 1, 1] } } };
  const shifted = compileMap(moved);
  assert.equal(shifted[0].p[0], blocks[0].p[0] * 2 + 10);
  assert.equal(shifted[0].size[0], blocks[0].size[0] * 2);
  moved.root.components.transform.properties.rotation = [0, 0.5, 0];
  assert.throws(() => compileMap(moved), /unrotated box/);
  const scene = JSON.parse(JSON.stringify(relayYardScene));
  const nodes = [];
  const visit = (node) => {
    nodes.push(node);
    node.children?.forEach(visit);
  };
  visit(scene.root);
  assert.equal(new Set(nodes.map((n) => n.id)).size, nodes.length);
  const manager = nodes.find(
    (n) => n.components?.match?.type === "FPSMatchManager",
  );
  assert.ok(manager);
  const characters = nodes.filter(
    (n) => n.components?.character?.type === "FPSCharacter",
  );
  assert.equal(characters.length, 8);
  assert.ok(characters.some(n => n.components.character.properties.actorId === 0), "victim body exists for killer-view replays");
  for (const node of characters)
    assert.equal(node.components.character.properties.manager, manager.id);
  const map = nodes.find((n) => n.id === "map");
  assert.equal(map.children.length, blocks.length);
  map.children.forEach((node, i) => {
    assert.deepEqual(
      node.components.transform.properties.position,
      blocks[i].p,
    );
    assert.deepEqual(node.components.geometry.properties.args, blocks[i].size);
  });
});

 test("client heading interpolation crosses the wrap without a full rotation", async () => {
  const { interpolateYaw } = await import("../app/demo/fps/animation.ts");
  const before = Math.PI - 0.1, after = -Math.PI + 0.1;
  assert.ok(Math.abs(interpolateYaw(before, after, 0.5) - Math.PI) < 1e-10);
  assert.ok(Math.abs(interpolateYaw(after, before, 0.5) + Math.PI) < 1e-10);
  assert.equal(interpolateYaw(0, 1, 0), 0);
  assert.equal(interpolateYaw(0, 1, 1), 1);
});

test("authority validates sequenced commands and expires disconnected input", async () => {
  const server = new MatchAuthority(317, [0, 1]);
  const packet = { sequence: 1, command: { ...idleCommand(), forward: 500, jump: true, yaw: Math.PI } };
  assert.equal(server.submit(7, packet), false, "bots cannot be controlled through a player slot");
  assert.equal(server.submit(0, { ...packet, command: { ...packet.command, yaw: NaN } }), false);
  assert.equal(server.submit(0, packet), true);
  packet.command.forward = -500; // Sender does not own the server's command buffer.
  assert.equal(server.snapshot().acknowledged, -1);
  assert.equal(server.submit(0, packet), false, "duplicate ignored");
  assert.equal(server.submit(0, { ...packet, sequence: 0 }), false, "late command ignored");
  server.submit(1, { sequence: 0, command: { ...idleCommand(), forward: 1, yaw: Math.PI } });
  server.step();
  assert.equal(server.snapshot().acknowledged, 1);
  assert.ok(server.state.actors[0].z > -21);
  assert.ok(server.state.actors[1].z > -21, "second human slot uses movement commands");
  assert.ok(server.state.actors[0].y > 0);
  for (let i = 0; i < 60; i++) server.step();
  assert.equal(server.state.actors[0].y, 0, "jump edge is consumed once");
  assert.equal(server.state.actors[0].speed, 0, "missing commands stop movement");
});

test("snapshots are serializable, private-state-free and reuse isolated client buffers", async () => {
  const server = new MatchAuthority();
  server.submit(0, { sequence: 0, command: { ...idleCommand(), fire: true } });
  server.step();
  const view = server.snapshot(), actor = view.actors[0], shots = view.shots;
  assert.ok(view.shots.length > 0);
  const x = server.state.actors[0].x, shotX = server.state.shots[0].from[0];
  view.actors[0].x = 12345;
  view.shots[0].from[0] = 54321;
  assert.equal(server.state.actors[0].x, x);
  assert.equal(server.state.shots[0].from[0], shotX);
  server.snapshot(view);
  assert.equal(view.actors[0], actor);
  assert.equal(view.shots, shots);
  assert.equal(view.actors[0].x, x);
  assert.equal(view.shots[0].from[0], shotX);
  assert.equal("route" in actor, false);
  assert.equal("seed" in view, false);
  assert.equal("targetId" in actor, false);
  assert.deepEqual(JSON.parse(JSON.stringify(view)), server.snapshot(emptySnapshot()));
});

test("local client advances independently of render rate with bounded catch-up", async () => {
  const { LocalSession } = await import("../app/demo/fps/session.ts");
  const fast = new LocalSession(), slow = new LocalSession();
  const commandA = { ...idleCommand(), forward: 1, yaw: Math.PI }, commandB = { ...commandA };
  const actor = fast.state.actors[0], previous = fast.previous.actors[0];
  for (let i = 0; i < 240; i++) fast.advance(1 / 120, commandA, true);
  for (let i = 0; i < 60; i++) slow.advance(1 / 30, commandB, true);
  assert.deepEqual(fast.state, slow.state);
  assert.equal(fast.state.actors[0], actor);
  assert.equal(fast.previous.actors[0], previous);
  assert.notEqual(actor, previous);
  assert.equal(fast.state.tick - fast.previous.tick, 1);
  const tick = fast.state.tick;
  fast.advance(10, commandA, false);
  assert.equal(fast.state.tick, tick);
  fast.advance(10, commandA, true);
  assert.ok(fast.state.tick - tick <= 6, "stall cannot trigger unbounded work");
  assert.ok(fast.droppedTime >= 9.9);
  assert.ok(fast.alpha >= 0 && fast.alpha <= 1);
});

test("bot paths retain clearance around crate corners and finish after replanning", async () => {
  const { followRoute, walkableSegment } = await import("../app/demo/fps/fakeserver/bot/controller.ts");
  assert.equal(walkableSegment(-6, -17, -2, -13), false, "diagonal crosses cover");
  const corner = { x: -6, z: -17, route: [[-6, -13], [-2, -13]] };
  assert.deepEqual(followRoute(corner, corner.route), [-6, -13], "retain the blocking corner waypoint");
  for (const [x, z, tx, tz] of [[-6, -17, -1, -13], [-5, -9, 1, 5]]) {
    const actor = { x, z, route: [] };
    for (let tick = 0; tick < 1200; tick++) {
      if (tick % 45 === 0) routeTo(actor.x, actor.z, tx, tz, actor.route);
      const next = followRoute(actor, actor.route);
      if (!next) break;
      const dx = next[0] - actor.x, dz = next[1] - actor.z;
      const step = Math.min(3.1 / 60, Math.hypot(dx, dz));
      const length = Math.hypot(dx, dz);
      if (length) { actor.x += dx / length * step; actor.z += dz / length * step; }
      assert.equal(blocked(actor.x, actor.z), false, "path never clips the crate footprint");
    }
    assert.ok(Math.hypot(actor.x - tx, actor.z - tz) < 0.2, "bot reaches the destination");
  }
});

test("sound cues deduplicate all shooters and footsteps share animation contacts for local and remote actors", async () => {
  const { SoundCues } = await import("../app/demo/fps/audio.ts");

  const state = new MatchAuthority().snapshot(), cues = new SoundCues(), heard = [];
  const emit = cue => heard.push(cue);
  cues.update(state, true, emit);
  state.tick++;
  state.shots.push(...[0, 3, 5].map(shooter => ({ shooter, tick: 1, age: .08, from: [shooter, 1.5, 2], to: [0,0,0], hit: false, team: 0 })));
  cues.update(state, true, emit);
  assert.equal(heard.filter(c => c.kind === 'shot').length, 3, 'older shots and bots are audible');
  state.tick++; cues.update(state, true, emit);
  assert.equal(heard.length, 3, 'snapshot repetition never repeats a shot');
  for (let i = 0; i < 30; i++) {
    state.tick++; state.actors[0].x += 4.6 / 60; state.actors[0].speed = 4.6;
    advanceGait(state.actors[0].gait, 4.6, 1/60);
    cues.update(state, true, emit);
  }
  assert.equal(heard.filter(c => c.kind === 'step').length, 1);
  state.tick++; state.actors[0].y = 1; state.actors[0].x += 1.2;
  cues.update(state, true, emit);
  state.tick++; state.actors[0].y = 0; state.actors[0].x += 10; state.actors[0].deaths++;
  cues.update(state, true, emit);
  state.tick++; state.actors[0].x += 1.2;
  cues.update(state, false, emit);
  assert.equal(heard.filter(c => c.kind === 'step').length, 1, 'airborne travel, respawn and pause are silent');
  const next = new MatchAuthority().snapshot();
  next.shots.push({shooter: 0, tick: 0, age: 0, from: [0,1,0], to:[0,0,0], team:0, hit:false});
  cues.update(next, true, emit);
  assert.equal(heard.filter(c => c.kind === 'shot').length, 4, 'new match can reuse shot tick ids');
  const stepsAt = (speed, ticksPerFrame) => {
    const state = new MatchAuthority().snapshot(), cursor = new SoundCues();
    let steps = 0;
    const count = cue => { if (cue.kind === 'step') steps++; };
    cursor.update(state, true, count);
    for (let tick = ticksPerFrame; tick <= 600; tick += ticksPerFrame) {
      state.tick = tick;
      state.actors[0].speed = speed;
      state.actors[0].x += speed * ticksPerFrame / 60;
      advanceGait(state.actors[0].gait, speed, ticksPerFrame / 60);
      cursor.update(state, true, count);
    }
    return steps;
  };
  assert.equal(stepsAt(0, 1), 0);
  assert.ok(stepsAt(2.7, 1) >= 11 && stepsAt(2.7, 1) <= 12);
  assert.ok(stepsAt(4.6, 1) >= 19 && stepsAt(4.6, 1) <= 20, 'walking is about two contacts per second');
  assert.ok(stepsAt(7, 1) >= 31 && stepsAt(7, 1) <= 32, 'sprinting is about three contacts per second');
  assert.equal(stepsAt(4.6, 1), stepsAt(4.6, 3), 'render cadence does not change footsteps');

  const synced = new MatchAuthority().snapshot(), shared = new SoundCues();
  shared.update(synced, true, () => {});
  for (let frame = 0; frame < 720; frame++) {
    // Include render frames between simulation ticks, speed changes and pauses.
    synced.tick = Math.floor(frame / 2) + 1;
    const speed = frame < 240 ? 4.6 : frame < 480 ? 7 : 2.7;
    for (const actor of synced.actors) { actor.speed = speed; if (frame < 600) advanceGait(actor.gait, speed, 1/120); }
    const contacts = [];
    shared.update(synced, frame < 600, cue => contacts.push(cue));
    assert.ok(contacts.length === 0 || contacts.length === synced.actors.length, "everyone strikes on the same render frame at the same speed");
    for (const actor of synced.actors)
      assert.equal(shared.locomotion(actor.id).phase, shared.locomotion(0).phase);
    if (frame >= 600) assert.equal(contacts.length, 0);
  }

});

test("sound occlusion respects doorways, walls, cover and building volumes", async () => {
  const { soundEnvironment, audioRoom } = await import("../app/demo/fps/audio.ts");
  const shot = (x, y, z) => ({ kind: 'shot', x, y, z, local: false });
  const open = soundEnvironment(shot(-13, 1.5, -20), { x: -13, y: 1.5, z: -12 });
  assert.equal(open.occlusion, 0, 'open doorway transmits direct sound');
  const wall = soundEnvironment(shot(-17, 1.5, -20), { x: -17, y: 1.5, z: -12 });
  assert.equal(wall.occlusion, 1);
  assert.ok(wall.gain < .4 && wall.cutoff < 1200);
  const step = soundEnvironment({ ...shot(-17, .1, -20), kind: 'step' }, { x: -17, y: 1.5, z: -12 });
  assert.ok(step.cutoff < wall.cutoff, 'footsteps are more heavily muffled');
  assert.equal(soundEnvironment(shot(-2, 1.5, -9), { x: -2, y: 1.5, z: 5 }).occlusion, 1, 'cargo blocks sound');
  assert.equal(soundEnvironment({ ...shot(-17, 1.5, -20), local: true }, { x: -17, y: 1.5, z: -12 }).occlusion, 0);
  assert.equal(audioRoom({ x: -13, y: 1.5, z: -8 }), 0);
  assert.equal(audioRoom({ x: 13, y: 1.5, z: 8 }), 1);
  assert.equal(audioRoom({ x: 0, y: 1.5, z: 8 }), -1);
  assert.equal(audioRoom({ x: -13, y: 5, z: 8 }), -1, 'above the roof is outside');
  assert.equal(soundEnvironment(shot(-13, 1.5, -8), { x: -13, y: 1.5, z: -10 }).room, 0);
});

test("external FBXs bind both rigs, preserve lowered poses and play one-shot actions", async () => {
  const { readFileSync } = await import("node:fs");
  const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
  const { clone } = await import("three/examples/jsm/utils/SkeletonUtils.js");
  const { EXTRA_ANIMATIONS, LocomotionPlayer, retargetLocomotion } = await import("../app/demo/fps/animation.ts");
  const remilio = await loadRig("pockit-remilio"), milady = await loadRig("pockit-milady");
  const extras = EXTRA_ANIMATIONS.map(name => {
    const b = readFileSync(new URL(`../public/models/fps/animations/${name}.fbx`, import.meta.url));
    const rig = new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), "");
    const clip = rig.animations[0].clone(); clip.name = name;
    for (const track of clip.tracks) assert.ok(remilio.scene.getObjectByName(track.name.slice(0, track.name.lastIndexOf('.'))), track.name);
    return clip;
  });
  for (const target of [remilio, milady]) {
    const clips = [...remilio.animations, ...extras].map(c => target === remilio ? c : retargetLocomotion(remilio.scene, target.scene, c, c.name, extras.includes(c)));
    const root = clone(target.scene), player = new LocomotionPlayer(root, clips), hip = root.getObjectByName('mixamorigHips');
    const pose = { hp: 100, respawn: 0, crouching: false, aiming: false, throwing: 0 };
    for (let i = 0; i < 10; i++) player.update(0, .05, undefined, pose);
    const { Vector3 } = await import("three");
    const height = () => { root.updateMatrixWorld(true); return hip.getWorldPosition(new Vector3()).y; };
    const standing = height();
    pose.crouching = true;
    for (let i = 0; i < 10; i++) player.update(0, .05, undefined, pose);
    assert.ok(height() < standing * .8, 'crouch keeps its authored height on either rig');
    pose.aiming = true;
    for (let i = 0; i < 10; i++) player.update(0, .05, undefined, pose);
    pose.throwing = 1.4;
    player.update(0, .05, undefined, pose);
    assert.ok(Math.abs(player.mixer.clipAction(clips.find(c => c.name === 'throw')).time - .8) < 1e-5);
    pose.hp = 0; pose.respawn = .1;
    for (let i = 0; i < 10; i++) player.update(0, .05, undefined, pose);
    const action = player.mixer.clipAction(clips.find(c => c.name === 'death'));
    assert.ok(action.time > action.getClip().duration - .01, 'death holds its final pose until respawn');
    root.updateMatrixWorld(true);
    root.traverse(o => assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
    pose.hp = 100; pose.throwing = 0; pose.crouching = false;
    for (let i = 0; i < 10; i++) player.update(0, .05, undefined, pose);
    assert.ok(Math.abs(height() - standing) < Math.abs(standing) * .1, `respawn restores standing (${target === remilio ? 'remilio' : 'milady'} ${hip.position.y}/${standing})`);
    player.dispose();
  }
});

test("crouch and grenade commands survive authority, release once and explode behind cover", async () => {
  const { idleCommand } = await import("../app/demo/fps/fakeserver/match.ts");
  const authority = new MatchAuthority(317, [0,1,2,3,4,5,6,7]);
  const a = authority.state.actors[0]; a.x = 0; a.z = 0;
  const command = { ...idleCommand(), crouch: true, aim: true, grenade: true, forward: 1 };
  authority.submit(0, {sequence: 0, command}); authority.step();
  assert.ok(a.crouching); assert.equal(a.aiming, false, "throwing overrides aim intent"); assert.equal(a.grenades, 1);
  assert.ok(Math.abs(a.speed - 1.8) < 1e-6);
  assert.equal(authority.snapshot().actors[0].crouching, true);
  for (let i = 0; i < 45; i++) authority.step();
  assert.equal(authority.state.grenades.length, 0, 'windup does not release early');
  for (let i = 0; i < 5; i++) authority.step();
  assert.equal(authority.state.grenades.length, 1);
  const snapshot = authority.snapshot(), copied = copySnapshot(snapshot, emptySnapshot());
  copied.grenades[0].x += 10; assert.notEqual(snapshot.grenades[0].x, copied.grenades[0].x);
  const g = authority.state.grenades[0];
  Object.assign(g, {x: 0, y: 1, z: 23.8, vx: 0, vy: 0, vz: 120});
  authority.step();
  assert.ok(g.z < 24.5 && g.vz < 0, 'swept grenade collision bounces off a wall even at high speed');
  // A grounded blast near a boundary keeps a teammate safe and damages an enemy.
  g.x = 0; g.y = .09; g.z = 23; g.vx = g.vy = g.vz = 0; g.fuse = .001;
  const friend = authority.state.actors[1], enemy = authority.state.actors[4], covered = authority.state.actors[5];
  Object.assign(friend, {x: .2, y: 0, z: 23, shield: 0});
  Object.assign(enemy, {x: .2, y: 0, z: 23, shield: 0});
  Object.assign(covered, {x: 0, y: 0, z: 26, shield: 0});
  authority.step();
  assert.equal(friend.hp, 100); assert.equal(enemy.hp, 0); assert.equal(covered.hp, 100);
  assert.equal(enemy.lastKiller, a.id, "grenade kills retain authoritative attribution for killcam");
  assert.equal(authority.state.explosions.length, 1);
  for (let i = 0; i < 170; i++) authority.step();
  assert.equal(authority.state.grenades.length, 0, 'one input never repeats a throw');
  assert.equal(a.grenades, 1);
});

test("authoritative impacts identify surfaces and actors, replicate, and sound once at the endpoint", async () => {
  const { SoundCues, soundEnvironment } = await import("../app/demo/fps/audio.ts");
  const m = createMatch(); m.actors.forEach(a => a.hp = 0);
  const a = m.actors[0]; Object.assign(a, {hp:100, x:-17, z:-20});
  fire(m, a, Math.PI, 0);
  assert.equal(m.shots.at(-1).impact, 'concrete');
  const wallShot = m.shots.at(-1);
  const state = copySnapshot(m, emptySnapshot()), cues = new SoundCues(), heard = [];
  cues.update(state, true, cue => heard.push(cue));
  cues.update(state, true, cue => heard.push(cue));
  assert.deepEqual(heard.map(c => c.kind), ['shot', 'impact']);
  assert.ok(Math.hypot(heard[1].x-wallShot.to[0], heard[1].y-wallShot.to[1], heard[1].z-wallShot.to[2]) < .03);
  assert.equal(soundEnvironment(heard[1], {x:a.x,y:1.5,z:a.z}).occlusion, 0, 'front of hit wall does not muffle itself');
  Object.assign(a,{x:0,z:20,cooldown:0}); m.tick++;
  fire(m,a,0,-Math.PI/2);
  assert.equal(m.shots.at(-1).impact,'ground');
  assert.ok(Math.abs(m.shots.at(-1).to[1]) < 1e-6);
  a.cooldown=0; m.tick++;
  fire(m,a,0,Math.PI/2);
  assert.equal(m.shots.at(-1).impact,'none','sky does not invent an impact at maximum range');
  Object.assign(a,{x:-13,z:-20,cooldown:0});
  const b=m.actors[4]; Object.assign(b,{hp:100,shield:0,x:-13,z:-12}); m.tick++;
  fire(m,a,Math.PI,0);
  assert.equal(m.shots.at(-1).impact,'body'); assert.equal(m.shots.at(-1).victim,4);
  copySnapshot(m,state); assert.equal(state.shots.at(-1).victim,4);
  // An incoming shot is a local-priority body sound, not a sound at its shooter's muzzle.
  Object.assign(a,{shield:0,hp:100}); Object.assign(b,{cooldown:0}); m.tick++;
  fire(m,b,0,0);
  copySnapshot(m,state); cues.update(state,true,cue=>heard.push(cue));
  assert.ok(heard.some(c=>c.kind==='impact' && c.material==='body' && c.local));
  const before=heard.length; cues.update(state,true,cue=>heard.push(cue)); assert.equal(heard.length,before);
  const { blocks } = await import("../app/demo/fps/fakeserver/match.ts");
  const crate = blocks.find(block => block.kind === 'crate');
  m.actors.forEach(actor => actor.hp = 0);
  Object.assign(a,{hp:100,cooldown:0,x:crate.p[0],y:crate.p[1]-1.5,z:crate.p[2]+crate.size[2]/2+1});
  m.tick++; fire(m,a,0,0);
  assert.equal(m.shots.at(-1).impact,'metal');
  copySnapshot(m,state); const silent=[];
  cues.update(state,false,c=>silent.push(c)); cues.update(state,true,c=>silent.push(c));
  assert.equal(silent.length,0,'paused impacts are consumed without replay on resume');
});

test("audio listener orientation matches the camera and reverses left/right when turning", async () => {
  const { SpatialAudio } = await import("../app/demo/fps/audio.ts");
  const { Vector3, Euler } = await import("three");
  const listener=Object.fromEntries(['positionX','positionY','positionZ','forwardX','forwardY','forwardZ','upX','upY','upZ'].map(k=>[k,{value:0,setValueAtTime(value){this.value=value;}}]));
  const audio=new SpatialAudio(); audio.context={state:'running',currentTime:0,listener};
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]) for(const pitch of [0,.6,-.6]){
    audio.listener(0,1.5,0,yaw,pitch);
    const forward=new Vector3(listener.forwardX.value,listener.forwardY.value,listener.forwardZ.value);
    const up=new Vector3(listener.upX.value,listener.upY.value,listener.upZ.value);
    assert.ok(forward.distanceTo(new Vector3(0,0,-1).applyEuler(new Euler(pitch,yaw,0,'YXZ'))) < 1e-8);
    assert.ok(Math.abs(forward.dot(up))<1e-8);
    if(pitch===0 && (yaw===0||yaw===Math.PI))
      assert.ok(new Vector3().crossVectors(forward,up).dot(new Vector3(1,0,0)) * (yaw===0?1:-1) > .99);
  }
});

test("weapon recoil is authoritative, affects shot direction, recovers and resets on respawn", async () => {
  const authority = new MatchAuthority(317, [0,1,2,3,4,5,6,7]);
  const a = authority.state.actors[0];
  const command = { ...idleCommand(), fire: true, pitch: 0, recoilPitch: -100 };
  authority.submit(0,{sequence:0,command}); authority.step();
  assert.equal(a.recoilPitch,.009,'client-supplied recoil is ignored');
  assert.equal(authority.snapshot().actors[0].recoilPitch,a.recoilPitch);
  const first=a.recoilPitch;
  for(let i=1;i<=8;i++){authority.submit(0,{sequence:i,command}); authority.step();}
  assert.ok(a.recoilPitch > first,'held fire accumulates kick despite unchanged raw aim');
  const before=a.recoilPitch;
  authority.submit(0,{sequence:9,command:{...command,fire:false}});
  for(let i=0;i<60;i++) authority.step();
  assert.ok(a.recoilPitch < before * .04,'authority recovers kick without client updates');
  const m=createMatch(); m.actors.forEach(actor=>actor.hp=0);
  const shooter=m.actors[0]; Object.assign(shooter,{hp:100,x:0,z:20,recoilPitch:.05});
  fire(m,shooter,0,0);
  const shot=m.shots[0], horizontal=Math.hypot(shot.to[0]-shot.from[0],shot.to[2]-shot.from[2]);
  assert.ok(Math.abs(Math.atan2(shot.to[1]-shot.from[1],horizontal)-.05)<1e-8,'hit ray includes authoritative recoil');
  Object.assign(a,{hp:0,respawn:1/60,recoilPitch:.08}); authority.step();
  assert.equal(a.recoilPitch,0,'respawn clears weapon kick');
});

test("saved authority frames replay exact aim, gait and combat without live inputs or bot simulation", async () => {
  const { ReplaySession, createRecording } = await import("../app/demo/fps/session.ts");
  const { SoundCues } = await import("../app/demo/fps/audio.ts");
  const recording = createRecording();
  const server = new MatchAuthority(317, [0], frame => recording.frames.push(frame));
  for (let i=0;i<360;i++) {
    server.submit(0,{sequence:i,command:{...idleCommand(),yaw:Math.PI,pitch:Math.sin(i/40)*.4,
      forward:i<120?1:0,aim:i>60 && i<120,crouch:i>90 && i<150,fire:i%60<30,grenade:i===170}});
    server.step();
  }
  assert.equal(recording.frames.length,361,'capture every server tick, not HUD updates');
  const decoded=JSON.parse(JSON.stringify(recording));
  const replay = new ReplaySession(decoded);
  const first = JSON.stringify(recording.frames[0]);
  decoded.frames[0].actors[0].gait.phase=.987;
  assert.notEqual(replay.state.actors[0].gait.phase,.987,'playback owns its buffers');
  const hostileInput={...idleCommand(),pitch:-1,yaw:-2,fire:true,grenade:true,forward:-1};
  for(let i=1;i<recording.frames.length;i++) {
    replay.advance(1/60,hostileInput,true);
    const expected = copySnapshot(recording.frames[i],emptySnapshot(),recording.frames[i].acknowledged);
    assert.deepEqual(replay.state,expected,`saved outcome at tick ${i}`);
  }
  assert.ok(replay.finished); assert.equal(replay.predictLook,false);
  assert.equal(JSON.stringify(recording.frames[0]),first,'authority recording remains immutable');
  const expectedShots=new Set(recording.frames.flatMap(f=>f.shots.map(s=>`${s.shooter}:${s.tick}`)));
  const watch = dt => {
    const session=new ReplaySession(recording), cues=new SoundCues(); let shots=0,steps=0;
    const emit=c=>{if(c.kind==='shot')shots++;if(c.kind==='step')steps++;};
    cues.update(session.state,true,emit);
    let frames=0;
    while(!session.finished && frames++<2000){session.advance(dt,hostileInput,true);cues.update(session.state,true,emit);}
    assert.ok(session.finished);
    assert.equal(shots,expectedShots.size,'all shot events survive playback batching');
    return steps;
  };
  assert.equal(watch(1/120),watch(1/20),'footstep count survives render-rate changes');
  const paused=new ReplaySession(recording), before=JSON.stringify(paused.state);
  paused.advance(1,hostileInput,false); assert.equal(JSON.stringify(paused.state),before);
  assert.throws(()=>new ReplaySession({...recording,world:'other-map'}),/Unsupported/);
  assert.throws(()=>new ReplaySession({...recording,frames:[recording.frames[0],recording.frames[2]]}),/contiguous/);
});

test("authority resolves sprint, aim, crouch and fire consistently", async () => {
  const server=new MatchAuthority(317,[0,1,2,3,4,5,6,7]), a=server.state.actors[0];
  server.submit(0,{sequence:0,command:{...idleCommand(),forward:1,sprint:true,fire:true,aim:true}});
  server.step();
  assert.equal(a.ammo,29,'firing cancels sprint rather than silently blocking the shot');
  assert.ok(a.aiming); assert.ok(Math.abs(a.speed-2.7)<1e-8);
  server.submit(0,{sequence:1,command:{...idleCommand(),forward:1,sprint:true,crouch:true}});
  server.step(); assert.ok(a.crouching); assert.ok(Math.abs(a.speed-1.8)<1e-8);
});

test("killcam replays the authoritative killer while live simulation continues and respawns safely", async () => {
  const { KillcamSession } = await import("../app/demo/fps/session.ts");
  const session=new KillcamSession(317), input=idleCommand(); input.yaw=Math.PI;
  let ticks=0;
  while(!session.killcam && ticks++<18000) session.advance(1/60,input,true);
  assert.ok(session.killcam,'normal bot combat triggers a killcam');
  const deathTick=session.liveState.tick, killer=session.liveState.actors[0].lastKiller;
  assert.equal(session.viewActorId,killer); assert.notEqual(killer,0);
  assert.equal(session.predictLook,false); assert.equal(session.viewEpoch,1);
  assert.ok(session.state.tick < deathTick,'starts before the killing shot');
  const replayStart=session.state.tick, liveStart=session.liveState.tick;
  session.advance(1,input,false);
  assert.equal(session.state.tick,replayStart); assert.equal(session.liveState.tick,liveStart);
  const initialAmmo=session.liveState.actors[0].ammo, initialGrenades=session.liveState.actors[0].grenades;
  Object.assign(input,{fire:true,grenade:true,forward:1,yaw:-2,pitch:1});
  let shownDeath=false, replayTicks=0;
  while(session.killcam && replayTicks++<240){
    session.advance(1/60,input,true);
    if(session.killcam){
      assert.equal(session.liveState.actors[0].hp,0,'live respawn waits out the short replay');
      assert.equal(session.liveState.actors[0].ammo,initialAmmo);
      assert.equal(session.liveState.actors[0].grenades,initialGrenades);
      if(session.state.actors[0].hp===0) shownDeath=true;
    }
  }
  assert.ok(shownDeath,'replay includes the lethal outcome');
  assert.ok(session.liveState.tick > deathTick+120,'authority kept advancing');
  assert.equal(session.viewActorId,0); assert.equal(session.predictLook,true); assert.equal(session.viewEpoch,2);
  assert.equal(input.fire,false); assert.equal(input.grenade,false); assert.equal(input.forward,0);
  while(session.liveState.actors[0].hp===0 && replayTicks++<300) session.advance(1/60,input,true);
  assert.equal(session.state.actors[0].hp,100); assert.equal(session.killcam,false);
});

test("viewpoint switches consume old audio events and prioritize the killer's sounds", async () => {
  const { SoundCues } = await import("../app/demo/fps/audio.ts");
  const snapshot=new MatchAuthority().snapshot(), cues=new SoundCues(), heard=[];
  snapshot.shots.push({shooter:4,tick:0,age:0,from:[0,1,0],to:[1,1,0],hit:false,impact:'none',victim:-1,team:1});
  cues.update(snapshot,true,c=>heard.push(c),4,1);
  assert.equal(heard.length,0,'switch does not replay events before the timeline start');
  snapshot.tick=1; snapshot.shots[0].tick=1;
  cues.update(snapshot,true,c=>heard.push(c),4,1);
  assert.equal(heard.length,1); assert.equal(heard[0].local,true);
  cues.update(snapshot,true,c=>heard.push(c),0,2);
  assert.equal(heard.length,1,'return to live does not replay sounds from the hidden match');
});

test("authored team spawns drive initial placement and respawn, including group transforms", async () => {
  const { mapPrefab, compileSpawnPoints } = await import("../app/demo/fps/shared/map.ts");
  const map = structuredClone(mapPrefab);
  const group = map.root.children.find(node => node.id === "spawn-points");
  group.components = { transform: { type: "Transform", properties: {
    position: [2, 0, 3], rotation: [0, Math.PI / 2, 0], scale: [2, 1, 1],
  } } };
  const points = compileSpawnPoints(map);
  const first = points[0];
  assert.ok(Math.abs(first.position[0] - -19) < 1e-8);
  assert.ok(Math.abs(first.position[2] - 12) < 1e-8);
  assert.ok(Math.abs(first.yaw + Math.PI / 2) < 1e-8);
  const match = createMatch(317, points);
  for (const actor of match.actors) {
    const point = points.filter(p => p.team === actor.team)[actor.id % 4];
    assert.deepEqual([actor.x, actor.y, actor.z], point.position);
    assert.equal(actor.yaw, point.yaw);
  }
  // Match owns its map data; later authoring mutations cannot alter a running match.
  points[0].position[0] = 999;
  const actor = match.actors[0];
  actor.hp = 0; actor.respawn = 0; actor.x = 100; actor.yaw = 0;
  stepRules(match, new Map(match.actors.map(a => [a.id, idleCommand()])), 1 / 60);
  assert.deepEqual([actor.x, actor.y, actor.z], match.spawnPoints[0].position);
  assert.equal(actor.yaw, match.spawnPoints[0].yaw);
  assert.equal(actor.hp, 100);
  group.children.filter(node => node.components.spawn.properties.team === "bravo")
    .forEach(node => { node.disabled = true; });
  assert.throws(() => compileSpawnPoints(map), /spawn point for team 1/);
});

test("bots react, pause between bursts and turn smoothly instead of instantly tracking", () => {
  const m = createMatch(3), a = m.actors[1], enemy = m.actors[4];
  m.actors.forEach(actor => { actor.hp = actor === a || actor === enemy ? 100 : 0; });
  Object.assign(a, { x: 0, z: -20, yaw: Math.PI, grenades: 0 });
  Object.assign(enemy, { x: 0, z: -12 });
  const bot = new BotController(10), twin = new BotController(10);
  const copy = structuredClone(m), other = copy.actors[1];
  let firing = 0, pausesAfterReaction = 0;
  for (let i = 0; i < 180; i++) {
    m.tick = copy.tick = i;
    const command = bot.command(m, a, 1 / 60);
    assert.deepEqual(command, twin.command(copy, other, 1 / 60));
    if (i < 20) assert.equal(command.fire, false, "no immediate reaction shot");
    if (command.fire) firing++;
    else if (i > 40) pausesAfterReaction++;
    const turn = Math.atan2(Math.sin(command.yaw - a.yaw), Math.cos(command.yaw - a.yaw));
    assert.ok(Math.abs(turn) <= 3.5 / 60 + 1e-9);
    a.yaw = other.yaw = command.yaw; a.pitch = other.pitch = command.pitch;
  }
  assert.ok(firing > 20 && firing < 90, `short bursts, got ${firing} firing ticks`);
  assert.ok(pausesAfterReaction > 40, "rest between bursts");
  enemy.x = 3;
  const before = a.yaw;
  const command = bot.command(m, a, 1 / 60);
  assert.ok(Math.abs(Math.atan2(Math.sin(command.yaw - before), Math.cos(command.yaw - before))) < 0.06);
});

test("bot scoping cannot oscillate when crouching blocks its own view behind low cover", () => {
  const m = createMatch(), actor = m.actors[4], enemy = m.actors[0];
  m.actors.forEach(a => { a.hp = a === actor || a === enemy ? 100 : 0; });
  Object.assign(actor, { x: -4, z: -17, yaw: Math.PI, grenades: 0 });
  Object.assign(enemy, { x: -4, z: -3 });
  const bot = new BotController(5);
  // Freeze translation to isolate the eye-height feedback loop at the 1.4 m crate.
  const stance = () => {
    const previous = [actor.crouching, actor.aiming, actor.crouchAmount, actor.aimAmount];
    const command = bot.command(m, actor, 1 / 60);
    assert.deepEqual([actor.crouching, actor.aiming, actor.crouchAmount, actor.aimAmount], previous,
      'bot chooses intent without writing resolved stance');
    actor.crouching = command.crouch;
    actor.yaw = command.yaw; actor.pitch = command.pitch;
    return command;
  };
  for (let tick = 0; tick < 60; tick++) {
    m.tick = tick;
    assert.equal(stance().crouch, false, 'stay standing when crouch height cannot see over cover');
  }
  // In an open lane the same bot can still scope, without toggling at the old 10 m threshold.
  Object.assign(actor, { x: 0, z: -23 });
  Object.assign(enemy, { x: 0, z: -10 });
  assert.equal(stance().crouch, true);
  for (let tick = 60; tick < 90; tick++) {
    m.tick = tick; enemy.z = actor.z + (tick % 2 ? 9.9 : 10.1);
    assert.equal(stance().crouch, true, 'distance hysteresis preserves an established scope');
  }
  // The bot may withdraw stance intent immediately; only shared rules own transition timing.
  Object.assign(enemy, { x: -2, z: 5 });
  m.tick = 91;
  const obscured = stance();
  assert.equal(obscured.crouch, false);
  assert.equal(obscured.fire, false);
  for (let tick = 92; tick < 120; tick++) { m.tick = tick; stance(); }
  assert.equal(actor.crouching, false, 'sustained occlusion releases the stance');
});

test("authority commits stance transitions, replicates progress and gates jump/sprint", async () => {
  const { STEP, eyeHeight, STANCE_TIMING } = await import("../app/demo/fps/fakeserver/match.ts");
  const { ReplaySession, createRecording } = await import("../app/demo/fps/session.ts");
  const m = createMatch(), actor = m.actors[0];
  const commands = new Map(m.actors.map(a => [a.id, idleCommand()]));
  const input = commands.get(0);
  input.crouch = true;
  stepRules(m, commands);
  assert.ok(actor.crouching && actor.crouchAmount > 0 && actor.crouchAmount < 1);
  assert.ok(eyeHeight(actor) < 1.5 && eyeHeight(actor) > .95);
  const saved = copySnapshot(m, emptySnapshot());
  const replay = new ReplaySession({ ...createRecording(), frames: [saved] });
  assert.equal(replay.state.actors[0].crouchAmount, actor.crouchAmount);
  assert.equal(eyeHeight(replay.state.actors[0]), eyeHeight(actor));
  input.crouch = false;
  for (let i = 1; i < Math.ceil(STANCE_TIMING.crouch / STEP); i++) {
    stepRules(m, commands);
    assert.equal(actor.crouching, true, 'release cannot reverse a half-finished crouch');
  }
  assert.equal(actor.crouchAmount, 1);
  input.jump = input.sprint = true; input.forward = 1;
  stepRules(m, commands);
  assert.equal(actor.crouching, false);
  assert.ok(actor.crouchAmount > 0 && actor.crouchAmount < 1);
  assert.equal(actor.y, 0, 'cannot jump while still standing up');
  assert.ok(actor.speed <= 1.8 + 1e-8, 'cannot sprint while still standing up');
  input.jump = input.sprint = false; input.forward = 0;
  while (actor.crouchAmount > 0) stepRules(m, commands);
  input.aim = true;
  stepRules(m, commands);
  assert.ok(actor.aiming && actor.aimAmount > 0 && actor.aimAmount < 1);
  input.aim = false;
  stepRules(m, commands);
  assert.equal(actor.aiming, true, 'scope cannot reverse mid-transition');
  assert.equal(copySnapshot(m, emptySnapshot()).actors[0].aimAmount, actor.aimAmount);
  input.reload = true; actor.ammo = 20;
  stepRules(m, commands);
  assert.equal(actor.aiming, false, 'reload can interrupt aim immediately');
  input.reload = false; input.forward = 1; input.sprint = true;
  assert.ok(actor.aimAmount > 0);
  stepRules(m, commands);
  if (actor.aimAmount > 0) assert.ok(Math.abs(actor.speed - 2.7) < 1e-8, 'aim-out still limits movement');
  while (actor.aimAmount > 0) stepRules(m, commands);
  stepRules(m, commands);
  assert.ok(actor.reload > 0);
  assert.ok(Math.abs(actor.speed - 4.6) < 1e-8, 'reload allows walking but blocks sprint');
});

test("health regenerates only after damage-free delay, resets on hits and never heals dead actors", async () => {
  const { HEALTH_RULES, STEP } = await import("../app/demo/fps/fakeserver/match.ts");
  const { ReplaySession, createRecording } = await import("../app/demo/fps/session.ts");
  const m = createMatch(), shooter = m.actors[0], victim = m.actors[4];
  Object.assign(shooter, { x: 0, z: -20, shield: 0 });
  Object.assign(victim, { x: 0, z: -15, shield: 0 });
  const commands = new Map(m.actors.map(a => [a.id, idleCommand()]));
  fire(m, shooter, Math.PI, -0.08);
  const recording = createRecording();
  const record = () => recording.frames.push(copySnapshot(m, emptySnapshot()));
  const advance = () => { stepRules(m, commands); record(); };
  record();
  const wounded = victim.hp;
  assert.ok(wounded > 0 && wounded < 100);
  const dead = m.actors[1]; dead.hp = 0; dead.respawn = 30;
  for (let i = 0; i < HEALTH_RULES.regenDelay / STEP; i++) advance();
  assert.equal(victim.hp, wounded, 'no recovery during delay');
  for (let i = 0; i < 60; i++) advance();
  assert.ok(Math.abs(victim.hp - Math.min(100, wounded + HEALTH_RULES.regenPerSecond)) < 1e-8);
  fire(m, shooter, Math.PI, -0.08);
  const hitAgain = victim.hp;
  assert.ok(hitAgain < wounded + HEALTH_RULES.regenPerSecond);
  for (let i = 0; i < 299; i++) advance();
  assert.equal(victim.hp, hitAgain, 'new damage restarts the full delay');
  for (let i = 0; i < 300; i++) advance();
  assert.equal(victim.hp, 100, 'recovery caps at full health');
  assert.equal(dead.hp, 0, 'death does not regenerate');
  const replay = new ReplaySession(recording);
  victim.hp = 0; // Replay must not depend on the still-mutable live simulation.
  for (let i = 0; i < recording.frames.length; i++) {
    if (i) replay.advance(STEP, { ...idleCommand(), fire: true }, true);
    assert.deepEqual(replay.state.actors.map(a => [a.hp, a.deaths, a.shield]),
      recording.frames[i].actors.map(a => [a.hp, a.deaths, a.shield]), 'replays every damage and recovery tick exactly');
  }
});

test("damage eligibility and lethal bookkeeping are identical for human and bot slots", async () => {
  const { applyDamage, HEALTH_RULES } = await import("../app/demo/fps/fakeserver/match.ts");
  for (const victimId of [0, 4]) {
    const m = createMatch(), victim = m.actors[victimId], source = m.actors[victimId === 0 ? 4 : 0];
    const teammate = m.actors[victimId + 1];
    m.tick = 30;
    assert.equal(applyDamage(m, source, victim, 40), 0, 'spawn shield protects either slot');
    victim.shield = 0;
    assert.equal(applyDamage(m, teammate, victim, 40), 0, 'friendly damage is ignored');
    for (const amount of [0, -20, NaN, Infinity]) assert.equal(applyDamage(m, source, victim, amount), 0);
    assert.equal(victim.lastDamageTick, 0, 'rejected damage does not postpone recovery');
    assert.equal(applyDamage(m, source, victim, 34), 34);
    assert.equal(victim.hp, 66); assert.equal(victim.lastDamageTick, 30);
    assert.equal(applyDamage(m, source, victim, 500), 66, 'reports actual health removed');
    assert.equal(victim.respawn, HEALTH_RULES.respawnDelay);
    assert.equal(victim.lastKiller, source.id); assert.equal(victim.deaths, 1);
    assert.equal(source.kills, 1); assert.equal(m.scores[source.team], 1);
    assert.equal(applyDamage(m, source, victim, 500), 0);
    assert.equal(victim.deaths, 1); assert.equal(source.kills, 1); assert.equal(m.feed.length, 1);
    source.shield = 0;
    assert.equal(applyDamage(m, source, source, 100), 100, 'self-damage uses the same path');
    assert.equal(source.deaths, 1); assert.equal(source.kills, 1); assert.equal(m.scores[source.team], 1);
  }
});


test("bot intent never mutates the world and follows the same authority path as human packets", async () => {
  const bots = new MatchAuthority(317, []);
  const humans = new MatchAuthority(317, [0, 1, 2, 3, 4, 5, 6, 7]);
  const controllers = humans.state.actors.map(a => new BotController(317 + a.id * 7919));
  const buffers = [];
  for (let tick = 0; tick < 1200; tick++) {
    const before = structuredClone(humans.state);
    for (const actor of humans.state.actors) {
      const command = controllers[actor.id].command(humans.state, actor, 1 / 60);
      if (tick === 0) buffers[actor.id] = command;
      assert.equal(command, buffers[actor.id], "controllers retain their command buffers");
      assert.equal(humans.submit(actor.id, { sequence: tick, command }), true);
    }
    assert.deepEqual(humans.state, before, "controllers only produce input");
    bots.step(); humans.step();
    assert.deepEqual(humans.state, bots.state, "input source cannot change gameplay results");
  }
});


test("self-kill respawn resets predicted look and queued actions without a killcam", async () => {
  const { KillcamSession } = await import("../app/demo/fps/session.ts");
  const session = new KillcamSession(317);
  const input = { ...idleCommand(), yaw: 0.7, pitch: -1.4, grenade: true };
  let ticks = 0;
  while (session.liveState.actors[0].hp > 0 && ticks++ < 600) {
    if (ticks === 150) input.grenade = true;
    session.advance(1 / 60, input, true);
  }
  assert.equal(session.liveState.actors[0].lastKiller, 0, "grenades at own feet cause self-kill");
  assert.equal(session.killcam, false);
  Object.assign(input, { yaw: -2, pitch: 1, fire: true, grenade: true, jump: true, forward: 1 });
  while (session.liveState.actors[0].hp === 0 && ticks++ < 900)
    session.advance(0.1, input, true);
  const actor = session.liveState.actors[0];
  assert.ok(actor.hp > 0);
  const { spawnPoints } = await import("../app/demo/fps/shared/map.ts");
  assert.equal(actor.yaw, spawnPoints.find(point => point.team === actor.team).yaw,
    "catch-up ticks preserve the authored spawn facing");
  assert.deepEqual(input, { ...idleCommand(), yaw: actor.yaw, pitch: actor.pitch });
});


test("a nonzero local player slot matches a standalone authority across serialized packets", async () => {
  const { LocalSession, KillcamSession } = await import("../app/demo/fps/session.ts");
  const playerId = 4;
  const client = new LocalSession(317, undefined, playerId);
  const server = new MatchAuthority(317, [playerId]);
  const input = { ...idleCommand(), yaw: 0, forward: 0.2 };
  for (let sequence = 0; sequence < 120; sequence++) {
    server.submit(playerId, JSON.parse(JSON.stringify({ sequence, command: input })));
    server.step();
    client.advance(1 / 60, input, true);
    const received = JSON.parse(JSON.stringify(server.snapshot(emptySnapshot(), playerId)));
    assert.deepEqual(client.state, received);
    assert.equal(client.state.acknowledged, sequence);
  }
  assert.equal(client.viewActorId, playerId);
  const killcam = new KillcamSession(317, playerId);
  assert.equal(killcam.viewActorId, playerId);
  assert.equal(killcam.liveState.actors.find(actor => actor.id === playerId).team, 1);
});


test("loopback exposes only input/snapshot operations and never shares server objects", async () => {
  const { connectLocalMatch } = await import("../app/demo/fps/fakeserver/authority.ts");
  const { LocalSession } = await import("../app/demo/fps/session.ts");
  const connection = connectLocalMatch(317, 0, frame => {
    // Even the recording consumer owns a copy, not the live world.
    frame.actors[0].hp = -999;
    frame.actors[0].gait.steps = -999;
    frame.scores[0] = 999;
  });
  const control = connectLocalMatch(317, 0);
  assert.deepEqual(Object.keys(connection).sort(), ["exchange", "readSnapshot"]);
  assert.equal("authority" in new LocalSession(), false);
  const actual = emptySnapshot(), expected = emptySnapshot();
  const packet = { sequence: 0, command: { ...idleCommand(), fire: true } };
  connection.exchange(packet, actual); control.exchange(packet, expected);
  assert.deepEqual(actual, expected);
  actual.actors[0].hp = -1; actual.actors[0].x = 999;
  actual.actors[0].gait.steps = 999; actual.scores[0] = 999;
  actual.shots[0].from[0] = 999;
  actual.feed.push("client wrote this");
  packet.command.fire = false;
  connection.readSnapshot(actual);
  assert.deepEqual(actual, expected, "all published nested values are isolated from authority");
  const next = { sequence: 1, command: idleCommand() };
  connection.exchange(next, actual); control.exchange(next, expected);
  assert.deepEqual(actual, expected, "client mutations cannot affect subsequent simulation");
});

test("snapshot contract excludes private fields on all event types and nested gait state", () => {
  const server = new MatchAuthority();
  server.submit(0, { sequence: 0, command: { ...idleCommand(), fire: true } });
  server.step();
  const source = server.state;
  source.grenades.push({ id: 1, owner: 0, x: 1, y: 1, z: 1, vx: 0, vy: 0, vz: 0, fuse: 2 });
  source.explosions.push({ id: 2, x: 1, y: 1, z: 1, age: 0 });
  const entries = state => [state.actors[0], state.actors[0].gait, state.shots[0], state.grenades[0], state.explosions[0]];
  for (const entry of entries(source)) entry.serverOnly = { secret: "not part of the protocol" };
  const view = emptySnapshot();
  for (let pass = 0; pass < 2; pass++) {
    server.snapshot(view);
    for (const entry of entries(view)) assert.equal("serverOnly" in entry, false);
  }
});
