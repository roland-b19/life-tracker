"use client";

import { useEffect, useRef, useState } from "react";
import { Card, EmptyNote, GroupLabel, SmallButton } from "../components/blocks";
import { HBars } from "../components/charts";
import { ArrowsIcon } from "../components/icons";
import { ListBox } from "../components/lists";
import { Segmented } from "../components/segmented";
import { MUSCLE_GROUP_KEYS, MUSCLE_GROUP_LABEL, type MuscleGroupKey } from "@/lib/gym-muscles";
import { GROUP_COLOR, MESH_GROUP } from "./muscle-groups";
import { MuscleTag } from "./muscle-tag";

interface MapApi {
  setSelected(g: MuscleGroupKey[]): void;
  setView(v: "front" | "back"): void;
  rotateBy(dx: number, dy: number): void;
}

type GltfScene = import("three").Group;
// The model is parsed once per visit: opening the tab again (or the page) reuses the geometry instead of loading it again.
// The service worker (public/sw.js) keeps the file itself on the device. A failed load is not kept, so the next try retries.
let modelPromise: Promise<GltfScene> | null = null;
async function loadModel(): Promise<GltfScene> {
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  return (await new GLTFLoader().loadAsync("/models/muscles.glb")).scene;
}

/** Interactive 3D muscle model. Click a muscle to select its group (Shift or Ctrl adds more); the chips next to it do the same without WebGL. */
function MuscleMap({
  selected,
  onSelect,
  onGoBack,
  canGoBack,
}: {
  selected: MuscleGroupKey[];
  onSelect: (g: MuscleGroupKey, additive: boolean) => void;
  onGoBack: () => void;
  canGoBack: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<MapApi | null>(null);
  const selectedRef = useRef(selected);
  const onSelectRef = useRef(onSelect);
  const [side, setSide] = useState<"front" | "back">("front");
  // On a touch screen the model moves only while a finger holds the move button and slides; a drag on the model
  // itself scrolls the page.
  const [holding, setHolding] = useState(false);
  const lastPoint = useRef<[number, number] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    selectedRef.current = selected;
    onSelectRef.current = onSelect;
    api.current?.setSelected(selected);
  }, [selected, onSelect]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } =
          await import("three/examples/jsm/controls/OrbitControls.js");
        const el = host.current;
        if (disposed || !el) return;

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(2, 3, 4);
        scene.add(key);
        const back = new THREE.DirectionalLight(0xffffff, 0.8);
        back.position.set(-2, 2, -4);
        scene.add(back);
        // A draw of the whole model is costly where WebGL runs in software (a weak device, a headless browser), and the
        // page's main thread can wait for it. So the setup at the end of this effect (camera, size, colors) draws once,
        // when it is done, not at each of its steps.
        let drawing = false;
        const render = () => {
          if (drawing) renderer.render(scene, camera);
        };
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.addEventListener("change", render);
        const touch = window.matchMedia("(pointer: coarse)");
        const applyPointer = () => {
          controls.enabled = !touch.matches;
          renderer.domElement.style.touchAction = touch.matches ? "pan-y" : "none";
        };
        applyPointer();
        touch.addEventListener("change", applyPointer);

        modelPromise ??= loadModel().catch((e) => {
          modelPromise = null;
          throw e;
        });
        // A copy of the cached scene: the geometry is shared, the materials and the scene graph are this view's own.
        const model = (await modelPromise).clone(true);
        if (disposed) {
          renderer.dispose();
          return;
        }
        scene.add(model);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const height = box.getSize(new THREE.Vector3()).y;
        const dist =
          (height / 2 / Math.tan((camera.fov * Math.PI) / 360)) * 1.1;
        controls.target.copy(center);
        controls.minDistance = dist * 0.35;
        controls.maxDistance = dist * 1.6;

        const parts: {
          mesh: InstanceType<typeof THREE.Mesh>;
          group: MuscleGroupKey | null;
          mat: InstanceType<typeof THREE.MeshStandardMaterial>;
        }[] = [];
        model.traverse((o) => {
          const mesh = o as InstanceType<typeof THREE.Mesh>;
          if (!mesh.isMesh) return;
          const group = MESH_GROUP[mesh.name] ?? null;
          const mat = new THREE.MeshStandardMaterial({
            color: group ? GROUP_COLOR[group] : "#8b919b",
            roughness: 0.55,
            metalness: 0,
            transparent: true,
          });
          mesh.material = mat;
          parts.push({ mesh, group, mat });
        });

        const paint = (sel: MuscleGroupKey[]) => {
          const some = sel.length > 0;
          for (const p of parts) {
            const on = p.group !== null && (!some || sel.includes(p.group));
            p.mat.opacity =
              p.group === null ? (some ? 0.05 : 0.3) : on ? 1 : 0.12;
            p.mat.emissive.set(on && some ? GROUP_COLOR[p.group!] : "#000000");
            p.mat.emissiveIntensity = on && some ? 0.25 : 0;
            p.mat.depthWrite = on;
          }
          render();
        };

        // Front/Back is an absolute reset: the camera jumps to the original front or back pose (same
        // height, distance and target as on load), whatever the user dragged or zoomed.
        const setView = (v: "front" | "back") => {
          const to = { az: v === "front" ? 0 : Math.PI, polar: Math.PI / 2, radius: dist };
          controls.target.copy(center);
          camera.position.set(
            center.x + to.radius * Math.sin(to.polar) * Math.sin(to.az),
            center.y + to.radius * Math.cos(to.polar),
            center.z + to.radius * Math.sin(to.polar) * Math.cos(to.az),
          );
          controls.update();
        };

        // The move button turns the model like OrbitControls does: a full turn per canvas height of travel.
        const rotateBy = (dx: number, dy: number) => {
          const off = camera.position.clone().sub(controls.target);
          const sph = new THREE.Spherical().setFromVector3(off);
          const k = (2 * Math.PI) / (renderer.domElement.clientHeight || 1);
          sph.theta -= dx * k;
          sph.phi = Math.min(Math.PI - 0.01, Math.max(0.01, sph.phi - dy * k));
          camera.position.copy(controls.target).add(off.setFromSpherical(sph));
          camera.lookAt(controls.target);
          controls.update();
          render();
        };

        // The observer also calls it with the size the canvas has already (its first call): that draws nothing. A hidden
        // canvas (0x0) forgets the size, as a browser may drop its drawing buffer: shown again, it is drawn again.
        let size = "";
        const resize = () => {
          const w = el.clientWidth;
          const h = el.clientHeight;
          if (!w || !h) size = "";
          if (!w || !h || size === `${w}x${h}`) return;
          size = `${w}x${h}`;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          render();
        };
        const ro = new ResizeObserver(resize);
        ro.observe(el);

        // A click (not a drag) picks the muscle under the pointer; clicking elsewhere clears the selection.
        const ray = new THREE.Raycaster();
        let down: [number, number] | null = null;
        const canvas = renderer.domElement;
        const onDown = (e: PointerEvent) => {
          down = [e.clientX, e.clientY];
        };
        const onUp = (e: PointerEvent) => {
          if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5)
            return;
          const r = canvas.getBoundingClientRect();
          ray.setFromCamera(
            new THREE.Vector2(
              ((e.clientX - r.left) / r.width) * 2 - 1,
              -((e.clientY - r.top) / r.height) * 2 + 1,
            ),
            camera,
          );
          const hit = ray.intersectObjects(
            parts.filter((p) => p.group).map((p) => p.mesh),
            false,
          )[0];
          const g = hit && MESH_GROUP[hit.object.name];
          if (g) onSelectRef.current(g, e.shiftKey || e.ctrlKey || e.metaKey); // empty space changes nothing
        };
        canvas.addEventListener("pointerdown", onDown);
        canvas.addEventListener("pointerup", onUp);

        api.current = { setSelected: paint, setView, rotateBy };
        camera.position.set(center.x, center.y, center.z + dist);
        setView("front");
        resize();
        paint(selectedRef.current);
        drawing = true;
        render();
        setStatus("ready");

        cleanup = () => {
          touch.removeEventListener("change", applyPointer);
          ro.disconnect();
          canvas.removeEventListener("pointerdown", onDown);
          canvas.removeEventListener("pointerup", onUp);
          controls.dispose();
          for (const p of parts) p.mat.dispose(); // the geometry stays: it is cached for the next view
          renderer.dispose();
          canvas.remove();
        };
      } catch {
        if (!disposed) setStatus("error");
      }
    })();

    return () => {
      disposed = true;
      api.current = null;
      cleanup();
    };
  }, []);

  return (
    <div className="muscle-stage">
      <div
        ref={host}
        className="muscle-canvas"
        role="img"
        aria-label="3D muscle model. Use the muscle group buttons for a keyboard-friendly alternative."
      />
      {status === "loading" && <p className="muscle-note">Loading model...</p>}
      {status === "error" && (
        <p className="muscle-note">
          3D view is not available here. Use the muscle buttons instead.
        </p>
      )}
      {/* Its own strip under the model, so the buttons never sit over the body */}
      <div className="muscle-views">
        {status === "ready" && (
          <div className="muscle-side-switch">
            <Segmented
              label="Model side"
              value={side}
              options={[
                { value: "front", label: "Front" },
                { value: "back", label: "Back" },
              ]}
              onChange={(v) => {
                setSide(v);
                api.current?.setView(v);
              }}
            />
          </div>
        )}
        {status === "ready" && (
          <button
            type="button"
            className={`muscle-move${holding ? " active" : ""}`}
            aria-label="Hold and slide to move the model"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId); // the finger keeps moving the model wherever it slides
              lastPoint.current = [e.clientX, e.clientY];
              setHolding(true);
            }}
            onPointerMove={(e) => {
              const last = lastPoint.current;
              if (!last) return;
              api.current?.rotateBy(e.clientX - last[0], e.clientY - last[1]);
              lastPoint.current = [e.clientX, e.clientY];
            }}
            onPointerUp={() => {
              lastPoint.current = null;
              setHolding(false);
            }}
            onPointerCancel={() => {
              lastPoint.current = null;
              setHolding(false);
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <ArrowsIcon size={18} />
          </button>
        )}
        {/* Always rendered so the strip never shifts; it shows once the picked muscles differ from the day's */}
        <SmallButton
          className="muscle-back"
          onClick={onGoBack}
          style={{ visibility: canGoBack ? "visible" : "hidden" }}
          aria-hidden={!canGoBack}
          tabIndex={canGoBack ? 0 : -1}
        >
          Go back
        </SmallButton>
      </div>
    </div>
  );
}

interface PlannedExercise {
  id: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  targetSets: number;
  minReps: number;
  maxReps: number;
  dayName: string;
}

/** A day's target for an exercise: "3 × 8 – 12". */
const range = (e: PlannedExercise) => `${e.targetSets} × ${e.minReps} – ${e.maxReps}`;

const sameGroups = (a: MuscleGroupKey[], b: MuscleGroupKey[]) => a.length === b.length && a.every((g) => b.includes(g));

/** 3D model + group chips; the muscles picked list the exercises of the user's split that train them. The day on screen picks its own muscles to start with. */
export function MuscleExplorer({
  planned,
  dayGroups,
}: {
  planned: PlannedExercise[];
  dayGroups: MuscleGroupKey[];
}) {
  const [selected, setSelected] = useState<MuscleGroupKey[]>(dayGroups);
  // Another training day on screen: its muscles are picked again (state adjusted while rendering, not in an effect).
  const [seenDay, setSeenDay] = useState(dayGroups);
  if (!sameGroups(seenDay, dayGroups)) {
    setSeenDay(dayGroups);
    setSelected(dayGroups);
  }
  const toggle = (g: MuscleGroupKey) => setSelected((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]));
  // A tap picks one muscle (a second tap clears it); Shift, Ctrl or Cmd adds to the picked ones.
  const pick = (g: MuscleGroupKey, additive: boolean) =>
    setSelected((s) => (additive ? (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]) : sameGroups(s, [g]) ? [] : [g]));
  const setsOf = (g: MuscleGroupKey) =>
    planned
      .filter((e) => e.muscleGroup === g)
      .reduce((n, e) => n + e.targetSets, 0);
  const otherSets = planned.filter((e) => !MUSCLE_GROUP_KEYS.includes(e.muscleGroup as MuscleGroupKey)).reduce((n, e) => n + e.targetSets, 0);
  // One row per exercise even when it is on several days of the split, each day with its own sets and reps.
  const list: (PlannedExercise & { days: PlannedExercise[] })[] = [];
  for (const e of planned) {
    if (!selected.includes(e.muscleGroup as MuscleGroupKey)) continue;
    const row = list.find((r) => r.exerciseId === e.exerciseId);
    if (row) row.days.push(e);
    else list.push({ ...e, days: [e] });
  }
  const title = selected.length === 1 ? `${MUSCLE_GROUP_LABEL[selected[0]]} workouts` : "Workouts for the picked muscles";

  return (
    <Card
      id="muscle-title"
      title="Muscle map"
      className="muscle-card"
      end={
        // Always rendered so the card never shifts when it appears
        <SmallButton
          onClick={() => setSelected([])}
          style={{ visibility: selected.length ? "visible" : "hidden" }}
          aria-hidden={!selected.length}
          tabIndex={selected.length ? 0 : -1}
        >
          Show all
        </SmallButton>
      }
    >
      <div className="muscle-layout">
        <MuscleMap
          selected={selected}
          onSelect={pick}
          onGoBack={() => setSelected(dayGroups)}
          canGoBack={dayGroups.length > 0 && !sameGroups(selected, dayGroups)}
        />

        <div className="muscle-side">
          <div className="muscle-chips" role="group" aria-label="Muscle group">
            {MUSCLE_GROUP_KEYS.map((g) => (
              <button
                key={g}
                type="button"
                className={`muscle-chip${selected.includes(g) ? " active" : ""}`}
                aria-pressed={selected.includes(g)}
                onClick={() => toggle(g)}
              >
                <span
                  className="muscle-dot"
                  style={{ background: GROUP_COLOR[g] }}
                  aria-hidden="true"
                />
                {MUSCLE_GROUP_LABEL[g]}
              </button>
            ))}
          </div>

          {selected.length ? (
            <div>
              <GroupLabel>{title}</GroupLabel>
              <ListBox wash className="entries muscle-entries">
                {list.length === 0 && (
                  <EmptyNote key="empty">No exercise in your split trains {selected.length === 1 ? "this muscle" : "these muscles"}.</EmptyNote>
                )}
                {list.map((e) => {
                  // Days with one target show it once at the row's end; days with different targets show each its own.
                  const one = e.days.every((d) => range(d) === range(e));
                  return (
                    <div key={e.exerciseId} className="entry-row">
                      <div className="entry-main entry-stack">
                        <strong>{e.exerciseName}</strong>
                        <MuscleTag group={e.muscleGroup} />
                        {e.days.map((day, i) => (
                          <span key={i} className="muted entry-detail">
                            {one ? day.dayName : <>{day.dayName} · <span className="number-tabular">{range(day)}</span></>}
                          </span>
                        ))}
                      </div>
                      {one && <span className="muted number-tabular">{range(e)}</span>}
                    </div>
                  );
                })}
              </ListBox>
            </div>
          ) : (
            <div>
              <GroupLabel>Planned sets per week</GroupLabel>
              <HBars
                rows={[
                  ...MUSCLE_GROUP_KEYS.filter((g) => setsOf(g) > 0).map((g) => ({ label: MUSCLE_GROUP_LABEL[g], value: setsOf(g), display: String(setsOf(g)) })),
                  // A custom exercise filed under "Other" has no spot on the model, so its sets get their own bar.
                  ...(otherSets > 0 ? [{ label: "Other", value: otherSets, display: String(otherSets) }] : []),
                ]}
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
