import { Group, Matrix4, type Object3D } from 'three';

/** Skip the full visual subtree between changes while the placement is in Play. */
export class PlacementGroup extends Group {
    private parentWorld?: Matrix4;
    private sleeping = false;
    private dirty = true;
    private invalidate = () => { this.dirty = true; };
    private added = ({ child }: { child: Object3D }) => {
        child.traverse(this.watch);
        this.invalidate();
    };
    private removed = ({ child }: { child: Object3D }) => child.traverse(this.unwatch);
    private watch = (object: Object3D) => {
        object.addEventListener('childadded', this.added);
        object.addEventListener('childremoved', this.removed);
    };
    private unwatch = (object: Object3D) => {
        object.removeEventListener('childadded', this.added);
        object.removeEventListener('childremoved', this.removed);
    };

    sleep() {
        this.dirty = true;
        this.sleeping = true;
        this.traverse(this.watch);
        this.addEventListener('objectchange', this.invalidate);
        return () => {
            this.sleeping = false;
            this.removeEventListener('objectchange', this.invalidate);
            this.traverse(this.unwatch);
        };
    }

    override updateMatrixWorld(force?: boolean) {
        // A placement under ordinary Three ancestors can receive force every frame.
        // Streamed cells already inherit an accurate force flag from their placement.
        if (!this.matrixAutoUpdate && this.parent) {
            const matrix = this.parent.matrixWorld;
            force = !this.parentWorld?.equals(matrix);
            if (force) (this.parentWorld ??= new Matrix4()).copy(matrix);
        }
        if (this.sleeping && !force && !this.dirty && !this.matrixWorldNeedsUpdate) return;
        this.dirty = false;
        super.updateMatrixWorld(force);
    }
}
