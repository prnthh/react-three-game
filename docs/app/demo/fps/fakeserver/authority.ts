/** Authority only: accepts intent, owns gameplay state and emits isolated snapshots. */
import { createMatch, idleCommand, stepMatch, STEP, type ActorController, type Command, type Match } from "./match";
import { BotController } from "./bot/controller";
import { copySnapshot, emptySnapshot, type CommandPacket, type MatchSnapshot, type LocalMatchConnection } from "../shared/protocol";

/** Shared input limits for any controller; buffering edges is a transport concern. */
function copyCommand(input: Command, out: Command, bufferEdges = false): boolean {
  if (!input || ![input.forward, input.right, input.yaw, input.pitch].every(Number.isFinite)) return false;
  out.forward = Math.max(-1, Math.min(1, input.forward));
  out.right = Math.max(-1, Math.min(1, input.right));
  out.yaw = Math.abs(input.yaw) <= Math.PI ? input.yaw : Math.atan2(Math.sin(input.yaw), Math.cos(input.yaw));
  out.pitch = Math.max(-1.4, Math.min(1.4, input.pitch));
  out.crouch = input.crouch === true; out.grenade = (bufferEdges && out.grenade) || input.grenade === true;
  out.fire = input.fire === true; out.aim = input.aim === true; out.sprint = input.sprint === true;
  // Preserve one-shot edges if several commands arrive before the next server tick.
  out.jump = (bufferEdges && out.jump) || input.jump === true; out.reload = (bufferEdges && out.reload) || input.reload === true;
  return true;
}

type InputSlot = { sequence: number; acknowledged: number; received: number; command: Command };
export class MatchAuthority {
  readonly state: Match;
  private readonly slots = new Map<number, InputSlot>();
  private readonly commands = new Map<number, Command>();
  private readonly controllers = new Map<number, ActorController>();
  constructor(seed = 317, humanActors: readonly number[] = [0], private readonly saveFrame?: (frame: MatchSnapshot) => void) {
    this.state = createMatch(seed);
    for (const id of humanActors) {
      if (!this.state.actors.some((actor) => actor.id === id)) throw new Error("Unknown player slot");
      const command = idleCommand();
      command.yaw = this.state.actors[id].yaw;
      this.slots.set(id, { sequence: -1, acknowledged: -1, received: 0, command });
      this.controllers.set(id, { command: () => command });
    }
    for (const actor of this.state.actors) {
      if (!this.controllers.has(actor.id))
        this.controllers.set(actor.id, new BotController(seed + actor.id * 7919));
    }
    this.saveFrame?.(this.snapshot());
  }
  /** actorId comes from the authenticated connection, never from the packet. */
  submit(actorId: number, packet: CommandPacket): boolean {
    const slot = this.slots.get(actorId);
    if (!slot || !packet || !Number.isSafeInteger(packet.sequence) ||
        packet.sequence < 0 || packet.sequence <= slot.sequence) return false;
    const input = packet.command;
    if (!copyCommand(input, slot.command, true)) return false;
    slot.sequence = packet.sequence; slot.received = this.state.tick;
    return true;
  }
  step() {
    if (this.state.winner !== null) return;
    for (const slot of this.slots.values()) {
      if (this.state.tick - slot.received >= 15) {
        slot.command.forward = slot.command.right = 0;
        slot.command.fire = slot.command.sprint = slot.command.aim = slot.command.crouch = false;
        slot.command.jump = slot.command.reload = slot.command.grenade = false;
      }
    }
    for (const actor of this.state.actors) {
      let command = this.commands.get(actor.id);
      if (!command) this.commands.set(actor.id, command = idleCommand());
      const input = this.controllers.get(actor.id)!.command(this.state, actor, STEP);
      if (!copyCommand(input, command)) {
        Object.assign(command, idleCommand());
        command.yaw = actor.yaw; command.pitch = actor.pitch;
      }
    }
    stepMatch(this.state, this.commands, STEP);
    for (const slot of this.slots.values()) {
      slot.acknowledged = slot.sequence;
      slot.command.jump = slot.command.reload = slot.command.grenade = false;
    }
    // Optional sink gets an owned frame at every authority tick, including transient events.
    this.saveFrame?.(this.snapshot());
  }
  snapshot(target = emptySnapshot(), actorId = 0) {
    return copySnapshot(this.state, target, this.slots.get(actorId)?.acknowledged ?? -1);
  }
}


/** The client receives only this closed-over endpoint, never the authority or its state. */
export function connectLocalMatch(seed = 317, playerId = 0, saveFrame?: (frame: MatchSnapshot) => void): LocalMatchConnection {
  const authority = new MatchAuthority(seed, [playerId], saveFrame);
  return Object.freeze({
    readSnapshot(target: MatchSnapshot) { authority.snapshot(target, playerId); },
    exchange(packet: CommandPacket, target: MatchSnapshot) {
      authority.submit(playerId, packet);
      authority.step();
      authority.snapshot(target, playerId);
    },
  });
}
