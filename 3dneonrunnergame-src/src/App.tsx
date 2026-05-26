import { useEffect, useMemo, useRef, useState, type RefObject, type TouchEvent } from "react";
import * as THREE from "three";

type Page = "home" | "play" | "leaderboard" | "settings" | "about";

interface RunResult {
  id: string;
  player: string;
  score: number;
  coins: number;
  date: string;
}

interface GameSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  vibrationEnabled: boolean;
  graphicsQuality: "high" | "medium";
  username: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface FullscreenDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
}

interface FullscreenElement extends HTMLDivElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

const STORAGE = {
  highScore: "neonRunner.highScore",
  runHistory: "neonRunner.runHistory",
  settings: "neonRunner.settings",
} as const;

function readJson<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) {
      return fallback;
    }
    return JSON.parse(item) as T;
  } catch {
    return fallback;
  }
}

function RunnerGame({
  settings,
  highScore,
  isFullscreen,
  onRunComplete,
  onToggleFullscreen,
  shellRef,
}: {
  settings: GameSettings;
  highScore: number;
  isFullscreen: boolean;
  onRunComplete: (result: RunResult) => void;
  onToggleFullscreen: () => void;
  shellRef: RefObject<HTMLDivElement | null>;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "start" | "playing" | "paused" | "gameover">("loading");
  const [loadingProgress, setLoadingProgress] = useState(8);
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [speedText, setSpeedText] = useState(0);
  const [shieldTime, setShieldTime] = useState(0);
  const [boostTime, setBoostTime] = useState(0);

  const finalScoreRef = useRef(0);
  const finalCoinsRef = useRef(0);
  const vibrationLockRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const musicIntervalRef = useRef<number | null>(null);
  const statusRef = useRef(status);
  const settingsRef = useRef(settings);
  const onRunCompleteRef = useRef(onRunComplete);
  const audioRef = useRef<{
    ctx: AudioContext | null;
    master: GainNode | null;
  }>({ ctx: null, master: null });

  const updateStatus = (next: "loading" | "start" | "playing" | "paused" | "gameover") => {
    statusRef.current = next;
    setStatus(next);
  };

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    onRunCompleteRef.current = onRunComplete;
  }, [onRunComplete]);

  const ensureAudio = () => {
    if (!audioRef.current.ctx) {
      const ctx = new window.AudioContext();
      const master = ctx.createGain();
      master.gain.value = settingsRef.current.soundEnabled ? 0.16 : 0;
      master.connect(ctx.destination);
      audioRef.current = { ctx, master };
    }
    if (audioRef.current.ctx?.state === "suspended") {
      void audioRef.current.ctx.resume();
    }
    if (audioRef.current.master) {
      audioRef.current.master.gain.value = settingsRef.current.soundEnabled ? 0.16 : 0;
    }
  };

  const playTone = (freq: number, duration: number, type: OscillatorType, gain = 0.22) => {
    if (!settingsRef.current.soundEnabled) {
      return;
    }
    ensureAudio();
    const ctx = audioRef.current.ctx;
    const master = audioRef.current.master;
    if (!ctx || !master) {
      return;
    }
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.value = gain;
    osc.connect(amp);
    amp.connect(master);
    const now = ctx.currentTime;
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.start(now);
    osc.stop(now + duration);
  };

  const playJumpSound = () => {
    playTone(360, 0.14, "triangle", 0.2);
  };

  const playCoinSound = () => {
    playTone(880, 0.08, "square", 0.18);
  };

  const playCrashSound = () => {
    playTone(130, 0.3, "sawtooth", 0.3);
  };

  useEffect(() => {
    if (!audioRef.current.master) {
      return;
    }
    audioRef.current.master.gain.value = settings.soundEnabled ? 0.16 : 0;
  }, [settings.soundEnabled]);

  useEffect(() => {
    // Lightweight synthetic soundtrack keeps the demo self-contained without external audio files.
    if (musicIntervalRef.current) {
      window.clearInterval(musicIntervalRef.current);
      musicIntervalRef.current = null;
    }
    if (status !== "playing" || !settings.musicEnabled) {
      return;
    }
    const notes = [196, 246.94, 293.66, 369.99, 246.94, 329.63];
    let index = 0;
    musicIntervalRef.current = window.setInterval(() => {
      playTone(notes[index % notes.length], 0.15, "sine", 0.06);
      index += 1;
    }, 320);
    return () => {
      if (musicIntervalRef.current) {
        window.clearInterval(musicIntervalRef.current);
        musicIntervalRef.current = null;
      }
    };
  }, [settings.musicEnabled, status]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLoadingProgress((prev) => {
        const next = Math.min(prev + 10, 100);
        if (next >= 100) {
          window.clearInterval(timer);
          window.setTimeout(() => updateStatus("start"), 300);
        }
        return next;
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) {
      return;
    }

    // Scene graph is kept minimal for stable framerate on mobile devices.
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x02030a, 38, 160);

    const camera = new THREE.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 0.1, 420);
    camera.position.set(0, 6, 15);
    camera.lookAt(0, 2, -30);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    const resizeRenderer = () => {
      if (!mountRef.current) {
        return;
      }
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, settingsRef.current.graphicsQuality === "high" ? 2 : 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0x75c6ff, 0x0d0328, 0.9);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0x7b4dff, 1.3);
    keyLight.position.set(6, 16, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x00d6ff, 2.2, 110);
    rimLight.position.set(0, 8, -28);
    scene.add(rimLight);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 420),
      new THREE.MeshStandardMaterial({ color: 0x060612, roughness: 0.8, metalness: 0.2 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.z = -165;
    road.receiveShadow = true;
    scene.add(road);

    const laneMaterial = new THREE.MeshBasicMaterial({ color: 0x2d3de6, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 180; i += 1) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 2.6), laneMaterial);
      marker.position.set(-3, 0.02, -i * 3.3);
      scene.add(marker);
      const marker2 = marker.clone();
      marker2.position.x = 3;
      scene.add(marker2);
    }

    const player = new THREE.Group();
    const playerBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.72, 1.2, 8, 14),
      new THREE.MeshStandardMaterial({ color: 0x19e7ff, emissive: 0x111155, metalness: 0.5, roughness: 0.2 }),
    );
    playerBody.castShadow = true;
    playerBody.position.y = 1.6;
    player.add(playerBody);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.25, 0.2),
      new THREE.MeshBasicMaterial({ color: 0xc075ff }),
    );
    visor.position.set(0, 2, 0.6);
    player.add(visor);

    scene.add(player);

    const ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x64f5ff, transparent: true, opacity: 0.2 });
    const ghostTrail: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i += 1) {
      const ghost = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.2, 8, 12), ghostMaterial.clone());
      (ghost.material as THREE.MeshBasicMaterial).opacity = 0.16 - i * 0.03;
      scene.add(ghost);
      ghostTrail.push(ghost);
    }

    const particleGeometry = new THREE.SphereGeometry(0.07, 8, 8);
    const particleMaterial = new THREE.MeshBasicMaterial({ color: 0x6af9ff });
    const particles: Array<{ mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }> = [];

    const obstacles: Array<{ mesh: THREE.Mesh; width: number; height: number }> = [];
    const coinObjects: THREE.Mesh[] = [];
    const powerups: Array<{ mesh: THREE.Mesh; kind: "shield" | "boost" }> = [];

    const state = {
      running: false,
      lane: 0,
      targetX: 0,
      y: 0,
      vy: 0,
      speed: 17,
      score: 0,
      coins: 0,
      shield: 0,
      boost: 0,
      obstacleTimer: 0,
      coinTimer: 0,
      powerTimer: 5,
      shake: 0,
      lastUI: 0,
    };

    const spawnObstacle = () => {
      const lane = [-3, 0, 3][Math.floor(Math.random() * 3)];
      const height = 1.2 + Math.random() * 1.6;
      const width = 1 + Math.random() * 0.7;
      const obstacle = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, 1.4),
        new THREE.MeshStandardMaterial({ color: 0x8d2eff, emissive: 0x29034d, roughness: 0.35, metalness: 0.8 }),
      );
      obstacle.position.set(lane, height / 2, -120);
      obstacle.castShadow = true;
      scene.add(obstacle);
      obstacles.push({ mesh: obstacle, width, height });
    };

    const spawnCoinLine = () => {
      const lane = [-3, 0, 3][Math.floor(Math.random() * 3)];
      const groupSize = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < groupSize; i += 1) {
        const coin = new THREE.Mesh(
          new THREE.TorusGeometry(0.4, 0.11, 8, 18),
          new THREE.MeshStandardMaterial({ color: 0xffde59, emissive: 0x6a5300, metalness: 0.85, roughness: 0.25 }),
        );
        coin.rotation.x = Math.PI / 2;
        coin.position.set(lane, 1.4 + (i % 2) * 0.45, -90 - i * 4);
        scene.add(coin);
        coinObjects.push(coin);
      }
    };

    const spawnPowerup = () => {
      const lane = [-3, 0, 3][Math.floor(Math.random() * 3)];
      const kind: "shield" | "boost" = Math.random() > 0.5 ? "shield" : "boost";
      const geometry = kind === "shield" ? new THREE.IcosahedronGeometry(0.55, 0) : new THREE.OctahedronGeometry(0.6, 0);
      const power = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: kind === "shield" ? 0x39f5ff : 0xff49ef,
          emissive: kind === "shield" ? 0x003a4b : 0x4f0747,
          metalness: 0.4,
          roughness: 0.15,
        }),
      );
      power.position.set(lane, 1.4, -110);
      scene.add(power);
      powerups.push({ mesh: power, kind });
    };

    const spawnBurst = (x: number, y: number, z: number, color: number) => {
      for (let i = 0; i < 16; i += 1) {
        const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone());
        (particle.material as THREE.MeshBasicMaterial).color = new THREE.Color(color);
        particle.position.set(x, y, z);
        scene.add(particle);
        const spread = new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          Math.random() * 3,
          (Math.random() - 0.5) * 4,
        );
        particles.push({ mesh: particle, velocity: spread, life: 0.6 + Math.random() * 0.5 });
      }
    };

    const resetGame = () => {
      [...obstacles].forEach((item) => scene.remove(item.mesh));
      obstacles.length = 0;
      [...coinObjects].forEach((coin) => scene.remove(coin));
      coinObjects.length = 0;
      [...powerups].forEach((item) => scene.remove(item.mesh));
      powerups.length = 0;
      [...particles].forEach((item) => scene.remove(item.mesh));
      particles.length = 0;

      state.running = true;
      state.lane = 0;
      state.targetX = 0;
      state.y = 0;
      state.vy = 0;
      state.speed = 17;
      state.score = 0;
      state.coins = 0;
      state.shield = 0;
      state.boost = 0;
      state.obstacleTimer = 0.6;
      state.coinTimer = 0.25;
      state.powerTimer = 5;
      state.shake = 0;
      state.lastUI = 0;
      finalScoreRef.current = 0;
      finalCoinsRef.current = 0;
      player.position.set(0, 0, 8);
      setScore(0);
      setCoins(0);
      setSpeedText(17);
      setShieldTime(0);
      setBoostTime(0);
      updateStatus("playing");
      ensureAudio();
      playTone(260, 0.2, "triangle", 0.2);
    };

    const attemptMove = (direction: -1 | 1) => {
      if (statusRef.current !== "playing") {
        return;
      }
      state.lane = Math.max(-1, Math.min(1, state.lane + direction));
      state.targetX = state.lane * 3;
      ensureAudio();
      playTone(direction > 0 ? 320 : 280, 0.07, "square", 0.1);
    };

    const attemptJump = () => {
      if (statusRef.current !== "playing") {
        return;
      }
      if (state.y <= 0.03) {
        state.vy = 13.2;
        playJumpSound();
      }
    };

    const pauseOrResume = () => {
      setStatus((prev) => {
        if (prev === "playing") {
          statusRef.current = "paused";
          return "paused";
        }
        if (prev === "paused") {
          statusRef.current = "playing";
          return "playing";
        }
        return prev;
      });
    };

    const vibration = (duration: number) => {
      if (!settingsRef.current.vibrationEnabled || vibrationLockRef.current) {
        return;
      }
      if ("vibrate" in navigator) {
        navigator.vibrate(duration);
      }
      vibrationLockRef.current = true;
      window.setTimeout(() => {
        vibrationLockRef.current = false;
      }, 120);
    };

    const gameOver = () => {
      if (!state.running) {
        return;
      }
      state.running = false;
      updateStatus("gameover");
      playCrashSound();
      vibration(180);
      const result: RunResult = {
        id: `${Date.now()}`,
        player: settingsRef.current.username || "Guest",
        score: Math.floor(state.score),
        coins: state.coins,
        date: new Date().toISOString(),
      };
      onRunCompleteRef.current(result);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        attemptMove(-1);
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        attemptMove(1);
      }
      if (event.key === "ArrowUp" || event.key === " " || event.key.toLowerCase() === "w") {
        event.preventDefault();
        attemptJump();
      }
      if (event.key === "Escape" || event.key.toLowerCase() === "p") {
        pauseOrResume();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resizeRenderer()) : null;
    resizeObserver?.observe(container);
    window.addEventListener("resize", resizeRenderer);

    const clock = new THREE.Clock();
    let animationFrame = 0;

    // Core endless-runner simulation loop: movement, spawn logic, collision, and rendering.
    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.032);

      if (statusRef.current === "playing" && state.running) {
        state.speed = Math.min(state.speed + dt * 0.65, 44);
        if (state.boost > 0) {
          state.boost = Math.max(0, state.boost - dt);
        }
        if (state.shield > 0) {
          state.shield = Math.max(0, state.shield - dt);
        }

        state.score += dt * (15 + state.speed * 0.8) * (state.boost > 0 ? 1.4 : 1);
        state.vy -= 34 * dt;
        state.y = Math.max(0, state.y + state.vy * dt);
        if (state.y === 0) {
          state.vy = 0;
        }

        player.position.x = THREE.MathUtils.lerp(player.position.x, state.targetX, dt * 13);
        player.position.y = state.y;
        player.position.z = 8;
        player.rotation.z = THREE.MathUtils.lerp(player.rotation.z, (state.targetX - player.position.x) * 0.08, dt * 8);

        ghostTrail.forEach((ghost, index) => {
          const shift = (index + 1) * 0.75;
          ghost.position.set(
            THREE.MathUtils.lerp(ghost.position.x, player.position.x, dt * (5 - index)),
            THREE.MathUtils.lerp(ghost.position.y, player.position.y + 1.6, dt * (4 - index * 0.4)),
            player.position.z + shift,
          );
          ghost.visible = state.boost > 0.02;
        });

        state.obstacleTimer -= dt;
        state.coinTimer -= dt;
        state.powerTimer -= dt;

        if (state.obstacleTimer <= 0) {
          spawnObstacle();
          state.obstacleTimer = Math.max(0.45, 1.2 - state.speed * 0.017);
        }
        if (state.coinTimer <= 0) {
          spawnCoinLine();
          state.coinTimer = 1.5;
        }
        if (state.powerTimer <= 0) {
          spawnPowerup();
          state.powerTimer = 8 + Math.random() * 4;
        }

        const worldVelocity = (state.speed + (state.boost > 0 ? 8 : 0)) * dt;

        for (let i = obstacles.length - 1; i >= 0; i -= 1) {
          const obstacle = obstacles[i];
          obstacle.mesh.position.z += worldVelocity;
          if (obstacle.mesh.position.z > 30) {
            scene.remove(obstacle.mesh);
            obstacles.splice(i, 1);
            continue;
          }

          const dx = Math.abs(obstacle.mesh.position.x - player.position.x);
          const dz = Math.abs(obstacle.mesh.position.z - player.position.z);
          const playerHeight = player.position.y + 1.6;
          if (dx < (obstacle.width + 1.2) / 2 && dz < 1.2 && playerHeight < obstacle.height + 0.45) {
            if (state.shield > 0) {
              state.shield = 0;
              scene.remove(obstacle.mesh);
              obstacles.splice(i, 1);
              spawnBurst(player.position.x, player.position.y + 1.2, player.position.z, 0x6efaff);
              state.shake = 0.2;
              vibration(80);
            } else {
              state.shake = 0.45;
              spawnBurst(player.position.x, player.position.y + 1.2, player.position.z, 0xff4fae);
              gameOver();
            }
          }
        }

        for (let i = coinObjects.length - 1; i >= 0; i -= 1) {
          const coin = coinObjects[i];
          coin.position.z += worldVelocity;
          coin.rotation.z += dt * 3.2;
          if (coin.position.z > 26) {
            scene.remove(coin);
            coinObjects.splice(i, 1);
            continue;
          }
          const dx = Math.abs(coin.position.x - player.position.x);
          const dz = Math.abs(coin.position.z - player.position.z);
          const dy = Math.abs(coin.position.y - (player.position.y + 1.1));
          if (dx < 0.8 && dz < 1 && dy < 1.1) {
            state.coins += state.boost > 0 ? 2 : 1;
            state.score += 24;
            playCoinSound();
            spawnBurst(coin.position.x, coin.position.y, coin.position.z, 0xffe36f);
            scene.remove(coin);
            coinObjects.splice(i, 1);
          }
        }

        for (let i = powerups.length - 1; i >= 0; i -= 1) {
          const powerup = powerups[i];
          powerup.mesh.position.z += worldVelocity;
          powerup.mesh.rotation.x += dt * 1.4;
          powerup.mesh.rotation.y += dt * 2.2;
          if (powerup.mesh.position.z > 26) {
            scene.remove(powerup.mesh);
            powerups.splice(i, 1);
            continue;
          }
          const dx = Math.abs(powerup.mesh.position.x - player.position.x);
          const dz = Math.abs(powerup.mesh.position.z - player.position.z);
          const dy = Math.abs(powerup.mesh.position.y - (player.position.y + 1.2));
          if (dx < 1 && dz < 1 && dy < 1.1) {
            if (powerup.kind === "shield") {
              state.shield = 6;
              playTone(460, 0.18, "triangle", 0.2);
              spawnBurst(powerup.mesh.position.x, powerup.mesh.position.y, powerup.mesh.position.z, 0x85ffff);
            } else {
              state.boost = 4;
              playTone(520, 0.21, "sawtooth", 0.16);
              spawnBurst(powerup.mesh.position.x, powerup.mesh.position.y, powerup.mesh.position.z, 0xff84f6);
            }
            scene.remove(powerup.mesh);
            powerups.splice(i, 1);
          }
        }

        for (let i = particles.length - 1; i >= 0; i -= 1) {
          const p = particles[i];
          p.life -= dt;
          p.velocity.y -= 8 * dt;
          p.mesh.position.addScaledVector(p.velocity, dt);
          (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life * 1.4);
          if (p.life <= 0) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
          }
        }

        if (state.shake > 0) {
          state.shake = Math.max(0, state.shake - dt * 3.2);
        }

        const shakeAmount = state.shake * 0.35;
        camera.position.x = (Math.random() - 0.5) * shakeAmount;
        camera.position.y = 6 + (Math.random() - 0.5) * shakeAmount;
        camera.lookAt(player.position.x * 0.15, 2.2, -34);

        state.lastUI += dt;
        if (state.lastUI > 0.08) {
          state.lastUI = 0;
          finalScoreRef.current = Math.floor(state.score);
          finalCoinsRef.current = state.coins;
          setScore(Math.floor(state.score));
          setCoins(state.coins);
          setSpeedText(Math.floor(state.speed));
          setShieldTime(Number(state.shield.toFixed(1)));
          setBoostTime(Number(state.boost.toFixed(1)));
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    const cleanup = () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", resizeRenderer);
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(animationFrame);
      if (musicIntervalRef.current) {
        window.clearInterval(musicIntervalRef.current);
      }
      renderer.dispose();
      scene.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat: THREE.Material) => mat.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };

    const api = {
      resetGame,
      pauseOrResume,
      attemptMove,
      attemptJump,
    };

    (container as HTMLDivElement & { gameApi?: typeof api }).gameApi = api;
    return cleanup;
  }, []);

  const runApi = (fn: (api: {
    resetGame: () => void;
    pauseOrResume: () => void;
    attemptMove: (direction: -1 | 1) => void;
    attemptJump: () => void;
  }) => void) => {
    const api = (mountRef.current as HTMLDivElement & {
      gameApi?: {
        resetGame: () => void;
        pauseOrResume: () => void;
        attemptMove: (direction: -1 | 1) => void;
        attemptJump: () => void;
      };
    })?.gameApi;
    if (api) {
      fn(api);
    }
  };

  const beginTouch = (event: TouchEvent) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const endTouch = (event: TouchEvent) => {
    if (!touchStartRef.current) {
      return;
    }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 24) {
      runApi((api) => api.attemptMove(dx > 0 ? 1 : -1));
    } else if (dy < -30) {
      runApi((api) => api.attemptJump());
    }
  };

  return (
    <div
      ref={shellRef}
      className={
        isFullscreen
          ? "fixed inset-0 z-50 h-[100dvh] w-screen overflow-hidden bg-black"
          : "relative min-h-[75vh] w-full overflow-hidden rounded-2xl border border-cyan-400/30 bg-black/60 shadow-[0_0_45px_rgba(34,211,238,0.25)]"
      }
    >
      <div
        ref={mountRef}
        className={`${isFullscreen ? "h-[100dvh]" : "h-[75vh]"} w-full ${status === "playing" ? "motion-blur" : ""}`}
        onTouchStart={beginTouch}
        onTouchEnd={endTouch}
      />

      <div className="pointer-events-none absolute left-0 top-0 flex w-full items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 py-3 text-cyan-100">
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Neo Rush 3D</div>
        <div className="flex items-center gap-4 text-sm">
          <span>Score {score}</span>
          <span>Coins {coins}</span>
          <span>Speed {speedText}</span>
        </div>
      </div>

      <div className="absolute right-3 top-3 z-20">
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="rounded-full border border-cyan-300/70 bg-black/55 px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-cyan-100 transition hover:bg-black/75"
        >
          {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        </button>
      </div>

      <div className="pointer-events-none absolute left-0 right-0 top-12 mx-auto flex w-fit items-center gap-3 text-xs uppercase tracking-widest text-fuchsia-200/90">
        {shieldTime > 0 && <span className="rounded-full border border-cyan-300/60 bg-cyan-400/15 px-3 py-1">Shield {shieldTime}s</span>}
        {boostTime > 0 && <span className="rounded-full border border-fuchsia-300/70 bg-fuchsia-400/15 px-3 py-1">Boost {boostTime}s</span>}
      </div>

      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-cyan-100">
          <h3 className="text-2xl font-semibold">Loading Cyber Runner</h3>
          <div className="mt-5 h-2 w-56 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-to-r from-cyan-400 to-fuchsia-400" style={{ width: `${loadingProgress}%` }} />
          </div>
          <p className="mt-3 text-xs tracking-widest text-cyan-300/80">{loadingProgress}%</p>
        </div>
      )}

      {status === "start" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 px-6 text-center text-cyan-100">
          <h2 className="text-4xl font-bold text-white">NEO RUSH</h2>
          <p className="mt-3 max-w-lg text-cyan-200/90">
            Dodge neon obstacles, collect coins, and survive as speed ramps up every second.
          </p>
          <div className="mt-7 flex gap-3">
            <button
              type="button"
              onClick={() => runApi((api) => api.resetGame())}
              className="rounded-full border border-cyan-300/70 bg-cyan-400/15 px-6 py-2 text-sm font-medium tracking-widest transition hover:bg-cyan-300/30"
            >
              Start Run
            </button>
          </div>
          <p className="mt-4 text-xs text-cyan-200/75">Use Arrow keys / WASD / touch swipe</p>
        </div>
      )}

      {status === "paused" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-cyan-100">
          <h3 className="text-3xl font-semibold">Paused</h3>
          <button
            type="button"
            onClick={() => runApi((api) => api.pauseOrResume())}
            className="mt-4 rounded-full border border-cyan-300/80 bg-cyan-400/20 px-5 py-2 text-sm tracking-widest transition hover:bg-cyan-300/30"
          >
            Resume
          </button>
        </div>
      )}

      {status === "gameover" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-center text-cyan-100">
          <h3 className="text-3xl font-semibold text-white">Game Over</h3>
          <p className="mt-3 text-cyan-200">Score {finalScoreRef.current} | Coins {finalCoinsRef.current}</p>
          <p className="mt-1 text-sm text-fuchsia-200">High Score {Math.max(highScore, finalScoreRef.current)}</p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => runApi((api) => api.resetGame())}
              className="rounded-full border border-cyan-300/70 bg-cyan-400/15 px-6 py-2 text-sm tracking-widest transition hover:bg-cyan-300/30"
            >
              Restart
            </button>
            <button
              type="button"
              onClick={() => updateStatus("start")}
              className="rounded-full border border-fuchsia-300/70 bg-fuchsia-400/15 px-6 py-2 text-sm tracking-widest transition hover:bg-fuchsia-300/30"
            >
              Menu
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 px-3 sm:hidden">
        <button
          type="button"
          onClick={() => runApi((api) => api.attemptMove(-1))}
          className="rounded-full border border-cyan-300/60 bg-cyan-500/25 px-4 py-2 text-xs uppercase tracking-widest text-white"
        >
          Left
        </button>
        <button
          type="button"
          onClick={() => runApi((api) => api.attemptJump())}
          className="rounded-full border border-fuchsia-300/60 bg-fuchsia-500/25 px-4 py-2 text-xs uppercase tracking-widest text-white"
        >
          Jump
        </button>
        <button
          type="button"
          onClick={() => runApi((api) => api.attemptMove(1))}
          className="rounded-full border border-cyan-300/60 bg-cyan-500/25 px-4 py-2 text-xs uppercase tracking-widest text-white"
        >
          Right
        </button>
      </div>

      <div className="absolute bottom-3 right-3 hidden sm:flex">
        <button
          type="button"
          onClick={() => runApi((api) => api.pauseOrResume())}
          className="rounded-full border border-cyan-300/70 bg-black/50 px-4 py-2 text-xs uppercase tracking-[0.2em] text-cyan-100 transition hover:bg-black/75"
        >
          Pause / Resume
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [highScore, setHighScore] = useState(() => readJson<number>(STORAGE.highScore, 0));
  const [runHistory, setRunHistory] = useState<RunResult[]>(() => readJson<RunResult[]>(STORAGE.runHistory, []));
  const [settings, setSettings] = useState<GameSettings>(() =>
    readJson<GameSettings>(STORAGE.settings, {
      soundEnabled: true,
      musicEnabled: true,
      vibrationEnabled: true,
      graphicsQuality: "high",
      username: "Guest",
    }),
  );
  const [loginInput, setLoginInput] = useState(settings.username || "");
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false);
  const [pendingFullscreenEntry, setPendingFullscreenEntry] = useState(false);
  const gameShellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Persist user settings so the game feels stateful across sessions.
    localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE.highScore, JSON.stringify(highScore));
  }, [highScore]);

  useEffect(() => {
    localStorage.setItem(STORAGE.runHistory, JSON.stringify(runHistory));
  }, [runHistory]);

  useEffect(() => {
    localStorage.removeItem("neonRunner.firebaseConfig");
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      });
    }
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    const fullscreenDocument = document as FullscreenDocument;
    const syncFullscreenState = () => {
      const fullscreenElement = document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
      setIsNativeFullscreen(fullscreenElement === gameShellRef.current);
    };

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState as EventListener);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState as EventListener);
    };
  }, []);

  const isGameFullscreen = isNativeFullscreen || isFallbackFullscreen;

  useEffect(() => {
    if (!isGameFullscreen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isGameFullscreen]);

  useEffect(() => {
    if (!isFallbackFullscreen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFallbackFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isFallbackFullscreen]);

  useEffect(() => {
    if (page !== "play" || !pendingFullscreenEntry) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setPendingFullscreenEntry(false);
      void toggleFullscreen();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [page, pendingFullscreenEntry]);

  const handleRunComplete = (result: RunResult) => {
    setHighScore((prev) => Math.max(prev, result.score));
    setRunHistory((prev) => [result, ...prev].slice(0, 20));
  };

  const topRuns = useMemo(() => [...runHistory].sort((a, b) => b.score - a.score).slice(0, 10), [runHistory]);

  const requestInstall = async () => {
    if (!installPromptEvent) {
      return;
    }
    await installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    setInstallPromptEvent(null);
  };

  const toggleFullscreen = async () => {
    const target = gameShellRef.current as FullscreenElement | null;
    const fullscreenDocument = document as FullscreenDocument;
    const fullscreenElement = document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;

    if (!target) {
      return;
    }

    if (fullscreenElement === target) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
        return;
      }
      if (fullscreenDocument.webkitExitFullscreen) {
        await fullscreenDocument.webkitExitFullscreen();
        return;
      }
    }

    if (isFallbackFullscreen) {
      setIsFallbackFullscreen(false);
      return;
    }

    try {
      if (target.requestFullscreen) {
        await target.requestFullscreen();
        return;
      }
      if (target.webkitRequestFullscreen) {
        await target.webkitRequestFullscreen();
        return;
      }
    } catch {
      // Some mobile browsers reject the fullscreen API even on user gesture, so we fall back to an app-shell overlay.
    }

    setIsFallbackFullscreen(true);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#151432_0%,_#06060d_35%,_#020206_100%)] text-white">
      <header className="border-b border-cyan-500/25 bg-black/40 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/80">Cyber Arcade</p>
            <h1 className="text-2xl font-black tracking-[0.2em] text-cyan-100">NEO RUSH 3D</h1>
          </div>
          <nav className="flex flex-wrap gap-2">
            {(["home", "play", "leaderboard", "settings", "about"] as Page[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPage(item)}
                className={`rounded-full px-4 py-2 text-xs uppercase tracking-widest transition ${
                  page === item
                    ? "border border-cyan-300/70 bg-cyan-400/15 text-cyan-100"
                    : "border border-white/10 bg-white/5 text-cyan-200/70 hover:border-cyan-400/50 hover:text-cyan-100"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {page === "home" && (
          <section className="relative isolate overflow-hidden rounded-3xl border border-cyan-400/30 bg-black/55 px-6 py-12 sm:px-10 sm:py-16">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_22%_28%,rgba(0,255,255,0.26),transparent_42%),radial-gradient(circle_at_80%_70%,rgba(202,68,255,0.24),transparent_52%),linear-gradient(160deg,#05070f_0%,#020206_70%)]" />
            <div className="absolute inset-0 -z-10 bg-[repeating-linear-gradient(90deg,rgba(45,86,255,0.11)_0,rgba(45,86,255,0.11)_1px,transparent_1px,transparent_38px)] opacity-35" />
            <div className="max-w-2xl">
              <p className="text-sm uppercase tracking-[0.25em] text-cyan-300/85">Viral-style endless runner</p>
              <h2 className="mt-3 text-5xl font-black leading-tight text-white sm:text-6xl">NEO RUSH 3D</h2>
              <p className="mt-4 text-base text-cyan-100/80">
                Hyper-fast obstacle survival with reactive neon lighting, realistic motion physics, particle bursts, and speed escalation built for
                desktop and mobile controls.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setPage("play")}
                  className="rounded-full border border-cyan-300/80 bg-cyan-400/15 px-6 py-3 text-sm uppercase tracking-[0.2em] transition hover:bg-cyan-300/35"
                >
                  Play Now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPage("play");
                    setPendingFullscreenEntry(true);
                  }}
                  className="rounded-full border border-fuchsia-300/80 bg-fuchsia-400/15 px-6 py-3 text-sm uppercase tracking-[0.2em] transition hover:bg-fuchsia-300/35"
                >
                  {isGameFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                </button>
                {installPromptEvent && (
                  <button
                    type="button"
                    onClick={() => void requestInstall()}
                    className="rounded-full border border-violet-300/80 bg-violet-400/15 px-6 py-3 text-sm uppercase tracking-[0.2em] transition hover:bg-violet-300/35"
                  >
                    Install PWA
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {page === "play" && (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-cyan-100">Play Game</h2>
                <p className="text-sm text-cyan-200/80">High score {highScore} | Player {settings.username || "Guest"}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="rounded-full border border-cyan-300/60 bg-cyan-400/15 px-4 py-2 text-xs uppercase tracking-widest text-cyan-100"
                >
                  {isGameFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                </button>
              </div>
            </div>
            <RunnerGame
              settings={settings}
              highScore={highScore}
              isFullscreen={isGameFullscreen}
              onRunComplete={handleRunComplete}
              onToggleFullscreen={toggleFullscreen}
              shellRef={gameShellRef}
            />
          </section>
        )}

        {page === "leaderboard" && (
          <section>
            <h2 className="text-3xl font-semibold text-cyan-100">Leaderboard</h2>
            <p className="mt-2 text-sm text-cyan-200/80">Top local runs saved in browser localStorage.</p>
            <div className="mt-6 overflow-x-auto rounded-2xl border border-cyan-500/25 bg-black/35">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-cyan-500/25 bg-cyan-950/40 text-xs uppercase tracking-widest text-cyan-200/80">
                  <tr>
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Coins</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {topRuns.length === 0 && (
                    <tr>
                      <td className="px-4 py-5 text-cyan-200/70" colSpan={5}>
                        No runs yet. Start a game to generate ranking data.
                      </td>
                    </tr>
                  )}
                  {topRuns.map((run, index) => (
                    <tr key={run.id} className="border-b border-white/5 text-cyan-100/90">
                      <td className="px-4 py-3">#{index + 1}</td>
                      <td className="px-4 py-3">{run.player}</td>
                      <td className="px-4 py-3 font-semibold text-fuchsia-200">{run.score}</td>
                      <td className="px-4 py-3">{run.coins}</td>
                      <td className="px-4 py-3">{new Date(run.date).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {page === "settings" && (
          <section className="space-y-6">
            <div>
              <h2 className="text-3xl font-semibold text-cyan-100">Settings</h2>
              <p className="mt-2 text-sm text-cyan-200/80">Audio, controls, and player identity options.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-cyan-500/25 bg-black/30 p-5">
                <h3 className="text-lg font-medium">Player Login</h3>
                <p className="mt-1 text-sm text-cyan-200/75">Simple local login system for run identity.</p>
                <div className="mt-4 flex gap-2">
                  <input
                    value={loginInput}
                    onChange={(event) => setLoginInput(event.target.value)}
                    maxLength={18}
                    className="w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm outline-none ring-cyan-300/40 transition focus:ring"
                    placeholder="Enter player name"
                  />
                  <button
                    type="button"
                    onClick={() => setSettings((prev) => ({ ...prev, username: loginInput.trim() || "Guest" }))}
                    className="rounded-lg border border-cyan-300/70 bg-cyan-400/15 px-4 py-2 text-xs uppercase tracking-widest"
                  >
                    Save
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-500/25 bg-black/30 p-5">
                <h3 className="text-lg font-medium">Gameplay Controls</h3>
                <div className="mt-4 space-y-3 text-sm text-cyan-100/90">
                  <label className="flex items-center justify-between gap-3">
                    <span>Sound Effects</span>
                    <input
                      type="checkbox"
                      checked={settings.soundEnabled}
                      onChange={(event) => setSettings((prev) => ({ ...prev, soundEnabled: event.target.checked }))}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    <span>Background Music</span>
                    <input
                      type="checkbox"
                      checked={settings.musicEnabled}
                      onChange={(event) => setSettings((prev) => ({ ...prev, musicEnabled: event.target.checked }))}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    <span>Vibration Feedback</span>
                    <input
                      type="checkbox"
                      checked={settings.vibrationEnabled}
                      onChange={(event) => setSettings((prev) => ({ ...prev, vibrationEnabled: event.target.checked }))}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    <span>Graphics Quality</span>
                    <select
                      value={settings.graphicsQuality}
                      onChange={(event) =>
                        setSettings((prev) => ({ ...prev, graphicsQuality: event.target.value as "high" | "medium" }))
                      }
                      className="rounded-md border border-white/15 bg-black/60 px-2 py-1"
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          </section>
        )}

        {page === "about" && (
          <section className="space-y-4">
            <h2 className="text-3xl font-semibold text-cyan-100">About Game</h2>
            <p className="max-w-3xl text-cyan-100/80">
              NEO RUSH 3D is a cyberpunk endless obstacle runner built with React, Tailwind, and Three.js. It includes keyboard/touch controls,
              local login, coins, power-ups, dynamic speed scaling, collision physics, pause/resume, local leaderboard, PWA install support,
              and service-worker caching structure.
            </p>
            <p className="max-w-3xl text-cyan-100/80">
              Run history and player settings are stored locally in the browser, which keeps the arcade experience fast, simple, and fully
              self-contained.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
