import { Cancellable } from '../util/Cancellable';
import { EditorSignals } from '../Editor';
import { GeometryDatabase } from '../GeometryDatabase';
import MaterialDatabase from '../MaterialDatabase';
import * as visual from '../VisualModel';

type State = 'none' | 'updated' | 'failed' | 'cancelled' | 'committed'

export abstract class GeometryFactory extends Cancellable {
    state: State = 'none';

    constructor(
        protected readonly db: GeometryDatabase,
        protected readonly materials: MaterialDatabase,
        protected readonly signals: EditorSignals
    ) { super() }

    finish(): void {
        switch (this.state) {
            case 'none':
            case 'updated':
                this.commit();
                break;
            default:
                throw new Error('invalid state: ' + this.state);
        }
    }

    protected abstract doUpdate(): void;
    protected abstract doCommit(): visual.SpaceItem | visual.SpaceItem[];
    protected abstract doCancel(): void;

    update(): void {
        switch (this.state) {
            case 'none':
            case 'failed':
            case 'updated':
                this.signals.factoryUpdated.dispatch();
                try {
                    this.doUpdate();
                    this.state = 'updated';
                } catch (e) {
                    this.state = 'failed';
                    throw e;
                }
                return;
            default:
                throw new Error('invalid state: ' + this.state);
        }
    }

    commit(): visual.SpaceItem | visual.SpaceItem[] {
        switch (this.state) {
            case 'none':
            case 'updated':
                this.state = 'committed';
                this.signals.factoryCommitted.dispatch();
                return this.doCommit();
            default:
                throw new Error('invalid state: ' + this.state);
        }
    }

    cancel(): void {
        switch (this.state) {
            case 'updated':
                this.doCancel();
            case 'none':
            case 'cancelled':
            case 'failed':
                return;
            default:
                throw new Error('invalid state: ' + this.state);
        }
    }

    private previous?: Map<keyof this, any>;
    transaction(keys: (keyof this)[], cb: () => void) {
        try {
            cb();
            this.previous = new Map();
            for (const key of keys) {
                const uncloned = this[key];
                let value = uncloned;
                if (typeof uncloned === 'object' && 'clone' in uncloned) {
                    // @ts-ignore
                    value = uncloned.clone();
                }
                this.previous.set(key, value);
            }
            this.previous.set("state", this.state);
        } catch (e) {
            console.warn(e);
            if (this.previous != null) {
                for (const key of keys) {
                    this[key] = this.previous.get(key);
                }
                this.state = this.previous.get("state");
            }
        }
    }
}