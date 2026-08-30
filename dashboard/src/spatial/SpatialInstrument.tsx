import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Agent } from '../lib/api';

export type InstrumentMode = 'LANDING' | 'CONNECT' | 'HANDSHAKE' | 'COMMAND';
export type SpatialSceneMode = 'constellation' | 'cascade' | 'drift' | 'threat';

interface SpatialInstrumentProps {
  mode: InstrumentMode;
  sceneMode?: SpatialSceneMode;
  agents: Agent[];
  hoveredAgentId: string | null;
  selectedAgentId: string | null;
  onHoverAgent?: (agentId: string | null) => void;
  onSelectAgent?: (agentId: string) => void;
}

type NodeObject = {
  mesh: THREE.Mesh;
  hitMesh: THREE.Mesh;
  halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  pixelCubes: THREE.Mesh[];
  agent: Agent;
  baseY: number;
  angle: number;
  baseColor: number;
};

type DataPulse = {
  mesh: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  progress: number;
  speed: number;
};

const AGENT_COLORS = [
  0x00f2ff, // Electric Cyan (Query Planner)
  0xa855f7, // Aurora Violet (Paper Indexer)
  0x10b981, // Neon Emerald (Claim Verifier)
  0xf43f5e, // Sunset Rose (Synthesis Engine)
  0xf59e0b, // Amber Gold
  0x38bdf8, // Sky Blue
];

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
    else mesh.material?.dispose();
  });
}

export function SpatialInstrument({
  mode,
  sceneMode = 'constellation',
  agents,
  hoveredAgentId,
  selectedAgentId,
  onHoverAgent,
  onSelectAgent,
}: SpatialInstrumentProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rebuildSceneRef = useRef<(() => void) | null>(null);
  const reducedMotion = useReducedMotion();

  const stateRef = useRef({
    mode,
    sceneMode,
    agents,
    hoveredAgentId,
    selectedAgentId,
    targetCameraPos: new THREE.Vector3(0, 2.5, 16),
    targetCameraLookAt: new THREE.Vector3(0, 0, 0),
    currentCameraLookAt: new THREE.Vector3(0, 0, 0),
    targetRotation: { x: 0, y: 0 },
  });

  stateRef.current.mode = mode;
  stateRef.current.sceneMode = sceneMode;
  stateRef.current.agents = agents;
  stateRef.current.hoveredAgentId = hoveredAgentId;
  stateRef.current.selectedAgentId = selectedAgentId;

  useEffect(() => {
    rebuildSceneRef.current?.();
  }, [agents, sceneMode]);

  useEffect(() => {
    if (selectedAgentId) {
      const index = agents.findIndex((agent) => agent.agent_id === selectedAgentId);
      if (index !== -1) {
        const total = Math.max(agents.length, 1);
        const angle = (index / total) * Math.PI * 2;
        const radius = topologyRadius(agents.length);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        stateRef.current.targetCameraPos.set(x * 1.15, 1.8, z * 1.15 + 4.2);
        stateRef.current.targetCameraLookAt.set(x, 0, z);
        return;
      }
    }

    if (mode === 'LANDING') {
      if (sceneMode === 'cascade') {
        stateRef.current.targetCameraPos.set(0, 3.5, 14);
        stateRef.current.targetCameraLookAt.set(0, 0, 0);
      } else if (sceneMode === 'drift') {
        stateRef.current.targetCameraPos.set(4, 3.0, 13);
        stateRef.current.targetCameraLookAt.set(0, 0, 0);
      } else if (sceneMode === 'threat') {
        stateRef.current.targetCameraPos.set(0, 6.0, 12);
        stateRef.current.targetCameraLookAt.set(0, -0.5, 0);
      } else {
        stateRef.current.targetCameraPos.set(0, 2.2, 16);
        stateRef.current.targetCameraLookAt.set(0, 0, 0);
      }
      return;
    }

    const targets: Record<InstrumentMode, [number, number, number, number, number, number]> = {
      LANDING: [0, 2.2, 16, 0, 0, 0],
      CONNECT: [0, 1.2, 11, 0, -0.1, 0],
      HANDSHAKE: [0, 3.2, 13, 0, 0, 0],
      COMMAND: [0, 6.0, 14, 0, -0.4, 0],
    };
    const [x, y, z, lookX, lookY, lookZ] = targets[mode];
    stateRef.current.targetCameraPos.set(x, y, z);
    stateRef.current.targetCameraLookAt.set(lookX, lookY, lookZ);
  }, [mode, sceneMode, selectedAgentId, agents]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030508, 0.032);

    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.copy(stateRef.current.targetCameraPos);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
      container.appendChild(renderer.domElement);
    } catch {
      return;
    }

    // ── Apple Aurora Multi-Point Illumination ──
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(8, 14, 10);
    scene.add(keyLight);

    const cyanPoint = new THREE.PointLight(0x00f2ff, 3.0, 30);
    cyanPoint.position.set(-8, 3, -4);
    scene.add(cyanPoint);

    const violetPoint = new THREE.PointLight(0xa855f7, 3.0, 30);
    violetPoint.position.set(8, -2, -4);
    scene.add(violetPoint);

    const rosePoint = new THREE.PointLight(0xf43f5e, 2.2, 25);
    rosePoint.position.set(0, -6, 6);
    scene.add(rosePoint);

    // ── Colorful Chromatic Particle Nebula ──
    const starCount = 450;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    const palette = [
      new THREE.Color(0x00f2ff),
      new THREE.Color(0xa855f7),
      new THREE.Color(0x10b981),
      new THREE.Color(0xf43f5e),
      new THREE.Color(0xfbbf24),
    ];

    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 40;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 26;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 32 - 2;

      const col = palette[i % palette.length];
      starColors[i * 3] = col.r;
      starColors[i * 3 + 1] = col.g;
      starColors[i * 3 + 2] = col.b;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 0.075,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // ── 3D Pixel Grid Floor ──
    const gridHelper = new THREE.GridHelper(36, 36, 0x00f2ff, 0x1e293b);
    gridHelper.position.y = -3.5;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.25;
    scene.add(gridHelper);

    // Scene Groups
    const mainGroup = new THREE.Group();
    const guideGroup = new THREE.Group();
    const pulseGroup = new THREE.Group();
    scene.add(mainGroup, guideGroup, pulseGroup);

    const nodeObjects: NodeObject[] = [];
    const hitTargets: THREE.Mesh[] = [];
    const dataPulses: DataPulse[] = [];

    function clearGroup(group: THREE.Group) {
      group.children.forEach(disposeObject);
      group.clear();
    }

    function rebuildScene() {
      clearGroup(mainGroup);
      clearGroup(guideGroup);
      clearGroup(pulseGroup);
      nodeObjects.length = 0;
      hitTargets.length = 0;
      dataPulses.length = 0;

      const currentMode = stateRef.current.sceneMode;
      const currentAgents = stateRef.current.agents;

      // ── MODE 1: NEURAL CONSTELLATION ──────────────────────────────
      if (currentMode === 'constellation') {
        const displayAgents: (Agent | { agent_id: string; agent_role: string; current_asi: number; avg_risk_score: number })[] =
          currentAgents.length > 0
            ? currentAgents
            : [
                { agent_id: 'query_planner', agent_role: 'Query Planner', current_asi: 96, avg_risk_score: 0.08, first_seen: '', last_seen: '', total_spans: 1420, total_errors: 2, error_rate: 0.001, avg_latency_ms: 124, pipeline_id: 'p1' },
                { agent_id: 'paper_indexer', agent_role: 'Paper Indexer', current_asi: 92, avg_risk_score: 0.14, first_seen: '', last_seen: '', total_spans: 2840, total_errors: 5, error_rate: 0.002, avg_latency_ms: 310, pipeline_id: 'p1' },
                { agent_id: 'claim_verifier', agent_role: 'Claim Verifier', current_asi: 88, avg_risk_score: 0.21, first_seen: '', last_seen: '', total_spans: 1980, total_errors: 12, error_rate: 0.006, avg_latency_ms: 240, pipeline_id: 'p1' },
                { agent_id: 'synthesis_engine', agent_role: 'Synthesis Engine', current_asi: 94, avg_risk_score: 0.11, first_seen: '', last_seen: '', total_spans: 1650, total_errors: 4, error_rate: 0.002, avg_latency_ms: 450, pipeline_id: 'p1' },
              ];

        const count = displayAgents.length;
        const radius = topologyRadius(count);
        const nodePositions: THREE.Vector3[] = [];

        displayAgents.forEach((agent, index) => {
          const angle = (index / count) * Math.PI * 2;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          const baseY = (index % 2 === 0 ? 0.35 : -0.35) + Math.sin(index * 1.6) * 0.25;
          const pos = new THREE.Vector3(x, baseY, z);
          nodePositions.push(pos);

          const baseColor = AGENT_COLORS[index % AGENT_COLORS.length];

          // Luminous Outer Shell (Frosted Iridescent Glass)
          const nodeGeo = new THREE.SphereGeometry(0.38, 32, 32);
          const nodeMat = new THREE.MeshPhysicalMaterial({
            color: baseColor,
            emissive: baseColor,
            emissiveIntensity: 0.35,
            roughness: 0.1,
            metalness: 0.4,
            transmission: 0.6,
            thickness: 0.8,
            transparent: true,
            opacity: 0.9,
          });
          const node = new THREE.Mesh(nodeGeo, nodeMat);
          node.position.copy(pos);
          node.userData.agentId = agent.agent_id;

          // Glowing Inner Core
          const coreGeo = new THREE.IcosahedronGeometry(0.18, 1);
          const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          const core = new THREE.Mesh(coreGeo, coreMat);
          node.add(core);

          // Orbiting Micro Pixel Cubes (Pixel-Art touches in 3D)
          const pixelCubes: THREE.Mesh[] = [];
          for (let c = 0; c < 3; c++) {
            const cubeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
            const cubeMat = new THREE.MeshBasicMaterial({ color: baseColor });
            const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
            cubeMesh.position.set(Math.sin(c * 2) * 0.65, Math.cos(c * 2) * 0.3, Math.cos(c * 2) * 0.65);
            node.add(cubeMesh);
            pixelCubes.push(cubeMesh);
          }

          // Hit Target
          const hitTarget = new THREE.Mesh(
            new THREE.SphereGeometry(0.9, 12, 12),
            new THREE.MeshBasicMaterial({ visible: false })
          );
          hitTarget.position.copy(pos);
          hitTarget.userData.agentId = agent.agent_id;

          // Precision Focal Halo Ring
          const haloGeo = new THREE.RingGeometry(0.50, 0.55, 48);
          const haloMat = new THREE.MeshBasicMaterial({
            color: baseColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.2,
          });
          const halo = new THREE.Mesh(haloGeo, haloMat);
          halo.position.copy(pos);

          mainGroup.add(node, hitTarget, halo);
          nodeObjects.push({ mesh: node, hitMesh: hitTarget, halo, pixelCubes, agent: agent as Agent, baseY, angle, baseColor });
          hitTargets.push(hitTarget);
        });

        // Inter-Agent Luminous Filaments & Data Packets
        for (let i = 0; i < count; i++) {
          const nextIndex = (i + 1) % count;
          const p1 = nodePositions[i];
          const p2 = nodePositions[nextIndex];
          const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
          mid.y += 0.5;

          const curve = new THREE.CatmullRomCurve3([p1, mid, p2]);
          const filamentGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(28));
          const filamentMat = new THREE.LineBasicMaterial({
            color: AGENT_COLORS[i % AGENT_COLORS.length],
            transparent: true,
            opacity: 0.45,
          });
          guideGroup.add(new THREE.Line(filamentGeo, filamentMat));

          // Data Pulse Particle
          const pulseGeo = new THREE.SphereGeometry(0.08, 12, 12);
          const pulseMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
          pulseGroup.add(pulseMesh);

          dataPulses.push({
            mesh: pulseMesh,
            curve,
            progress: Math.random(),
            speed: 0.007 + Math.random() * 0.006,
          });
        }
      }

      // ── MODE 2: CASCADE EVALUATOR HOLOGRAM ────────────────────────
      else if (currentMode === 'cascade') {
        // Stage 1: MiniLM Embedding Hologram (Left)
        const s1Geo = new THREE.IcosahedronGeometry(1.2, 2);
        const s1Mat = new THREE.MeshStandardMaterial({
          color: 0x00f2ff,
          roughness: 0.2,
          metalness: 0.7,
          wireframe: true,
        });
        const stage1 = new THREE.Mesh(s1Geo, s1Mat);
        stage1.position.set(-3.8, 0, 0);
        mainGroup.add(stage1);

        const s1Core = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 16, 16),
          new THREE.MeshStandardMaterial({ color: 0x00f2ff, emissive: 0x00f2ff, emissiveIntensity: 0.5 })
        );
        stage1.add(s1Core);

        // Ambiguity Gate Ring (Center)
        const gateGeo = new THREE.TorusGeometry(1.5, 0.1, 16, 64);
        const gateMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.4 });
        const gate = new THREE.Mesh(gateGeo, gateMat);
        gate.rotation.y = Math.PI / 2;
        gate.position.set(0, 0, 0);
        mainGroup.add(gate);

        // Stage 2: DeBERTa NLI Core (Right)
        const s2Geo = new THREE.OctahedronGeometry(1.3, 0);
        const s2Mat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x10b981,
          emissiveIntensity: 0.4,
          roughness: 0.2,
          metalness: 0.8,
        });
        const stage2 = new THREE.Mesh(s2Geo, s2Mat);
        stage2.position.set(3.8, 0, 0);
        mainGroup.add(stage2);

        // Laser Beams
        const beamPts = [new THREE.Vector3(-3.8, 0, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(3.8, 0, 0)];
        const beamGeo = new THREE.BufferGeometry().setFromPoints(beamPts);
        const beamMat = new THREE.LineBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.8 });
        guideGroup.add(new THREE.Line(beamGeo, beamMat));
      }

      // ── MODE 3: SEMANTIC DRIFT VECTOR SPACE ────────────────────────
      else if (currentMode === 'drift') {
        const baseGeo = new THREE.SphereGeometry(0.7, 24, 24);
        const baseMat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x10b981,
          emissiveIntensity: 0.5,
          roughness: 0.2,
          metalness: 0.7,
        });
        const baseMesh = new THREE.Mesh(baseGeo, baseMat);
        baseMesh.position.set(-2.0, 0, 0);
        mainGroup.add(baseMesh);

        const tolGeo = new THREE.SphereGeometry(2.5, 20, 20);
        const tolMat = new THREE.MeshBasicMaterial({ color: 0x10b981, wireframe: true, transparent: true, opacity: 0.2 });
        const tolMesh = new THREE.Mesh(tolGeo, tolMat);
        tolMesh.position.set(-2.0, 0, 0);
        mainGroup.add(tolMesh);

        const driftGeo = new THREE.SphereGeometry(0.65, 24, 24);
        const driftMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xf59e0b,
          emissiveIntensity: 0.5,
          roughness: 0.2,
          metalness: 0.8,
        });
        const driftMesh = new THREE.Mesh(driftGeo, driftMat);
        driftMesh.position.set(2.6, 1.0, 0.5);
        mainGroup.add(driftMesh);

        const distPts = [new THREE.Vector3(-2.0, 0, 0), new THREE.Vector3(2.6, 1.0, 0.5)];
        const distGeo = new THREE.BufferGeometry().setFromPoints(distPts);
        const distMat = new THREE.LineDashedMaterial({ color: 0xf59e0b, dashSize: 0.25, gapSize: 0.12 });
        const line = new THREE.Line(distGeo, distMat);
        line.computeLineDistances();
        guideGroup.add(line);
      }

      // ── MODE 4: THREAT & RISK RADAR ────────────────────────────────
      else if (currentMode === 'threat') {
        [1.5, 3.0, 4.5, 6.0].forEach((r, idx) => {
          const ringGeo = new THREE.RingGeometry(r - 0.025, r + 0.025, 64);
          const ringMat = new THREE.MeshBasicMaterial({
            color: idx === 3 ? 0xf43f5e : 0x00f2ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.35,
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.rotation.x = -Math.PI / 2;
          mainGroup.add(ring);
        });

        const crossGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-6.2, 0, 0), new THREE.Vector3(6.2, 0, 0),
          new THREE.Vector3(0, 0, -6.2), new THREE.Vector3(0, 0, 6.2),
        ]);
        const crossMat = new THREE.LineBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.25 });
        guideGroup.add(new THREE.LineSegments(crossGeo, crossMat));

        const blipPositions = [
          { pos: new THREE.Vector3(2.4, 0.1, -2.0), color: 0xf43f5e },
          { pos: new THREE.Vector3(-3.2, 0.1, 2.5), color: 0xf59e0b },
          { pos: new THREE.Vector3(1.4, 0.1, 4.0), color: 0x10b981 },
        ];
        blipPositions.forEach((b) => {
          const blipGeo = new THREE.SphereGeometry(0.24, 16, 16);
          const blipMat = new THREE.MeshStandardMaterial({ color: b.color, emissive: b.color, emissiveIntensity: 0.8 });
          const blip = new THREE.Mesh(blipGeo, blipMat);
          blip.position.copy(b.pos);
          mainGroup.add(blip);
        });
      }
    }

    rebuildSceneRef.current = rebuildScene;
    rebuildScene();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const updatePointer = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      if (!reducedMotion) {
        stateRef.current.targetRotation.x = pointer.y * 0.08;
        stateRef.current.targetRotation.y = pointer.x * 0.12;
      }
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hitTargets)[0];
      const agentId = hit?.object.userData.agentId as string | undefined;
      container.style.cursor = agentId ? 'pointer' : 'default';
      onHoverAgent?.(agentId ?? null);
    };

    const selectPointer = () => {
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hitTargets)[0];
      const agentId = hit?.object.userData.agentId as string | undefined;
      if (agentId) onSelectAgent?.(agentId);
    };

    container.addEventListener('pointermove', updatePointer);
    container.addEventListener('pointerleave', () => onHoverAgent?.(null));
    container.addEventListener('click', selectPointer);

    const resize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', resize);

    let frameId: number | undefined;
    let visible = !document.hidden;
    const startTime = performance.now();

    const renderFrame = () => {
      const time = (performance.now() - startTime) * 0.001;
      const { hoveredAgentId: hovered, selectedAgentId: selected } = stateRef.current;

      if (!reducedMotion) {
        camera.position.lerp(stateRef.current.targetCameraPos, 0.05);
        stateRef.current.currentCameraLookAt.lerp(stateRef.current.targetCameraLookAt, 0.05);
        scene.rotation.y = THREE.MathUtils.lerp(scene.rotation.y, stateRef.current.targetRotation.y, 0.05);
        scene.rotation.x = THREE.MathUtils.lerp(scene.rotation.x, stateRef.current.targetRotation.x, 0.05);
        starField.rotation.y = time * 0.015;
      } else {
        camera.position.copy(stateRef.current.targetCameraPos);
        stateRef.current.currentCameraLookAt.copy(stateRef.current.targetCameraLookAt);
      }
      camera.lookAt(stateRef.current.currentCameraLookAt);

      dataPulses.forEach((dp) => {
        dp.progress = (dp.progress + dp.speed) % 1;
        const pt = dp.curve.getPoint(dp.progress);
        dp.mesh.position.copy(pt);
      });

      nodeObjects.forEach((item) => {
        const isFocused = item.agent.agent_id === hovered || item.agent.agent_id === selected;
        const material = item.mesh.material as THREE.MeshPhysicalMaterial;
        const haloMaterial = item.halo.material;

        if (!reducedMotion) {
          item.mesh.position.y = item.baseY + Math.sin(time * 1.2 + item.angle) * 0.05;
          item.hitMesh.position.copy(item.mesh.position);
          item.halo.position.copy(item.mesh.position);

          // Rotate orbiting pixel cubes
          item.pixelCubes.forEach((cube, cIdx) => {
            const cAngle = time * 2 + cIdx * ((Math.PI * 2) / 3);
            cube.position.set(Math.cos(cAngle) * 0.6, Math.sin(time * 3 + cIdx) * 0.2, Math.sin(cAngle) * 0.6);
            cube.rotation.x = time * 2;
            cube.rotation.y = time * 2;
          });
        }
        item.halo.lookAt(camera.position);

        if (isFocused) {
          material.emissiveIntensity = 0.9;
          haloMaterial.opacity = 0.85;
          if (!reducedMotion) item.halo.scale.setScalar(1 + Math.sin(time * 6) * 0.08);
          return;
        }

        material.emissiveIntensity = 0.35;
        haloMaterial.opacity = 0.2;
      });

      renderer.render(scene, camera);
    };

    const animate = () => {
      if (!visible) return;
      renderFrame();
      frameId = window.requestAnimationFrame(animate);
    };

    const visibilityChange = () => {
      visible = !document.hidden;
      if (visible && !reducedMotion && frameId === undefined) animate();
      if (visible && reducedMotion) renderFrame();
    };

    document.addEventListener('visibilitychange', visibilityChange);
    if (reducedMotion) renderFrame();
    else animate();

    return () => {
      container.removeEventListener('pointermove', updatePointer);
      container.removeEventListener('pointerleave', () => onHoverAgent?.(null));
      container.removeEventListener('click', selectPointer);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibilityChange);
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
      rebuildSceneRef.current = null;
      disposeObject(scene);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [reducedMotion, onHoverAgent, onSelectAgent]);

  return <div ref={mountRef} className="absolute inset-0 z-0 overflow-hidden select-none" aria-hidden="true" />;
}

function topologyRadius(count: number) {
  return Math.max(4.2, Math.min(7.2, 4.2 + count * 0.2));
}
