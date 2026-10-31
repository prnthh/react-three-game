/** Client sessions and the single-player loopback host. Replays never invoke authority. */
import { connectLocalMatch } from "./fakeserver/authority";
import { idleCommand, STEP, copySnapshot, emptySnapshot, type Command, type CommandPacket, type MatchSnapshot, type LocalMatchConnection } from "./shared/protocol";

/** Scene-facing contract; a network client can supply this without exposing its authority. */
export interface ClientSession {
  readonly state: MatchSnapshot;
  readonly previous: MatchSnapshot;
  readonly alpha: number;
  readonly predictLook?: boolean;
  readonly viewActorId?: number;
  readonly viewEpoch?: number;
  advance(dt: number, input: Command, playing: boolean, maxFrameDelta?: number): void;
}

/** Local loopback uses exactly the command/snapshot boundary a transport can replace. */
export class LocalSession implements ClientSession {
  readonly predictLook = true;
  readonly #connection: LocalMatchConnection;
  readonly state = emptySnapshot();
  readonly previous = emptySnapshot();
  alpha = 1;
  droppedTime = 0;
  private accumulator = 0;
  private sequence = 0;
  private readonly packet: CommandPacket = { sequence: 0, command: idleCommand() };
  constructor(seed = 317, saveFrame?: (frame: MatchSnapshot) => void, readonly viewActorId = 0) {
    this.#connection = connectLocalMatch(seed, viewActorId, saveFrame);
    this.#connection.readSnapshot(this.state);
    copySnapshot(this.state, this.previous);
  }
  advance(dt: number, input: Command, playing: boolean, maxFrameDelta = 0.1) {
    if (!playing || this.state.winner !== null) {
      this.accumulator = 0; this.alpha = 1; return;
    }
    if (!Number.isFinite(dt) || dt < 0) return;
    const budget = Math.min(0.25, Math.max(STEP, Number.isFinite(maxFrameDelta) ? maxFrameDelta : 0.1));
    this.droppedTime += Math.max(0, dt - budget);
    this.accumulator += Math.min(dt, budget);
    while (this.accumulator >= STEP && this.state.winner === null) {
      copySnapshot(this.state, this.previous, this.state.acknowledged);
      this.packet.sequence = this.sequence++;
      Object.assign(this.packet.command, input);
      this.#connection.exchange(this.packet, this.state);
      const player = this.state.actors.find(actor => actor.id === this.viewActorId)!;
      if (this.previous.actors.find(actor => actor.id === this.viewActorId)!.hp <= 0 && player.hp > 0) {
        // Reset before the next catch-up tick can submit pre-death look/actions.
        Object.assign(input, idleCommand(), { yaw: player.yaw, pitch: player.pitch });
      }
      input.jump = input.reload = input.grenade = false;
      this.accumulator -= STEP;
    }
    this.alpha = this.state.winner === null ? this.accumulator / STEP : 1;
  }
}


/** Version the authored world as well as the snapshot schema. No AI or RNG replay required. */
export type MatchRecording = { version: 1; world: "relay-yard-v1"; step: number; frames: MatchSnapshot[] };
export const createRecording = (): MatchRecording => ({ version: 1, world: "relay-yard-v1", step: STEP, frames: [] });

/** Plays saved authoritative results through the existing scene-facing interface.
 * A streaming/file sink can replace the in-memory recording without touching rules.
 * No seeking yet: sequential playback preserves animation and event cursors.
 */
export class ReplaySession implements ClientSession {
  readonly predictLook = false;
  readonly state = emptySnapshot();
  readonly previous = emptySnapshot();
  alpha = 1;
  private index = 0;
  private accumulator = 0;
  private readonly frames: MatchSnapshot[];
  constructor(recording: MatchRecording) {
    if (recording.version !== 1 || recording.world !== "relay-yard-v1" || recording.step !== STEP || !recording.frames.length)
      throw new Error("Unsupported or empty match recording");
    recording.frames.forEach((frame, i) => {
      if (frame.version !== 4 || !Number.isSafeInteger(frame.tick) || (i > 0 && frame.tick !== recording.frames[i - 1].tick + 1))
        throw new Error("Recording must contain contiguous version 4 authority frames");
    });
    this.frames = recording.frames.map(frame => copySnapshot(frame, emptySnapshot(), frame.acknowledged));
    copySnapshot(this.frames[0], this.state, this.frames[0].acknowledged); copySnapshot(this.state, this.previous, this.state.acknowledged);
  }
  get finished() { return this.index === this.frames.length - 1; }
  advance(dt: number, _input: Command, playing: boolean) {
    if (!playing || this.finished) { this.alpha = 1; this.accumulator = 0; return; }
    if (!Number.isFinite(dt) || dt < 0) return;
    // Less than the 120 ms shot window: rendering cannot skip a recorded shot.
    // Slow playback under a long stall is preferable to dropping replay events.
    this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator >= STEP && !this.finished) {
      copySnapshot(this.state, this.previous, this.state.acknowledged);
      const frame = this.frames[++this.index];
      copySnapshot(frame, this.state, frame.acknowledged);
      this.accumulator -= STEP;
    }
    this.alpha = this.finished ? 1 : this.accumulator / STEP;
  }
}


/** Local client presentation switches timelines; the live authority never rewinds. */
export class KillcamSession implements ClientSession {
  readonly state = emptySnapshot();
  readonly previous = emptySnapshot();
  readonly #live: LocalSession;
  private history: MatchSnapshot[] = [];
  private historyCursor = 0;
  private replay: ReplaySession | null = null;
  private replayAge = 0;
  private deaths = 0;
  private killer = 0;
  private readonly neutral = idleCommand();
  viewEpoch = 0;
  alpha = 1;
  constructor(seed = 317, readonly playerId = 0) {
    this.#live = new LocalSession(seed, frame => {
      this.history[this.historyCursor] = frame;
      this.historyCursor = (this.historyCursor + 1) % 151;
    }, playerId);
    copySnapshot(this.#live.state, this.state); copySnapshot(this.state, this.previous);
  }
  get liveState() { return this.#live.state; }
  get killcam() { return this.replay !== null; }
  get viewActorId() { return this.replay ? this.killer : this.playerId; }
  get predictLook() { return !this.replay; }
  advance(dt: number, input: Command, playing: boolean, maxFrameDelta = 0.1) {
    if (!Number.isFinite(dt) || dt < 0) return;
    const liveActor = this.#live.state.actors.find(actor => actor.id === this.playerId)!;
    const wasDead = liveActor.hp <= 0;
    this.neutral.yaw = liveActor.yaw; this.neutral.pitch = liveActor.pitch;
    this.#live.advance(dt, this.replay || liveActor.hp <= 0 ? this.neutral : input, playing, Math.min(0.1, maxFrameDelta));
    const player = this.#live.state.actors.find(actor => actor.id === this.playerId)!;
    // Every respawn adopts the authored view and discards inputs held during death,
    // including self-kills that never start a killcam.
    if (wasDead && player.hp > 0)
      Object.assign(input, idleCommand(), { yaw: player.yaw, pitch: player.pitch });
    let started = false;
    if (player.deaths > this.deaths) {
      this.deaths = player.deaths;
      if (player.lastKiller >= 0 && player.lastKiller !== player.id) {
        const frames = this.history.filter(f => f.tick >= this.#live.state.tick - 120).sort((a,b) => a.tick-b.tick);
        if (frames.length > 1) {
          this.killer = player.lastKiller;
          this.replay = new ReplaySession({ ...createRecording(), frames });
          this.replayAge = 0; this.viewEpoch++; started = true;
        }
      }
    }
    if (this.replay && !started) {
      this.replay.advance(dt, this.neutral, playing);
      if (playing) this.replayAge += Math.min(dt, 0.1);
      // Two seconds of lead-in plus a short final hold, inside the three-second respawn.
      if ((this.replay.finished && this.replayAge >= 2.35) || player.hp > 0) {
        this.replay = null; this.viewEpoch++;
        Object.assign(input, idleCommand(), { yaw: player.yaw, pitch: player.pitch });
      }
    }
    const view = this.replay ?? this.#live;
    copySnapshot(view.state, this.state, view.state.acknowledged);
    copySnapshot(view.previous, this.previous, view.previous.acknowledged);
    this.alpha = view.alpha;
  }
}
