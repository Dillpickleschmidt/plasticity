import * as THREE from "three";
import { CancellablePromise } from "../../util/Cancellable";
import { Mode } from "../AbstractGizmo";
import { CompositeGizmo } from "../CompositeGizmo";
import { MagnitudeGizmo } from "../extrude/ExtrudeGizmo";
import { AngleGizmo } from "../MiniGizmos";
import { RevolutionParams } from './RevolutionFactory';

const Y = new THREE.Vector3(0, 1, 0);

export class RevolutionGizmo extends CompositeGizmo<RevolutionParams> {
    private readonly thickness = new MagnitudeGizmo("revolution:thickness", this.editor);
    private readonly angle = new AngleGizmo("revolution:angle", this.editor, this.editor.gizmos.white);

    prepare() {
        const { thickness, angle, params } = this;

        this.angle.relativeScale.setScalar(0.3);

        this.quaternion.setFromUnitVectors(Y, params.axis);
        this.position.copy(params.origin);

        this.add(thickness, angle);

    }

    execute(cb: (params: RevolutionParams) => void, finishFast: Mode = Mode.Persistent): CancellablePromise<void> {
        const { thickness, angle, params } = this;

        this.addGizmo(thickness, distance => {
            params.thickness = distance;
        });

        this.addGizmo(angle, angle => {
            params.side1 = angle;
        });

        return super.execute(cb, finishFast);
    }

    render(params: RevolutionParams) {
        // this.angle.render(params.side1);
        this.thickness.render(params.thickness1);
    }
}