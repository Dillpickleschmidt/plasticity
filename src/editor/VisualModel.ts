import * as THREE from "three";
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import c3d from '../../build/Release/c3d.node';
import { GeometryGPUPickingAdapter } from "../components/viewport/gpu_picking/GeometryGPUPickingAdapter";
import { IdLineMaterial, IdMeshMaterial, IdPointsMaterial, LineVertexColorMaterial, vertexColorLineMaterial, vertexColorLineMaterialXRay, VertexColorMaterial, vertexColorMaterial, vertexColorMaterialXRay } from "../components/viewport/gpu_picking/GPUPickingMaterial";
import { snapPointsMaterial, snapPointsXRayMaterial } from "../components/viewport/gpu_picking/SnapGPUPickingAdapter";
import { computeControlPointInfo, deunit, point2point } from "../util/Conversion";
import { GConstructor } from "../util/Util";

/**
 * This class hierarchy mirrors the c3d hierarchy into the THREE.js Object3D hierarchy.
 * This allows view objects to have type safety and polymorphism/encapsulation where appropriate.
 * 
 * We want a class hierarchy like CurveEdge <: Edge <: TopologyItem, and Face <: TopologyItem
 * but we also want CurveEdge <: Line2 and Face <: Mesh. But this requires multiple inheritance/mixins.
 * And that's principally what's going on in this file.
 * 
 * At the time of writing, the OBJECT graph hierarchy (not the class hierarchy) is like:
 *
 * * Solid -> LOD -> RecursiveGroup -> FaceGroup -> Face
 * * Solid -> LOD -> RecursiveGroup -> CurveEdgeGroup -> CurveEdge
 * * SpaceInstance -> LOD -> Curve3D -> CurveSegment
 */

export abstract class SpaceItem extends THREE.Object3D {
    private _useNominal: undefined;
    abstract picker(isXRay: boolean): THREE.Object3D
    abstract dispose(): void;
}

export abstract class PlaneItem extends THREE.Object3D {
    private _useNominal: undefined;
    abstract picker(isXRay: boolean): THREE.Object3D
    abstract dispose(): void;
}

export abstract class Item extends SpaceItem {
    private _useNominal2: undefined;
    abstract picker(isXRay: boolean): THREE.Object3D
    get simpleName(): c3d.SimpleName { return this.userData.simpleName }
}

export class Solid extends Item {
    private _useNominal3: undefined;
    readonly lod = new THREE.LOD();

    constructor() {
        super();
        this.add(this.lod);
    }

    // the higher detail ones are later
    get edges() { return this.lod.children[this.lod.children.length - 1].children[0] as CurveGroup<CurveEdge> }
    get faces() { return this.lod.children[this.lod.children.length - 1].children[1] as FaceGroup }

    picker(isXRay: boolean) {
        const lod = this.lod.children[this.lod.children.length - 1];
        // FIXME: use this.lod.getCurrentLevel -- currently returns wrong value
        const edges = lod.children[0] as CurveGroup<CurveEdge>;
        const faces = lod.children[1] as FaceGroup;
        const facePicker = faces.mesh.clone();
        const edgePicker = edges.line.clone();

        if (isXRay) {
            facePicker.material = vertexColorMaterialXRay;
            edgePicker.material = vertexColorLineMaterialXRay;
        } else {
            facePicker.material = vertexColorMaterial;
            edgePicker.material = vertexColorLineMaterial;
        }
        edgePicker.renderOrder = edgePicker.material.userData.renderOrder;
        facePicker.renderOrder = facePicker.material.userData.renderOrder;
        edgePicker.layers.set(Layers.CurveEdge);
        facePicker.layers.set(Layers.Face);

        const group = new THREE.Group();
        group.add(facePicker, edgePicker);
        return group;
    }

    get outline() {
        if (!this.visible) return [];
        return this.faces;
    }

    get allEdges() {
        let result: CurveEdge[] = [];
        for (const lod of this.lod.children) {
            const edges = lod.children[0] as CurveGroup<CurveEdge>;
            result = result.concat([...edges]);
        }
        return result;
    }

    get allFaces() {
        let result: Face[] = [];
        for (const lod of this.lod.children) {
            const faces = lod.children[1] as FaceGroup;
            result = result.concat([...faces]);
        }
        return result;
    }

    dispose() {
        for (const level of this.lod.children) {
            const edges = level.children[0] as CurveGroup<CurveEdge>;
            const faces = level.children[1] as FaceGroup;

            edges.dispose();
            faces.dispose();
        }
    }
}


export class SpaceInstance<T extends SpaceItem> extends Item {
    private _useNominal3: undefined;
    get underlying() { return this.children[0] as T }
    picker(isXRay: boolean) { return this.underlying.picker(isXRay) }
    dispose() { this.underlying.dispose() }
}

export class PlaneInstance<T extends PlaneItem> extends Item {
    private _useNominal3: undefined;
    get underlying() { return this.children[0] as T }
    picker(isXRay: boolean) { return this.underlying.picker(isXRay) }
    dispose() { this.underlying.dispose() }
}

export class ControlPoint extends THREE.Object3D {
    static simpleName(parentId: c3d.SimpleName, index: number) {
        return `control-point,${parentId},${index}`;
    }

    readonly simpleName: string;

    constructor(
        readonly parentItem: SpaceInstance<Curve3D>,
        readonly points: THREE.Points,
        readonly index: number
    ) {
        super();
        this.simpleName = ControlPoint.simpleName(parentItem.simpleName, index);
    }

    get geometry() { return this.points.geometry }
}

export type FragmentInfo = { start: number, stop: number, untrimmedAncestor: SpaceInstance<Curve3D> };

export class CurveSegment extends THREE.Object3D {
    constructor(readonly group: Readonly<GeometryGroup>, userData: any) {
        super();
        this.userData = userData;
    }

    dispose() { }
}

export class Curve3D extends SpaceItem {
    static build(segments: CurveSegmentGroupBuilder, points: THREE.Points) {
        return new Curve3D(segments.build(), points);
    }

    constructor(readonly segments: CurveGroup<CurveSegment>, readonly points: THREE.Points) {
        super();
        this.add(segments, points);
    }

    get parentItem(): SpaceInstance<Curve3D> {
        const result = this.parent;
        if (!(result instanceof SpaceInstance)) throw new Error("Invalid precondition");
        return result;
    }

    get fragmentInfo(): FragmentInfo | undefined {
        if (!this.isFragment) return undefined;
        return this.userData as FragmentInfo;
    }

    befragment(start: number, stop: number, ancestor: SpaceInstance<Curve3D>) {
        this.name = "fragment";
        this.userData.start = start;
        this.userData.stop = stop;
        this.userData.untrimmedAncestor = ancestor;
        this.points.clear();
    }

    get isFragment(): boolean {
        return !!this.userData.untrimmedAncestor;
    }

    get controlPoints() {
        const position = this.points.geometry.attributes.position as THREE.Float32BufferAttribute;
        const count = position.count;
        const result = [];
        const parentItem = this.parentItem;
        for (let i = 0; i < count; i++) {
            const point = new ControlPoint(parentItem, this.points, i);
            result.push(point);
        }
        return result;
    }

    makePoint(index: number) {
        const parentItem = this.parentItem;
        return new ControlPoint(parentItem, this.points, index);
    }

    picker(isXRay: boolean) {
        const linePicker = this.line.clone();
        const pointsPicker = this.points.clone();

        const lineMaterialPrototype = isXRay ? vertexColorLineMaterialXRay : vertexColorLineMaterial;
        const pointsMaterial = isXRay ? snapPointsXRayMaterial : snapPointsMaterial;

        const { stencilWrite, stencilFunc, stencilRef, stencilZPass } = lineMaterialPrototype;
        linePicker.renderOrder = lineMaterialPrototype.userData.renderOrder;

        // FIXME: gc material
        const id = GeometryGPUPickingAdapter.encoder.encode('curve', this.parentItem.simpleName);
        const lineMaterial = new IdLineMaterial(id, { blending: THREE.NoBlending, linewidth: 10, stencilWrite, stencilFunc, stencilRef, stencilZPass });
        linePicker.material = lineMaterial;

        pointsPicker.material = pointsMaterial;

        const group = new THREE.Group();
        group.add(linePicker, pointsPicker);
        return group;
    }

    get line() { return this.segments.line }
    get occludedLine() { return this.segments.occludedLine }

    dispose() {
        this.segments.dispose();
        this.points.geometry.dispose();
    }
}

export class Surface extends SpaceItem {
    static build(grid: c3d.MeshBuffer, material: THREE.Material): Surface {
        const geometry = new THREE.BufferGeometry();
        geometry.setIndex(new THREE.BufferAttribute(grid.index, 1));
        geometry.setAttribute('position', new THREE.BufferAttribute(grid.position, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(grid.normal, 3));

        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.setScalar(0.01);
        const built = new Surface(mesh);

        built.layers.set(Layers.Surface);
        mesh.layers.set(Layers.Surface);
        return built;
    }

    private constructor(private readonly mesh: THREE.Mesh) {
        super()
        this.renderOrder = RenderOrder.Face;
        this.add(mesh);
    }

    get parentItem(): SpaceInstance<Surface> {
        const result = this.parent as SpaceInstance<Surface>;
        if (!(result instanceof SpaceInstance)) throw new Error("Invalid precondition");
        return result;
    }

    picker(isXRay: boolean) {
        const picker = this.mesh.clone();
        // FIXME: cache and dispose();
        picker.material = new IdMeshMaterial(GeometryGPUPickingAdapter.encoder.encode('surface', this.simpleName));
        return picker;
    }

    get simpleName() { return this.parentItem.simpleName }

    dispose() { this.mesh.geometry.dispose() }
}

export class Region extends PlaneItem {
    get child() { return this.mesh };

    get parentItem(): PlaneInstance<Region> {
        const result = this.parent as PlaneInstance<Region>;
        if (!(result instanceof PlaneInstance)) throw new Error("Invalid precondition");
        return result;
    }

    constructor(private readonly mesh: THREE.Mesh) {
        super()
        this.add(mesh);
    }

    picker(isXRay: boolean) {
        const picker = this.mesh.clone();
        // FIXME: cache and dispose();
        picker.material = new IdMeshMaterial(GeometryGPUPickingAdapter.encoder.encode('region', this.simpleName));
        return picker;
    }

    get simpleName() { return this.parentItem.simpleName }
    dispose() { this.mesh.geometry.dispose() }
}

export abstract class TopologyItem extends THREE.Object3D {
    private _useNominal: undefined;

    get parentItem(): Solid {
        const result = this.parent?.parent?.parent?.parent;
        if (!(result instanceof Solid)) {
            console.error(this);
            throw new Error("Invalid precondition");
        }
        return result as Solid;
    }

    get simpleName(): string { return this.userData.simpleName }
    get index(): number { return this.userData.index }

    abstract dispose(): void;
}

export abstract class Edge extends TopologyItem { }

export class CurveEdge extends Edge {
    static simpleName(parentId: c3d.SimpleName, index: number) {
        return `edge,${parentId},${index}`;
    }

    constructor(readonly group: Readonly<GeometryGroup>, userData: any) {
        super();
        this.userData = userData;
    }

    slice() {
        return this.parentItem.edges.slice([this]);
    }

    dispose() { }
}
export class Vertex {
    static build(edge: c3d.EdgeBuffer, material: LineMaterial) {
    }
}

export type GeometryGroup = { start: number; count: number; materialIndex?: number | undefined };
export class GeometryGroupUtils {
    static compact(groups: Readonly<GeometryGroup>[]): GeometryGroup[] {
        const first = groups.shift();
        if (first === undefined) return [];
        if (groups.length === 0) return [first];

        let start = first.start;
        let count = first.count;
        let position = start + count;

        const result = [];
        for (const group of groups) {
            if (group.start === position) {
                count += group.count;
                position += group.count;
            } else {
                result.push({ start, count });
                start = group.start;
                count = group.count;
                position = start + count;
            }
        }
        result.push({ start, count });
        return result;
    }
}

export class Face extends TopologyItem {
    static simpleName(parentId: c3d.SimpleName, index: number) {
        return `face,${parentId},${index}`;
    }

    constructor(readonly group: Readonly<GeometryGroup>, userData: any) {
        super();
        this.userData = userData;
    }

    makeSnap(): THREE.Mesh {
        const faceGroup = this.parent as FaceGroup;
        const geometry = new THREE.BufferGeometry();
        const original = faceGroup.mesh.geometry;
        geometry.attributes = original.attributes;
        geometry.index = original.index;
        geometry.boundingBox = original.boundingBox;
        geometry.boundingSphere = original.boundingSphere;
        geometry.addGroup(this.group.start, this.group.count, 0);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
        mesh.scale.setScalar(deunit(1));
        return mesh;
    }

    dispose() { }
}

export class CurveGroup<T extends CurveEdge | CurveSegment> extends THREE.Group {
    private _useNominal: undefined;

    readonly temp = new THREE.Group();
    constructor(readonly mesh: THREE.Group, readonly edges: ReadonlyArray<T>) {
        super();
        if (edges.length > 0) this.add(...edges);
        this.add(this.temp);
        this.add(this.mesh);
    }

    *[Symbol.iterator]() {
        for (const edge of this.edges) yield edge as T;
    }

    get(i: number): T {
        return this.edges[i];
    }

    slice(edges: T[]): LineSegments2 {
        const instanceStart = this.line.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
        const inArray = instanceStart.data.array as Float32Array;
        const inBuffer = Buffer.from(inArray.buffer);

        let size = 0;
        for (const edge of edges) size += edge.group.count;
        const outBuffer = Buffer.alloc(size * 4);
        let offset = 0;
        for (const edge of edges) {
            const group = edge.group;
            const next = (group.start + group.count) * 4;
            inBuffer.copy(outBuffer, offset, group.start * 4, next);
            offset += group.count * 4;
        }
        const geometry = new LineSegmentsGeometry();
        geometry.setPositions(new Float32Array(outBuffer.buffer));
        const line = this.line.clone();
        line.geometry = geometry;
        return line;
    }

    get line() { return this.mesh.children[0] as LineSegments2 }
    get occludedLine() { return this.mesh.children[1] as LineSegments2 }

    dispose() {
        for (const edge of this.edges) edge.dispose();
        for (const child of this.mesh.children) {
            if (!(child instanceof LineSegments2)) throw new Error("invalid precondition");
            child.geometry.dispose();
        }
    }
}

export class FaceGroup extends THREE.Group {
    private _useNominal: undefined;

    constructor(readonly mesh: THREE.Mesh, readonly faces: ReadonlyArray<Face>, readonly groups: ReadonlyArray<GeometryGroup>) {
        super();
        this.add(mesh);
        this.add(...faces);
    }

    *[Symbol.iterator]() {
        for (const face of this.faces) yield face;
    }

    get(i: number): Face { return this.faces[i] }

    dispose() {
        for (const face of this.faces) face.dispose();
        this.mesh.geometry.dispose();
    }
}

// FIXME: Move into curve builder?
export class ControlPointGroup extends THREE.Group {
    static build(item: c3d.SpaceItem, parentId: c3d.SimpleName, material: THREE.PointsMaterial): THREE.Points {
        let points: c3d.CartPoint3D[] = [];
        switch (item.Type()) {
            case c3d.SpaceType.PolyCurve3D: {
                const controlPoints = item.Cast<c3d.PolyCurve3D>(c3d.SpaceType.PolyCurve3D).GetPoints();
                points = points.concat(controlPoints);
                break;
            }
            case c3d.SpaceType.Contour3D: {
                const contour = item.Cast<c3d.Contour3D>(c3d.SpaceType.Contour3D);
                const infos = computeControlPointInfo(contour);
                for (const info of infos) points.push(point2point(info.origin));
                break;
            }
            default: {
                const curve = item.Cast<c3d.Curve3D>(c3d.SpaceType.Curve3D);
                points.push(curve.GetLimitPoint(1));
                if (!curve.IsClosed()) points.push(curve.GetLimitPoint(2));
                break;
            }
        }
        return ControlPointGroup.fromCartPoints(points, parentId, material);
    }

    private static fromCartPoints(ps: c3d.CartPoint3D[], parentId: c3d.SimpleName, material: THREE.PointsMaterial) {
        const info: [number, THREE.Vector3][] = ps.map((p, i) => [GeometryGPUPickingAdapter.encoder.encode('control-point', parentId, i), point2point(p)]);
        const geometry = IdPointsMaterial.geometry(info);
        geometry.setAttribute('color', new THREE.Uint8BufferAttribute(new Uint8Array(ps.length * 3), 3, true))
        const points = new THREE.Points(geometry, material);
        points.layers.set(Layers.ControlPoint);
        return points;
    }
}

/**
 * Finally, we have some builder functions to enforce type-safety when building the object graph.
 */

export class SolidBuilder {
    private readonly solid = new Solid();

    add(edges: CurveEdgeGroupBuilder, faces: FaceGroupBuilder, distance?: number) {
        const level = new THREE.Group();
        level.add(edges.build());
        level.add(faces.build());
        this.solid.lod.addLevel(level, distance);
    }

    build(): Solid {
        return this.solid;
    }
}

export class SpaceInstanceBuilder<T extends SpaceItem> {
    private readonly instance = new SpaceInstance<T>();

    add(t: T, distance?: number) { this.instance.add(t) }
    build(): SpaceInstance<T> { return this.instance }
}

export class PlaneInstanceBuilder<T extends PlaneItem> {
    private readonly instance = new PlaneInstance<T>();

    add(grid: c3d.MeshBuffer, material: THREE.Material) {
        const geometry = new THREE.BufferGeometry();
        geometry.setIndex(new THREE.BufferAttribute(grid.index, 1));
        geometry.setAttribute('position', new THREE.BufferAttribute(grid.position, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(grid.normal, 3));

        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.setScalar(0.01);
        const region = new Region(mesh);
        region.renderOrder = RenderOrder.Face;
        this.instance.add(region);
    }

    build() { return this.instance }
}

export class FaceGroupBuilder {
    private readonly meshes: THREE.Mesh[] = [];
    private parentId!: c3d.SimpleName;

    add(grid: c3d.MeshBuffer, parentId: c3d.SimpleName, material: THREE.Material) {
        this.parentId = parentId;
        const geometry = new THREE.BufferGeometry();
        geometry.setIndex(new THREE.BufferAttribute(grid.index, 1));
        geometry.setAttribute('position', new THREE.BufferAttribute(grid.position, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(grid.normal, 3));
        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.setScalar(0.01);
        const userData = {
            name: grid.name,
            simpleName: Face.simpleName(parentId, grid.i),
            index: grid.i,
        }
        geometry.userData = userData;

        this.meshes.push(mesh);
    }

    build(): FaceGroup {
        const geos = [];
        const meshes = this.meshes;
        for (const mesh of meshes) geos.push(mesh.geometry);
        const merged = VertexColorMaterial.mergeBufferGeometries(geos, id => GeometryGPUPickingAdapter.encoder.encode('face', this.parentId, id));
        const groups = merged.groups;

        const materials = meshes.map(mesh => mesh.material as THREE.Material);
        const mesh = new THREE.Mesh(merged, materials[0]);

        const faces = [];
        for (const [i, group] of groups.entries()) {
            const face = new Face(group, merged.userData.mergedUserData[i]);
            faces.push(face);
        }

        mesh.scale.setScalar(deunit(1));
        mesh.renderOrder = RenderOrder.Face;

        for (const geo of geos) geo.dispose();
        merged.clearGroups();

        return new FaceGroup(mesh, faces, groups);
    }
}

export type LineInfo = {
    position: Float32Array;
    userData: any;
    material: LineMaterial;
    occludedMaterial: LineMaterial;
};

abstract class CurveBuilder<T extends CurveEdge | CurveSegment> {
    private readonly lines: LineInfo[] = [];
    private parentId!: c3d.SimpleName;

    add(edge: c3d.EdgeBuffer, parentId: c3d.SimpleName, material: LineMaterial, occludedMaterial: LineMaterial) {
        this.parentId = parentId;
        const position = edge.position;
        const userData = {
            name: edge.name,
            simpleName: CurveEdge.simpleName(parentId, edge.i),
            index: edge.i
        }

        this.lines.push({ position, userData, material, occludedMaterial });
    }

    build() {
        let { lines } = this;
        if (lines.length === 0) {
            const group = new THREE.Group();
            // FIXME: ensure gc
            const line = new LineSegments2(new LineSegmentsGeometry(), new LineMaterial())
            const occluded = new LineSegments2(new LineSegmentsGeometry(), new LineMaterial());
            group.add(line, occluded);
            return new CurveGroup(group, []);
        }

        const geometry = LineVertexColorMaterial.mergePositions(lines, id => GeometryGPUPickingAdapter.encoder.encode('edge', this.parentId, id));
        const line = new LineSegments2(geometry, lines[0].material);
        line.scale.setScalar(deunit(1));

        const occluded = new LineSegments2(geometry, lines[0].occludedMaterial);
        occluded.renderOrder = line.renderOrder = RenderOrder.CurveEdge;
        occluded.layers.set(Layers.XRay);
        occluded.scale.setScalar(deunit(1));
        occluded.computeLineDistances();

        const mesh = new THREE.Group();
        mesh.add(line, occluded);

        const edges: T[] = [];
        for (const [i, { userData }] of lines.entries()) {
            const edge = new this.make(geometry.userData.groups[i], userData);
            edges.push(edge);
        }

        return new CurveGroup<T>(mesh, edges);
    }

    protected abstract get make(): GConstructor<T>;
}

export class CurveEdgeGroupBuilder extends CurveBuilder<CurveEdge> {
    get make() { return CurveEdge }
}

export class CurveSegmentGroupBuilder extends CurveBuilder<CurveSegment> {
    // FIXME: probably don't build colors for curve segments
    get make() { return CurveSegment }
}

export const RenderOrder = {
    CurveEdge: 20,
    Face: 10,
    CurveSegment: 20,
    SnapNearbyIndicator: 40
}

export enum Layers {
    Default,

    Overlay,
    ViewportGizmo,
    ObjectGizmo,

    XRay,

    CurveFragment,
    CurveFragment_XRay,

    Solid,
    Curve,
    Region,
    Surface,

    ControlPoint,
    Face,
    CurveEdge,

    Unselectable,
}
