import * as THREE from "three";
import { AdditiveBlending } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { Editor } from '../../Editor';
import { CircleGeometry } from "../../Util";
import { AbstractGizmo, Intersector, MovementInfo } from "../AbstractGizmo";

type State = 'X' | 'Y' | 'Z' | 'screen';
type Mode = {
    tag: State
    axis: THREE.Vector3;
}
const planeGeometry = new THREE.PlaneGeometry(100_000, 100_000, 2, 2);
export class RotateGizmo extends AbstractGizmo<(axis: THREE.Vector3, angle: number) => void> {
    private mode?: Mode;
    private readonly circle: THREE.Mesh;
    private readonly torus: THREE.Mesh;
    private readonly plane: THREE.Mesh;

    constructor(editor: Editor, p1: THREE.Vector3) {
        const materials = editor.gizmos;

        const handle = new THREE.Group();
        const picker = new THREE.Group();

        const radius = 0.85;
        {
            const geometry = new LineGeometry();
            geometry.setPositions(CircleGeometry(radius, 32));
            const circle = new Line2(geometry, editor.gizmos.lineRed);
            circle.rotation.set(0, -Math.PI / 2, 0);
            handle.add(circle);

            const torus = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.1, 4, 24), materials.invisible);
            torus.rotation.copy(circle.rotation);
            torus.userData.mode = { tag: 'X', axis: new THREE.Vector3(1, 0, 0) };
            torus.userData.command = ['gizmo:rotate:x', () => this.mode = torus.userData.mode];
            picker.add(torus)
        };

        {
            const geometry = new LineGeometry();
            geometry.setPositions(CircleGeometry(radius, 32));
            const circle = new Line2(geometry, editor.gizmos.lineGreen);
            circle.rotation.set(-Math.PI / 2, 0, 0);
            handle.add(circle);

            const torus = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.1, 4, 24), materials.invisible);
            torus.rotation.copy(circle.rotation);
            torus.userData.mode = { tag: 'Y', axis: new THREE.Vector3(0, 1, 0) };
            torus.userData.command = ['gizmo:rotate:y', () => this.mode = torus.userData.mode];
            picker.add(torus)
        }

        {
            const geometry = new LineGeometry();
            geometry.setPositions(CircleGeometry(radius, 32));
            const circle = new Line2(geometry, editor.gizmos.lineBlue);
            circle.rotation.set(0, 0, -Math.PI / 2);
            handle.add(circle);

            const torus = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.1, 4, 24), materials.invisible);
            torus.rotation.copy(circle.rotation);
            torus.userData.mode = { tag: 'Z', axis: new THREE.Vector3(0, 0, 1) };
            torus.userData.command = ['gizmo:rotate:z', () => this.mode = torus.userData.mode];
            picker.add(torus)
        }

        const { circle, torus } = (() => {
            const radius = 1;
            const geometry = new LineGeometry();
            geometry.setPositions(CircleGeometry(radius, 32));
            const circle = new Line2(geometry, materials.line);
            handle.add(circle);

            const torus = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.1, 4, 24), materials.invisible);
            torus.userData.mode = { tag: 'screen' };
            torus.userData.command = ['gizmo:rotate:screen', () => this.mode = torus.userData.mode];
            picker.add(torus);

            return { circle, torus };
        })();

        const helper = new THREE.Mesh(planeGeometry, materials.occlude);
        helper.renderOrder = -1;

        super("rotate", editor, { handle: handle, picker: picker });

        this.circle = circle;
        this.torus = torus;
        this.plane = helper;
        this.position.copy(p1);
    }

    onPointerHover(intersect: Intersector) {
        this.picker.updateMatrixWorld();
        const picker = intersect(this.picker, true);
        if (picker) this.mode = picker.object.userData.mode as Mode;
        else this.mode = undefined;
    }

    onPointerDown(intersect: Intersector) {}

    onPointerMove(cb: (axis: THREE.Vector3, angle: number) => void, intersect: Intersector, info: MovementInfo) {
        if (!this.mode) throw "invalid state";
        switch (this.mode.tag) {
            case 'screen':
                cb(info.eye, info.angle);
                break;
            default:
                let angle = info.angle;
                if (info.eye.dot(this.mode.axis) < 0) angle *= -1;;
                cb(this.mode.axis, angle);
            }
    }

    update(camera: THREE.Camera) {
        super.update(camera);

        this.plane.lookAt(camera.position);
        this.circle.lookAt(camera.position);
        this.torus.lookAt(camera.position);
        this.circle.updateMatrixWorld();
        this.torus.updateMatrixWorld();

        const eye = new THREE.Vector3();
        eye.copy(camera.position).sub(this.position).normalize();
        this.plane.position.copy(this.circle.position);
        this.plane.position.add(eye.clone().multiplyScalar(-0.01))
        this.plane.updateMatrixWorld();
    }
}

