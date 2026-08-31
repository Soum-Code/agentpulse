import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface CyberDevice3DProps {
  scrollProgress?: number;
  activeScreenTab?: 'radar' | 'telemetry' | 'grounding' | 'drift';
  accentColor?: string;
  onDeviceClick?: () => void;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
    else mesh.material?.dispose();
  });
}

export function CyberDevice3D({
  scrollProgress = 0,
  activeScreenTab = 'radar',
  accentColor = '#00f2ff',
  onDeviceClick,
}: CyberDevice3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = useReducedMotion();
  const screenTextureRef = useRef<THREE.CanvasTexture | null>(null);

  // Mouse parallax
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, isDragging: false, dragStartX: 0, dragStartY: 0, rotX: 0, rotY: 0 });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ── Create Dynamic 2D Canvas for LCD Screen Texture ──
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 512;
    screenCanvas.height = 384;
    const ctx = screenCanvas.getContext('2d');
    canvasRef.current = screenCanvas;

    const screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.minFilter = THREE.LinearFilter;
    screenTexture.magFilter = THREE.NearestFilter;
    screenTextureRef.current = screenTexture;

    // ── Three.js Scene Setup ──
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 9.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // ── Lighting ──
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 2.4);
    mainLight.position.set(5, 8, 7);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    scene.add(mainLight);

    const rimIndigo = new THREE.PointLight(0x6366f1, 3.2, 18);
    rimIndigo.position.set(-6, -2, 4);
    scene.add(rimIndigo);

    const rimViolet = new THREE.PointLight(0x8b5cf6, 2.5, 18);
    rimViolet.position.set(6, -4, 3);
    scene.add(rimViolet);

    const bottomWarm = new THREE.PointLight(0xf59e0b, 1.8, 14);
    bottomWarm.position.set(0, -5, 2);
    scene.add(bottomWarm);

    // ── Root Device Group ──
    const deviceRoot = new THREE.Group();
    scene.add(deviceRoot);

    // ── 1. Translucent Acrylic Glass Shell (GameBoy Style) ──
    // Main Body Box with beveled curves
    const bodyGeo = new THREE.BoxGeometry(3.6, 5.2, 0.9);
    
    // Translucent Frosted Glass Material
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.18,
      metalness: 0.1,
      transmission: 0.88, // Translucent see-through glass!
      thickness: 1.2,
      ior: 1.52,
      specularIntensity: 1.0,
      specularColor: 0xffffff,
      transparent: true,
      opacity: 0.85,
    });
    const shellMesh = new THREE.Mesh(bodyGeo, shellMat);
    shellMesh.castShadow = true;
    shellMesh.receiveShadow = true;
    deviceRoot.add(shellMesh);

    // Front Bevel Border Frame
    const frameGeo = new THREE.BoxGeometry(3.4, 4.9, 0.85);
    const frameMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      roughness: 0.25,
      transmission: 0.75,
      thickness: 0.8,
      transparent: true,
      opacity: 0.5,
    });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.z = 0.04;
    deviceRoot.add(frameMesh);

    // ── 2. Internal PCB Circuit Board (Visible through translucent shell) ──
    const pcbGeo = new THREE.BoxGeometry(3.3, 4.8, 0.08);
    const pcbMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // Dark titanium PCB
      roughness: 0.4,
      metalness: 0.6,
    });
    const pcbMesh = new THREE.Mesh(pcbGeo, pcbMat);
    pcbMesh.position.z = -0.15;
    deviceRoot.add(pcbMesh);

    // Gold/Copper Circuit Traces on PCB
    const traceGeo = new THREE.PlaneGeometry(3.0, 4.4);
    const traceMat = new THREE.MeshStandardMaterial({
      color: 0x6366f1, // Indigo traces
      roughness: 0.3,
      metalness: 0.9,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const traceMesh = new THREE.Mesh(traceGeo, traceMat);
    traceMesh.position.z = -0.10;
    deviceRoot.add(traceMesh);

    // Central CPU Silicon Chip (AgentPulse Neural ASIC)
    const chipGeo = new THREE.BoxGeometry(1.1, 1.1, 0.16);
    const chipMat = new THREE.MeshStandardMaterial({
      color: 0x020617,
      roughness: 0.2,
      metalness: 0.85,
    });
    const chipMesh = new THREE.Mesh(chipGeo, chipMat);
    chipMesh.position.set(0, -1.1, -0.06);
    deviceRoot.add(chipMesh);

    // Glowing Logo on CPU Chip
    const chipLogoGeo = new THREE.PlaneGeometry(0.7, 0.7);
    const chipLogoMat = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      transparent: true,
      opacity: 0.9,
    });
    const chipLogo = new THREE.Mesh(chipLogoGeo, chipLogoMat);
    chipLogo.position.set(0, -1.1, 0.03);
    deviceRoot.add(chipLogo);

    // Micro Capacitors & Chips on Motherboard
    [
      [-1.1, -0.6], [-1.1, -1.3], [1.1, -0.6], [1.1, -1.3],
      [-0.8, -1.8], [0.8, -1.8], [0, -1.9]
    ].forEach(([cx, cy], idx) => {
      const capGeo = new THREE.BoxGeometry(0.32, 0.24, 0.18);
      const capMat = new THREE.MeshStandardMaterial({
        color: idx % 2 === 0 ? 0x6366f1 : 0x8b5cf6,
        roughness: 0.3,
        metalness: 0.7,
      });
      const capMesh = new THREE.Mesh(capGeo, capMat);
      capMesh.position.set(cx, cy, -0.05);
      deviceRoot.add(capMesh);
    });

    // ── 3. Illuminated LCD Screen Display ──
    const screenBorderGeo = new THREE.BoxGeometry(2.8, 2.1, 0.1);
    const screenBorderMat = new THREE.MeshStandardMaterial({
      color: 0x020617,
      roughness: 0.4,
      metalness: 0.8,
    });
    const screenBorder = new THREE.Mesh(screenBorderGeo, screenBorderMat);
    screenBorder.position.set(0, 1.1, 0.42);
    deviceRoot.add(screenBorder);

    const screenGeo = new THREE.PlaneGeometry(2.5, 1.8);
    const screenMat = new THREE.MeshBasicMaterial({
      map: screenTexture,
      transparent: true,
      opacity: 0.98,
    });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 1.1, 0.48);
    deviceRoot.add(screenMesh);

    // ── 4. Tactile Controls (D-Pad & A/B Buttons) ──
    // D-Pad Cross
    const dpadMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.4 });
    const dpadHGeo = new THREE.BoxGeometry(0.85, 0.28, 0.22);
    const dpadVGeo = new THREE.BoxGeometry(0.28, 0.85, 0.22);
    const dpadH = new THREE.Mesh(dpadHGeo, dpadMat);
    const dpadV = new THREE.Mesh(dpadVGeo, dpadMat);
    dpadH.position.set(-0.85, -0.45, 0.48);
    dpadV.position.set(-0.85, -0.45, 0.48);
    deviceRoot.add(dpadH, dpadV);

    // Action A/B Buttons (Electric Cyan & Neon Pink)
    const btnGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.22, 24);
    btnGeo.rotateX(Math.PI / 2);

    const btnAMat = new THREE.MeshStandardMaterial({ color: 0xff2e93, emissive: 0xff2e93, emissiveIntensity: 0.4, roughness: 0.2 });
    const btnBMat = new THREE.MeshStandardMaterial({ color: 0x00f2ff, emissive: 0x00f2ff, emissiveIntensity: 0.4, roughness: 0.2 });

    const btnA = new THREE.Mesh(btnGeo, btnAMat);
    const btnB = new THREE.Mesh(btnGeo, btnBMat);
    btnA.position.set(1.05, -0.32, 0.48);
    btnB.position.set(0.65, -0.58, 0.48);
    deviceRoot.add(btnA, btnB);

    // Speaker Grille Slits
    for (let s = 0; s < 5; s++) {
      const slitGeo = new THREE.BoxGeometry(0.06, 0.4, 0.08);
      const slitMat = new THREE.MeshBasicMaterial({ color: 0x020617 });
      const slit = new THREE.Mesh(slitGeo, slitMat);
      slit.rotation.z = Math.PI / 4;
      slit.position.set(0.7 + s * 0.15, -1.8 - s * 0.08, 0.46);
      deviceRoot.add(slit);
    }

    // ── Floating Ambient Data Particles around Device ──
    const pCount = 80;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount * 3; i += 3) {
      pPos[i] = (Math.random() - 0.5) * 8;
      pPos[i + 1] = (Math.random() - 0.5) * 8;
      pPos[i + 2] = (Math.random() - 0.5) * 4;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({ color: 0x00f2ff, size: 0.05, transparent: true, opacity: 0.7 });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // ── Mouse Drag & Parallax Interaction ──
    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      mouseRef.current.targetX = x * 0.45;
      mouseRef.current.targetY = y * 0.35;

      if (mouseRef.current.isDragging) {
        const deltaX = e.clientX - mouseRef.current.dragStartX;
        const deltaY = e.clientY - mouseRef.current.dragStartY;
        mouseRef.current.rotY += deltaX * 0.008;
        mouseRef.current.rotX += deltaY * 0.008;
        mouseRef.current.dragStartX = e.clientX;
        mouseRef.current.dragStartY = e.clientY;
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      mouseRef.current.isDragging = true;
      mouseRef.current.dragStartX = e.clientX;
      mouseRef.current.dragStartY = e.clientY;
    };

    const handlePointerUp = () => {
      mouseRef.current.isDragging = false;
    };

    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);

    // ── 2D Canvas Screen Animation Loop ──
    let frameCount = 0;
    const updateScreenTexture = () => {
      if (!ctx || !screenCanvas) return;
      frameCount++;

      // Background Cyber Screen
      ctx.fillStyle = '#050a14';
      ctx.fillRect(0, 0, screenCanvas.width, screenCanvas.height);

      // Pixel Grid Scanlines
      ctx.fillStyle = 'rgba(0, 242, 255, 0.04)';
      for (let y = 0; y < screenCanvas.height; y += 4) {
        ctx.fillRect(0, y, screenCanvas.width, 2);
      }

      // Top Status Bar
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, screenCanvas.width, 36);

      ctx.fillStyle = '#00f2ff';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('● AGENTPULSE CORE // v0.1.0', 16, 24);

      ctx.fillStyle = '#10b981';
      ctx.fillText('99.9% HEALTH', screenCanvas.width - 140, 24);

      // Animated Waveform / Radar in Center
      const centerY = 190;
      ctx.strokeStyle = '#00f2ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let x = 20; x < screenCanvas.width - 20; x += 6) {
        const sinVal = Math.sin((x * 0.04) + frameCount * 0.08) * 35;
        const noise = Math.sin((x * 0.15) + frameCount * 0.12) * 12;
        const y = centerY + sinVal + noise;
        if (x === 20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Secondary Waveform (Pink DeBERTa NLI Stream)
      ctx.strokeStyle = 'rgba(255, 46, 147, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 20; x < screenCanvas.width - 20; x += 8) {
        const sinVal = Math.cos((x * 0.03) - frameCount * 0.06) * 22;
        const y = centerY + 30 + sinVal;
        if (x === 20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Retro Pixel Text Diagnostics
      ctx.fillStyle = '#f8fafc';
      ctx.font = '14px monospace';
      ctx.fillText('SPAN_ID: #sp_e2e_48821', 24, 80);
      ctx.fillText('AGENT: Claim Verifier [0.08 RISK]', 24, 102);

      // Live Counters
      ctx.fillStyle = '#eab308';
      ctx.fillText(`GROUNDING: ${(0.94 + Math.sin(frameCount * 0.05) * 0.03).toFixed(3)}`, 24, 126);
      ctx.fillText(`LATENCY: ${(15.2 + Math.cos(frameCount * 0.05) * 1.2).toFixed(1)} ms`, 24, 148);

      // Bottom Activity Ticker
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, screenCanvas.height - 38, screenCanvas.width, 38);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px monospace';
      ctx.fillText('>>> 100% SPANS CAPTURED // ZERO LOSS WAL QUEUE ACTIVE', 16, screenCanvas.height - 14);

      if (screenTextureRef.current) {
        screenTextureRef.current.needsUpdate = true;
      }
    };

    // ── Animation Loop ──
    let frameId: number | undefined;
    const startTime = performance.now();

    const animate = () => {
      const time = (performance.now() - startTime) * 0.001;

      // Update screen 2D canvas texture
      updateScreenTexture();

      // Rotate ambient particles
      particles.rotation.y = time * 0.05;

      if (!reducedMotion) {
        // Interpolate mouse parallax & user drag
        mouseRef.current.x = THREE.MathUtils.lerp(mouseRef.current.x, mouseRef.current.targetX, 0.08);
        mouseRef.current.y = THREE.MathUtils.lerp(mouseRef.current.y, mouseRef.current.targetY, 0.08);

        // Smooth floating bobbing motion
        deviceRoot.position.y = Math.sin(time * 1.5) * 0.15;
        deviceRoot.position.x = Math.cos(time * 0.8) * 0.06;

        // Apply smooth 3D tilt & user rotation
        deviceRoot.rotation.x = -mouseRef.current.y + mouseRef.current.rotX;
        deviceRoot.rotation.y = mouseRef.current.x + mouseRef.current.rotY + Math.sin(time * 0.6) * 0.05;
        deviceRoot.rotation.z = Math.sin(time * 1.2) * 0.03;
      }

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('resize', handleResize);
      if (frameId) window.cancelAnimationFrame(frameId);
      disposeObject(scene);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [reducedMotion]);

  return (
    <div
      ref={mountRef}
      onClick={onDeviceClick}
      className="w-full h-full min-h-[460px] md:min-h-[580px] cursor-grab active:cursor-grabbing select-none relative"
      title="Click and drag to rotate the 3D AgentPulse Device"
    >
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <span className="text-3xs font-mono px-2 py-1 rounded bg-black/60 border border-white/20 text-cyan-300 backdrop-blur-md">
          INTERACTIVE 3D PROTOTYPE &bull; DRAG TO ROTATE
        </span>
      </div>
    </div>
  );
}
