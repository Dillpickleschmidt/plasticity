/**
 * @jest-environment jsdom
 */
import * as THREE from "three";
import { EventDispatcher } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import SphereFactory from "../src/commands/sphere/SphereFactory";
import { EditorLike, Model } from "../src/components/viewport/Viewport";
import { EditorSignals } from "../src/editor/EditorSignals";
import { GeometryDatabase } from "../src/editor/GeometryDatabase";
import { EditorOriginator } from "../src/editor/History";
import MaterialDatabase from "../src/editor/MaterialDatabase";
import { SelectionInteractionManager } from "../src/selection/SelectionInteraction";
import { SelectionManager } from "../src/selection/SelectionManager";
import { PlaneSnap } from "../src/editor/SnapManager";
import { Helpers } from "../src/util/Helpers";
import * as visual from '../src/editor/VisualModel';
import { FakeMaterials } from "../__mocks__/FakeMaterials";

let db: GeometryDatabase;
let materials: MaterialDatabase;
let signals: EditorSignals;
let viewport: Model;
let editor: EditorLike;
let sphere: visual.Solid;
let selection: SelectionManager;
let interaction: SelectionInteractionManager;
let navigationControls: EventDispatcher;
let originator: EditorOriginator;

class FakeWebGLRenderer implements THREE.Renderer {
    domElement = document.createElement("canvas");

    render(scene: THREE.Object3D, camera: THREE.Camera): void { }
    setSize(width: number, height: number, updateStyle?: boolean): void { }

    getPixelRatio(): number {
        throw new Error("Method not implemented.");
    };

    setPixelRatio(value: number): void { };

    getSize(target: THREE.Vector2): THREE.Vector2 {
        return new THREE.Vector2();
    };

    getRenderTarget() { return null }
    setRenderTarget() { }
    clear() { }
    clearDepth() { }
    getClearColor() { }
    getClearAlpha() { }
}

beforeEach(async () => {
    materials = new FakeMaterials();
    signals = new EditorSignals();
    db = new GeometryDatabase(materials, signals);
    selection = new SelectionManager(db, materials, signals);
    interaction = new SelectionInteractionManager(selection, materials, signals);
    editor = {
        db: db,
        viewports: [],
        helpers: new Helpers(signals),
        signals: signals,
        selection: selection,
        originator: originator,
        materials: materials,
        selectionInteraction: interaction,
        scene: new THREE.Scene(),
        enqueue: () => {},
    };
    const makeSphere = new SphereFactory(db, materials, signals);
    makeSphere.center = new THREE.Vector3();
    makeSphere.radius = 1;
    sphere = await makeSphere.commit() as visual.Solid;
    navigationControls = new EventDispatcher() as any;
    navigationControls.dispose = () => {};
    viewport = new Model(
        editor,
        new FakeWebGLRenderer() as unknown as THREE.WebGLRenderer,
        document.createElement('viewport'),
        new THREE.Camera(),
        new PlaneSnap(new THREE.Vector3(1, 0, 0), new THREE.Vector3()),
        navigationControls as unknown as OrbitControls,
        null,
    )
    viewport.start();
});

afterEach(async () => {
    viewport.dispose();
});

test("item selected", () => {
    expect(viewport.outlinePassSelection.selectedObjects).toEqual([]);
    const point = new THREE.Vector3();
    interaction.onClick([{object: sphere.faces.get(0), distance: 1, point}]);
    signals.selectionChanged.dispatch({selection, point});
    expect(viewport.outlinePassSelection.selectedObjects).toEqual(sphere.outline);
    interaction.onClick([]);
    signals.selectionChanged.dispatch({selection, point});
    expect(viewport.outlinePassSelection.selectedObjects).toEqual([]);
});

test("item hovered", () => {
    expect(viewport.outlinePassHover.selectedObjects).toEqual([]);
    const point = new THREE.Vector3();
    interaction.onHover([{object: sphere.faces.get(0), distance: 1, point}]);
    expect(viewport.outlinePassHover.selectedObjects).toEqual(sphere.outline);
    interaction.onHover([]);
    expect(viewport.outlinePassHover.selectedObjects).toEqual([]);
});

test("navigation start & end", () => {
    expect(viewport.selector.enabled).toBeTruthy();
    navigationControls.dispatchEvent({ type: 'start' });
    expect(viewport.selector.enabled).toBeTruthy();
    navigationControls.dispatchEvent({ type: 'change' });
    expect(viewport.selector.enabled).toBeFalsy();
    navigationControls.dispatchEvent({ type: 'end' });
    expect(viewport.selector.enabled).toBeTruthy();
});