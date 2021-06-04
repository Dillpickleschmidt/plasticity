import c3d from '../../../build/Release/c3d.node';
import * as visual from '../../VisualModel';
import { GeometryFactory } from '../Factory';

export default class MirrorFactory extends GeometryFactory {
    curve!: visual.SpaceInstance<visual.Curve3D>;
    origin!: THREE.Vector3;
    normal!: THREE.Vector3;

    async doUpdate() {
    }

    async doCommit() {
        const { origin, normal } = this;
        const model = this.db.lookup(this.curve);
        const transformed = model.Duplicate() as c3d.SpaceInstance;
        const mat = new c3d.Matrix3D();
        mat.Symmetry(new c3d.CartPoint3D(origin.x, origin.y, origin.z), new c3d.Vector3D(normal.x, normal.y, normal.z));
        transformed.Transform(mat);
        const result = await this.db.addItem(transformed);
        this.db.removeItem(this.curve);
        return result;
    }

    doCancel() {
        return super.cancel();
    }
}