import { updateWorld, type Listener, type RigidBody, type World } from 'crashcat';

export interface CrashcatBodySync {
    beforeStep?: (body: RigidBody, delta: number) => void;
    afterStep?: (body: RigidBody) => void;
    /** Publish the current pose on registration, simulation, or explicit invalidation. */
    syncPose?: (body: RigidBody) => void;
}

const MAX_STEP = 1 / 60;
const MAX_CATCH_UP = 1 / 10;

type Pose = { body: RigidBody; publish: (body: RigidBody) => void; queued: boolean };

/** Frame callbacks keep their usual cadence. Only pose publication follows body activity. */
export class CrashcatBodyUpdates {
    private before = new Map<RigidBody, NonNullable<CrashcatBodySync['beforeStep']>>();
    private after = new Map<RigidBody, NonNullable<CrashcatBodySync['afterStep']>>();
    private poses: (Pose | undefined)[] = [];
    private invalidated = new Set<Pose>();
    private pending: Pose[] = [];

    register(body: RigidBody, sync?: CrashcatBodySync) {
        if (sync?.beforeStep) this.before.set(body, sync.beforeStep);
        if (sync?.afterStep) this.after.set(body, sync.afterStep);
        if (sync?.syncPose) {
            const pose = { body, publish: sync.syncPose, queued: false };
            this.poses[body.index] = pose;
            this.invalidated.add(pose);
        }
    }

    remove(body: RigidBody) {
        this.before.delete(body);
        this.after.delete(body);
        const pose = this.poses[body.index];
        if (!pose) return;
        this.poses[body.index] = undefined;
        this.invalidated.delete(pose);
    }

    invalidatePose = (body: RigidBody) => {
        const pose = this.poses[body.index];
        if (pose?.body === body) this.invalidated.add(pose);
    };

    private queue(pose: Pose) {
        if (pose.queued) return;
        pose.queued = true;
        this.pending.push(pose);
    }

    private collectActive({ bodies }: World) {
        if (!this.poses.length) return;
        for (let i = 0; i < bodies.activeBodyCount; i++) {
            const pose = this.poses[bodies.activeBodyIndices[i]];
            if (pose) this.queue(pose);
        }
    }

    step(world: World, listener: Listener, delta: number) {
        const frameDelta = Math.min(delta, MAX_CATCH_UP);
        for (const [body, callback] of this.before) callback(body, frameDelta);
        const steps = Math.max(1, Math.ceil(frameDelta / MAX_STEP));
        const stepDelta = frameDelta / steps;
        // Include bodies entering sleep as well as bodies woken by an intermediate collision.
        this.collectActive(world);
        for (let i = 0; i < steps; i++) {
            updateWorld(world, listener, stepDelta);
            this.collectActive(world);
        }
        for (const pose of this.invalidated) this.queue(pose);
        this.invalidated.clear();
        for (const pose of this.pending) {
            pose.queued = false;
            if (this.poses[pose.body.index] === pose) pose.publish(pose.body);
        }
        this.pending.length = 0;
        for (const [body, callback] of this.after) callback(body);
    }
}
