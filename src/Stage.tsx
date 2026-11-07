import { useT } from "./i18n";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Frame, Project, ViewSettings } from "./core";
import { clamp } from "./core";
import { TacticsEngine } from "./engine";
import type { FpsInput } from "./tactics";
import type { XgVisuals } from "./xg/visuals";

export interface StageHandle {
  capture: () => string | undefined;
  canvas: () => HTMLCanvasElement | undefined;
  fullscreen: () => void;
}
interface Props {
  xg?: XgVisuals;
  project: Project;
  frame: Frame;
  selected: string;
  settings: ViewSettings;
  onLook: (head: number, pitch: number) => void;
  onPause: () => void;
  onAspect: (aspect: number) => void;
  onControl: (input: FpsInput) => void;
}
export const Stage = forwardRef<StageHandle, Props>(function Stage(props, ref) {
  const t = useT();
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<TacticsEngine | null>(null),
    current = useRef(props);
  current.current = props;
  const rosterKey = JSON.stringify(props.project.roster);
  const [error, setError] = useState(""),
    [fps, setFps] = useState(0),
    [locked, setLocked] = useState(false),
    [inputError, setInputError] = useState(""),
    [inputActive, setInputActive] = useState(false);
  const activeInput = useRef(false),
    fpsDrag = useRef<{ x: number; y: number } | null>(null),
    pendingLook = useRef({ dx: 0, dy: 0 });
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const keys = new Set<string>();
    let raf = 0,
      last = 0;
    const release = () => {
      keys.clear();
      pendingLook.current = { dx: 0, dy: 0 };
      last = 0;
      activeInput.current = false;
      fpsDrag.current = null;
      setInputActive(false);
      setInputError("");
    };
    const lock = () => {
      const active = document.pointerLockElement === element;
      setLocked(active);
      if (!active) release();
    };
    const focused = () =>
      document.pointerLockElement === element ||
      (activeInput.current && document.activeElement === element);
    const keydown = (e: KeyboardEvent) => {
      if (!focused()) return;
      if (e.code === "Escape") {
        release();
        if (document.pointerLockElement === element) document.exitPointerLock();
        element.blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || !["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code))
        return;
      e.preventDefault();
      keys.add(e.code);
    };
    const keyup = (e: KeyboardEvent) => keys.delete(e.code);
    const mouse = (e: MouseEvent) => {
      const p = current.current;
      if (document.pointerLockElement !== element || !p.settings.fps || p.settings.camera !== "eye")
        return;
      pendingLook.current.dx += e.movementX;
      pendingLook.current.dy += e.movementY;
    };
    const tick = (now: number) => {
      const p = current.current;
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      if (focused() && p.settings.fps && p.settings.camera === "eye") {
        const forward = Number(keys.has("KeyW")) - Number(keys.has("KeyS")),
          right = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
        const { dx, dy } = pendingLook.current;
        pendingLook.current = { dx: 0, dy: 0 };
        if (forward || right || dx || dy)
          p.onControl({ forward, right, dx, dy, seconds: dt, sensitivity: p.settings.sensitivity });
      }
      raf = requestAnimationFrame(tick);
    };
    document.addEventListener("pointerlockchange", lock);
    document.addEventListener("keydown", keydown);
    document.addEventListener("keyup", keyup);
    document.addEventListener("mousemove", mouse);
    window.addEventListener("blur", release);
    element.addEventListener("blur", release);
    const hidden = () => {
      if (document.hidden) {
        release();
        if (document.pointerLockElement === element) document.exitPointerLock();
      }
    };
    document.addEventListener("visibilitychange", hidden);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      activeInput.current = false;
      fpsDrag.current = null;
      pendingLook.current = { dx: 0, dy: 0 };
      if (document.pointerLockElement === element) document.exitPointerLock();
      document.removeEventListener("pointerlockchange", lock);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("keyup", keyup);
      document.removeEventListener("mousemove", mouse);
      window.removeEventListener("blur", release);
      element.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    activeInput.current = false;
    setInputActive(false);
    setInputError("");
    fpsDrag.current = null;
    pendingLook.current = { dx: 0, dy: 0 };
    host.current?.blur();
    if (document.pointerLockElement === host.current) document.exitPointerLock();
  }, [props.settings.fps, props.settings.camera, props.selected]);
  const drag = useRef<{ x: number; y: number; head: number; pitch: number } | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      capture: () => engine.current?.capture(),
      canvas: () => engine.current?.canvas,
      fullscreen: () => {
        void host.current?.parentElement?.requestFullscreen().catch(() => {});
      },
    }),
    [],
  );
  useEffect(() => {
    if (!host.current) return;
    setError("");
    try {
      const instance = new TacticsEngine(
        host.current,
        props.project,
        props.settings,
        props.settings.quality,
      );
      instance.onStats = setFps;
      instance.onAspect = (aspect) => current.current.onAspect(aspect);
      engine.current = instance;
      if(host.current.clientWidth&&host.current.clientHeight) current.current.onAspect(host.current.clientWidth / host.current.clientHeight);
      const lost = (e: Event) => {
        e.preventDefault();
        setError(
          "GPUコンテキストを失いました。軽量モードに切り替えるか、ページを再読み込みしてください。",
        );
      };
      instance.canvas.addEventListener("webglcontextlost", lost);
      return () => {
        instance.canvas.removeEventListener("webglcontextlost", lost);
        instance.dispose();
        engine.current = null;
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "3D描画を初期化できませんでした。");
    }
  }, [props.settings.quality, rosterKey]);
  useEffect(() => {
    engine.current?.update(props.project, props.frame, props.selected, props.settings, props.xg);
  }, [props.project, props.frame, props.selected, props.settings, props.xg]);
  useEffect(() => {
    engine.current?.canvas.setAttribute("aria-label", t("リアルタイム3Dピッチ"));
  }, [t, props.settings.quality, rosterKey]);
  const player = props.project.roster.find((p) => p.id === props.selected)!;
  return (
    <div className="stage-shell" data-testid="stage" data-camera-player={props.selected}>
      <div
        ref={host}
        className="stage-canvas"
        tabIndex={0}
        aria-label={t("3D操作画面")}
        data-fps-active={inputActive}
        onPointerDown={(e) => {
          if (props.settings.camera !== "eye" || e.button !== 0) return;
          props.onPause();
          if (props.settings.fps) {
            e.currentTarget.focus();
            activeInput.current = true;
            setInputActive(true);
            fpsDrag.current = { x: e.clientX, y: e.clientY };
            if (document.pointerLockElement === host.current) return;
            if (inputError) {
              e.currentTarget.setPointerCapture(e.pointerId);
              return;
            }
            const fallback = () => {
              if (activeInput.current)
                setInputError("マウス固定を利用できません。WASD + マウス（画面内）· Esc 解除");
            };
            try {
              if (typeof e.currentTarget.requestPointerLock !== "function") fallback();
              else void Promise.resolve(e.currentTarget.requestPointerLock()).catch(fallback);
            } catch {
              fallback();
            }
            return;
          }
          const pose = props.frame.players[props.selected];
          drag.current = { x: e.clientX, y: e.clientY, head: pose.head, pitch: pose.pitch };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (props.settings.fps) {
            const start = fpsDrag.current;
            if (activeInput.current && !document.pointerLockElement) {
              if (start) {
                pendingLook.current.dx += e.clientX - start.x;
                pendingLook.current.dy += e.clientY - start.y;
              }
              fpsDrag.current = { x: e.clientX, y: e.clientY };
            }
            return;
          }
          const start = drag.current;
          if (!start) return;
          props.onLook(
            clamp(start.head + (e.clientX - start.x) * props.settings.sensitivity, -110, 110),
            clamp(start.pitch - (e.clientY - start.y) * props.settings.sensitivity, -35, 35),
          );
        }}
        onPointerUp={() => {
          drag.current = null;
          if (!props.settings.fps) fpsDrag.current = null;
        }}
        onPointerLeave={() => {
          if (!document.pointerLockElement) fpsDrag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
          fpsDrag.current = null;
        }}
      />
      {error ? (
        <div className="render-error" role="alert">
          <strong>{t("3D表示を開始できません")}</strong>
          <p>{t(error)}</p>
          <p>
            {t("WebGL 2対応ブラウザで、ハードウェアアクセラレーションを有効にしてください。2D編集とJSON保存は引き続き利用できます。")}
          </p>
        </div>
      ) : (
        <>
          <div className="stage-top">
            <span className="live-tag">
              <i /> LIVE VIEW
            </span>
            <span>
              {props.settings.lighting === "golden"
                ? "GOLDEN HOUR"
                : props.settings.lighting === "day"
                  ? "DAYLIGHT"
                  : "FLOODLIGHTS"}
            </span>
          </div>
          {props.settings.camera === "eye" && (
            <div className="crosshair">
              <i />
              <i />
            </div>
          )}
          <div className="stage-bottom">
            <div>
              <span className="eyebrow">
                {props.settings.camera === "eye"
                  ? "PLAYER'S EYE"
                  : props.settings.camera === "follow"
                    ? "FOLLOW CAMERA"
                    : "FREE CAMERA"}
              </span>
              <strong>
                {String(player.number).padStart(2, "0")}{" "}
                <span>
                  {player.role} · {player.team === "home" ? "HOME" : "AWAY"}
                </span>
              </strong>
            </div>
            <div className="lens-data">
              <span>{props.settings.eye.toFixed(2)} m</span>
              <span>H-FOV {props.settings.fov}°</span>
              <span>{fps > 0 ? `${fps} FPS` : "READY"}</span>
            </div>
          </div>
          <div className="look-hint">
            {t(inputError ||
              (props.settings.camera === "eye"
                ? props.settings.fps
                  ? locked
                    ? "WASD 移動 · マウス 旋回 · Esc 解除"
                    : "クリックでFPS開始 · WASD + マウス · Esc 解除"
                  : "ドラッグで首振り · 体の向きは変わりません"
                : props.settings.camera === "orbit"
                  ? "ドラッグで回転 · ホイールでズーム · 右ドラッグで移動"
                  : "選択した選手を後方から追従"))}
          </div>
        </>
      )}
    </div>
  );
});
