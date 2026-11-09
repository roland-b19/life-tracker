"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { HBars } from "../components/charts";
import { AutoHeight, useListMotion } from "../components/list-motion";
import { Segmented } from "../components/segmented";
import {
  GROUP_COLOR,
  GROUP_LABEL,
  MESH_GROUP,
  MUSCLE_GROUPS,
  type MuscleGroup,
} from "./muscle-groups";

interface MapApi {
  setSelected(g: MuscleGroup | null): void;
  setView(v: "front" | "back"): void;
}

/** Interactive 3D muscle model. Click a muscle to select its group; the chips next to it do the same without WebGL. */
function MuscleMap({
  selected,
  onSelect,
}: {
  selected: MuscleGroup | null;
  onSelect: (g: MuscleGroup | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<MapApi | null>(null);
  const selectedRef = useRef(selected);
  const onSelectRef = useRef(onSelect);
  const [side, setSide] = useState<"front" | "back">("front");
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
        const { GLTFLoader } =
          await import("three/examples/jsm/loaders/GLTFLoader.js");
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

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const render = () => renderer.render(scene, camera);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.addEventListener("change", render);

        const gltf = await new GLTFLoader().loadAsync("/models/muscles.glb");
        if (disposed) {
          renderer.dispose();
          return;
        }
        scene.add(gltf.scene);

        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        const height = box.getSize(new THREE.Vector3()).y;
        const dist =
          (height / 2 / Math.tan((camera.fov * Math.PI) / 360)) * 1.1;
        controls.target.copy(center);
        controls.minDistance = dist * 0.35;
        controls.maxDistance = dist * 1.6;

        const parts: {
          mesh: InstanceType<typeof THREE.Mesh>;
          group: MuscleGroup | null;
          mat: InstanceType<typeof THREE.MeshStandardMaterial>;
        }[] = [];
        gltf.scene.traverse((o) => {
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

        const paint = (sel: MuscleGroup | null) => {
          for (const p of parts) {
            const on = p.group !== null && (sel === null || p.group === sel);
            p.mat.opacity =
              p.group === null ? (sel ? 0.05 : 0.3) : on ? 1 : 0.12;
            p.mat.emissive.set(on && sel ? GROUP_COLOR[p.group!] : "#000000");
            p.mat.emissiveIntensity = on && sel ? 0.25 : 0;
            p.mat.depthWrite = on;
          }
          render();
        };

        // Front/Back turns the camera half a circle around the model (ease in-out), staying at the same
        // height and distance; touching the model stops it, and reduced motion jumps instead.
        let frame = 0;
        const stopTurn = () => cancelAnimationFrame(frame);
        const setView = (v: "front" | "back", animate = true) => {
          stopTurn();
          const offset = camera.position.clone().sub(controls.target);
          const radius = Math.hypot(offset.x, offset.z);
          const from = Math.atan2(offset.x, offset.z);
          const to = v === "front" ? 0 : Math.PI;
          // Shortest way round, so a model dragged near the target does not spin the long way.
          const delta = ((((to - from) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
          const place = (angle: number) => {
            camera.position.set(
              controls.target.x + Math.sin(angle) * radius,
              camera.position.y,
              controls.target.z + Math.cos(angle) * radius,
            );
            controls.update();
          };
          if (!animate || reduceMotion.matches || Math.abs(delta) < 0.001) return place(to);
          const start = performance.now();
          const step = (now: number) => {
            const t = Math.min((now - start) / 700, 1);
            place(from + delta * (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2));
            if (t < 1) frame = requestAnimationFrame(step);
          };
          frame = requestAnimationFrame(step);
        };

        const resize = () => {
          const w = el.clientWidth;
          const h = el.clientHeight;
          if (!w || !h) return;
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
          stopTurn();
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
          const g = (hit && MESH_GROUP[hit.object.name]) || null;
          onSelectRef.current(g && g === selectedRef.current ? null : g);
        };
        canvas.addEventListener("pointerdown", onDown);
        canvas.addEventListener("pointerup", onUp);

        api.current = { setSelected: paint, setView };
        camera.position.set(center.x, center.y, center.z + dist);
        setView("front", false);
        resize();
        paint(selectedRef.current);
        setStatus("ready");

        cleanup = () => {
          stopTurn();
          ro.disconnect();
          canvas.removeEventListener("pointerdown", onDown);
          canvas.removeEventListener("pointerup", onUp);
          controls.dispose();
          for (const p of parts) {
            p.mesh.geometry.dispose();
            p.mat.dispose();
          }
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
      {status === "ready" && (
        <div className="muscle-views">
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
    </div>
  );
}

export interface PlannedExercise {
  id: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  equipmentType: string;
  targetSets: number;
  minReps: number;
  maxReps: number;
  dayName: string;
}

/** 3D model + group chips; picking a group lists the exercises of the user's split that train it. */
export function MuscleExplorer({ planned }: { planned: PlannedExercise[] }) {
  const [selected, setSelectedNow] = useState<MuscleGroup | null>(null);
  const { rowRef, fadeAll } = useListMotion();
  // The current rows fade out before the list switches, like every other list switch.
  const setSelected = (g: MuscleGroup | null) => g !== selected && fadeAll(() => setSelectedNow(g));
  const setsOf = (g: MuscleGroup) =>
    planned
      .filter((e) => e.muscleGroup === g)
      .reduce((n, e) => n + e.targetSets, 0);
  // One row per exercise even when it is on several days of the split.
  const list: (PlannedExercise & { days: string[] })[] = [];
  for (const e of planned) {
    if (e.muscleGroup !== selected) continue;
    const row = list.find((r) => r.exerciseId === e.exerciseId);
    if (row) row.days.push(e.dayName);
    else list.push({ ...e, days: [e.dayName] });
  }

  return (
    <section className="surface muscle-card" aria-labelledby="muscle-title">
      <div className="section-head">
        <h2 id="muscle-title" className="section-title">
          Muscle map
        </h2>
        {/* Always rendered so the card never shifts when it appears */}
        <button
          type="button"
          className="btn-sm tint"
          onClick={() => setSelected(null)}
          style={{ visibility: selected ? "visible" : "hidden" }}
          aria-hidden={!selected}
          tabIndex={selected ? 0 : -1}
        >
          Show all
        </button>
      </div>

      <div className="muscle-layout">
        <MuscleMap selected={selected} onSelect={setSelected} />

        <div className="muscle-side">
          <div className="muscle-chips" role="group" aria-label="Muscle group">
            {MUSCLE_GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                className={`muscle-chip${selected === g ? " active" : ""}`}
                aria-pressed={selected === g}
                onClick={() => setSelected(selected === g ? null : g)}
              >
                <span
                  className="muscle-dot"
                  style={{ background: GROUP_COLOR[g] }}
                  aria-hidden="true"
                />
                {GROUP_LABEL[g]}
              </button>
            ))}
          </div>

          {selected ? (
            <div>
            <h3 className="group-label">{GROUP_LABEL[selected]} workouts</h3>
            {/* The title stays outside the list, so the first row starts the stagger. */}
            <AutoHeight wash className="entries muscle-entries">
              {list.length === 0 && (
                <p key={`empty-${selected}`} ref={rowRef("empty")} className="empty-note">
                  No exercise in your split trains this muscle.
                </p>
              )}
              {/* Keyed by the group so every switch mounts fresh rows that play row-in. */}
              <Fragment key={selected}>
              {list.map((e) => (
                <div key={e.exerciseId} ref={rowRef(e.exerciseId)} className="entry-row">
                  <div>
                    <strong>{e.exerciseName}</strong>
                    <span className="muted muscle-day">{e.days.join(", ")}</span>
                  </div>
                  <span className="muted number-tabular">
                    {e.targetSets} × {e.minReps} – {e.maxReps}
                  </span>
                </div>
              ))}
              </Fragment>
            </AutoHeight>
            </div>
          ) : (
            <div>
              <h3 className="group-label">Planned sets per week</h3>
              <HBars
                rows={MUSCLE_GROUPS.map((g) => ({
                  label: GROUP_LABEL[g],
                  value: setsOf(g),
                  display: String(setsOf(g)),
                }))}
              />
            </div>
          )}
        </div>
      </div>

    </section>
  );
}
