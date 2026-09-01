import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface LiquidBackgroundCanvasProps {
  palette: 'butter' | 'dark' | 'chalk';
  className?: string;
}

export const LiquidBackgroundCanvas: React.FC<LiquidBackgroundCanvasProps> = ({
  palette,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameId = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // WebGL Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });

    // Color definitions per palette (Apple iOS refined glass style)
    const getPaletteColors = (pal: 'butter' | 'dark' | 'chalk') => {
      if (pal === 'butter') {
        return {
          baseColor: new THREE.Color(0xfed72a), // Buttermax signature canary yellow
          liquidColor1: new THREE.Color(0xfbbf24), // Vibrant light amber
          liquidColor2: new THREE.Color(0xd97706), // Warm deep honey
          highlightColor: new THREE.Color(0xfffef0), // Translucent frosted white highlight
          causticColor: new THREE.Color(0xffffff), // Pristine glass refraction specular
          contrast: 1.15,
          darkMix: 0.08,
        };
      } else if (pal === 'chalk') {
        return {
          baseColor: new THREE.Color(0xf8fafc), // Apple studio ceramic pearl
          liquidColor1: new THREE.Color(0xf1f5f9), // Translucent ice white
          liquidColor2: new THREE.Color(0xe2e8f0), // Soft glass frosted tint
          highlightColor: new THREE.Color(0xffffff), // Pure specular sheen
          causticColor: new THREE.Color(0x38bdf8), // Faint prismatic refraction
          contrast: 0.9,
          darkMix: 0.02,
        };
      } else {
        // Dark / Obsidian Apple VisionOS glass
        return {
          baseColor: new THREE.Color(0x06070a), // Deep atmospheric void
          liquidColor1: new THREE.Color(0x0f172a), // Translucent slate glass
          liquidColor2: new THREE.Color(0x1e1b4b), // Subtle prismatic indigo
          highlightColor: new THREE.Color(0xe0f2fe), // Luminous ice-blue glass top sheen
          causticColor: new THREE.Color(0x38bdf8), // Electric cyan caustic
          contrast: 1.25,
          darkMix: 0.45,
        };
      }
    };

    const colors = getPaletteColors(palette);

    const initW = container.clientWidth || window.innerWidth || 1920;
    const initH = container.clientHeight || window.innerHeight || 1080;

    // Shader Uniforms
    const uniforms = {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(initW, initH) },
      u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
      u_mouse_velocity: { value: new THREE.Vector2(0, 0) },
      u_mouse_speed: { value: 0 },
      u_base_color: { value: colors.baseColor },
      u_liquid_color1: { value: colors.liquidColor1 },
      u_liquid_color2: { value: colors.liquidColor2 },
      u_highlight_color: { value: colors.highlightColor },
      u_caustic_color: { value: colors.causticColor },
      u_contrast: { value: colors.contrast },
      u_dark_mix: { value: colors.darkMix },
      u_palette_mode: { value: palette === 'butter' ? 0.0 : palette === 'chalk' ? 1.0 : 2.0 },
    };

    const updateSize = () => {
      const w = container.clientWidth || window.innerWidth || 1920;
      const h = container.clientHeight || window.innerHeight || 1080;
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      uniforms.u_resolution.value.set(w, h);
    };

    updateSize();
    container.replaceChildren(renderer.domElement);

    // Mouse Tracking with smooth physics & velocity
    const mouse = {
      x: 0.5,
      y: 0.5,
      targetX: 0.5,
      targetY: 0.5,
      vx: 0,
      vy: 0,
      lastX: 0.5,
      lastY: 0.5,
      speed: 0,
    };

    // Fluid Liquid Simulation Vertex & Fragment Shaders
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;
      uniform vec2 u_mouse_velocity;
      uniform float u_mouse_speed;
      uniform vec3 u_base_color;
      uniform vec3 u_liquid_color1;
      uniform vec3 u_liquid_color2;
      uniform vec3 u_highlight_color;
      uniform vec3 u_caustic_color;
      uniform float u_contrast;
      uniform float u_dark_mix;
      uniform float u_palette_mode;

      varying vec2 vUv;

      // 2D Simplex Noise / Hash
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                            0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                           -0.577350269189626,  // -1.0 + 2.0 * C.x
                            0.024390243902439); // 1.0 / 41.0
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
              + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      // Fractional Brownian Motion for translucent glass depth
      float fbm(vec2 p) {
        float total = 0.0;
        float amp = 0.52;
        float freq = 1.0;
        for (int i = 0; i < 4; i++) {
          total += snoise(p * freq) * amp;
          freq *= 2.02;
          amp *= 0.48;
        }
        return total;
      }

      void main() {
        vec2 st = gl_FragCoord.xy / u_resolution.xy;
        float aspect = u_resolution.x / u_resolution.y;
        vec2 p = st;
        p.x *= aspect;

        vec2 mouseP = u_mouse;
        mouseP.x *= aspect;

        // Smooth distance and cursor velocity physics
        float distToMouse = length(p - mouseP);
        float mouseSpeedVal = clamp(u_mouse_speed, 0.0, 3.5);

        // Apple Liquid Glass ripple deformation
        float rippleDecay = exp(-distToMouse * 3.4);
        float dynamicRipple = sin(distToMouse * 24.0 - u_time * 4.5) * 0.035 * rippleDecay * (1.0 + mouseSpeedVal * 0.8);
        
        vec2 mouseDir = p - mouseP;
        vec2 glassWavePush = normalize(mouseDir + 0.0001) * (rippleDecay * 0.14 + dynamicRipple);
        vec2 glassVortex = vec2(-mouseDir.y, mouseDir.x) * rippleDecay * (u_mouse_velocity.x * 0.6 + 0.08);

        // Multi-tier domain warping for transparent liquid glass transmission
        vec2 q = vec2(0.0);
        q.x = fbm(p * 1.5 + vec2(0.0, u_time * 0.045) + glassWavePush + glassVortex);
        q.y = fbm(p * 1.5 + vec2(u_time * 0.040, 0.0) - glassWavePush);

        vec2 r = vec2(0.0);
        r.x = fbm(p * 2.0 + 1.1 * q + vec2(1.7, 9.2) + 0.08 * u_time + glassWavePush * 1.2);
        r.y = fbm(p * 2.0 + 1.1 * q + vec2(8.3, 2.8) + 0.07 * u_time + glassVortex * 1.2);

        float f = fbm(p * 1.35 + 1.5 * r + glassWavePush * 1.4);

        // Optical Surface Normal & Refraction Derivatives
        float eps = 0.004;
        float fx = fbm(p + vec2(eps, 0.0) + 1.5 * r) - f;
        float fy = fbm(p + vec2(0.0, eps) + 1.5 * r) - f;
        vec3 normal = normalize(vec3(-fx / eps, -fy / eps, 1.8));

        // Fresnel equations for iOS glass edge shine
        vec3 viewDir = vec3(0.0, 0.0, 1.0);
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.2);

        // Specular Top-Light & Moving Spotlight over Mouse
        vec3 lightPos = vec3(mouseP.x, mouseP.y, 0.95);
        vec3 lightDir = normalize(lightPos - vec3(p, 0.0));
        vec3 halfDir = normalize(lightDir + viewDir);

        // Sharp Apple glass specular highlight & secondary ambient gloss
        float specTight = pow(max(dot(normal, halfDir), 0.0), 48.0) * 1.25;
        float specBroad = pow(max(dot(normal, halfDir), 0.0), 12.0) * 0.35;
        float totalSpec = specTight + specBroad;

        // Chromatic dispersion (RGB refraction split through glass)
        float dispR = fbm(p * 1.35 + 1.5 * r + vec2(0.003, 0.0));
        float dispG = f;
        float dispB = fbm(p * 1.35 + 1.5 * r - vec2(0.003, 0.0));
        vec3 chromaticTear = vec3(dispR, dispG, dispB);

        // Palette-based Refined Glass Composition
        vec3 col = u_base_color;

        if (u_palette_mode < 0.5) {
          // --- BUTTER PALETTE: Translucent Apple Liquid Glass on Canary ---
          // Smooth optical glass layers with soft amber depth and crystalline white specular caustics
          float glassRibbon1 = smoothstep(-0.35, 0.65, dispG);
          float glassRibbon2 = smoothstep(-0.15, 0.75, r.x);
          float deepRefraction = smoothstep(0.40, 0.92, chromaticTear.r * r.y);

          col = mix(u_base_color, u_liquid_color1, glassRibbon1 * 0.65);
          col = mix(col, u_liquid_color2, deepRefraction * u_dark_mix);
          col = mix(col, u_highlight_color, glassRibbon2 * 0.40);

          // Glass Bevel Specular & Translucent Sheen
          col += totalSpec * u_highlight_color * 0.75;
          col += fresnel * u_caustic_color * 0.45;
          col += rippleDecay * vec3(0.09, 0.07, 0.02) * (1.0 + mouseSpeedVal * 1.2);

        } else if (u_palette_mode < 1.5) {
          // --- CHALK PALETTE: Apple Studio Ceramic Liquid Glass ---
          // Translucent frosted glass with soft chromatic dispersion and pure white bevel highlights
          float glassSheen = smoothstep(-0.45, 0.65, f);
          col = mix(u_base_color, u_liquid_color1, glassSheen * 0.45);
          col = mix(col, u_liquid_color2, smoothstep(0.1, 0.85, r.x) * 0.18);
          
          // Pure crystal specular
          col += totalSpec * 0.65;
          col += fresnel * vec3(0.06, 0.09, 0.12);
          col += rippleDecay * 0.05;

        } else {
          // --- DARK OBSIDIAN PALETTE: Apple VisionOS Space Glass ---
          // Deep atmospheric glass with translucent cyan-indigo refraction and crystalline edges
          float glassWave1 = smoothstep(-0.35, 0.75, dispG);
          float glassWave2 = smoothstep(-0.25, 0.68, r.x);

          col = mix(u_base_color, u_liquid_color1, glassWave1 * 0.60);
          col = mix(col, u_liquid_color2, glassWave2 * 0.45);

          // Electric Caustic Refraction & Glass Edge Glint
          vec3 prismaticGlow = mix(u_caustic_color, u_highlight_color, smoothstep(0.2, 0.8, chromaticTear.b));
          col += totalSpec * prismaticGlow * 1.1;
          col += fresnel * u_caustic_color * 0.65;
          col += rippleDecay * u_caustic_color * (0.35 + mouseSpeedVal * 0.6);
        }

        // Soft subtle peripheral vignette to guarantee maximum text readability
        float vignette = 1.0 - smoothstep(0.65, 1.45, length(st - 0.5));
        col = mix(col * 0.94, col, vignette);

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      depthWrite: false,
      depthTest: false,
    });

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(plane);

    // Global Pointer Movement Tracker across the entire viewport
    const handlePointerMove = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = 1.0 - (e.clientY / window.innerHeight);

      mouse.targetX = Math.max(0, Math.min(1, x));
      mouse.targetY = Math.max(0, Math.min(1, y));
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    // Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    resizeObserver.observe(container);

    // Animation Loop
    const clock = new THREE.Clock();

    const renderLoop = () => {
      animFrameId.current = requestAnimationFrame(renderLoop);

      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      // Mouse Smooth Spring Physics
      const prevX = mouse.x;
      const prevY = mouse.y;
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;

      mouse.vx = mouse.x - prevX;
      mouse.vy = mouse.y - prevY;
      mouse.speed = Math.sqrt(mouse.vx * mouse.vx + mouse.vy * mouse.vy) * 20.0;

      // Update Uniforms
      uniforms.u_time.value = elapsedTime;
      uniforms.u_mouse.value.set(mouse.x, mouse.y);
      uniforms.u_mouse_velocity.value.set(mouse.vx, mouse.vy);
      uniforms.u_mouse_speed.value = THREE.MathUtils.lerp(uniforms.u_mouse_speed.value, mouse.speed, 0.1);

      renderer.render(scene, camera);
    };

    renderLoop();

    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      window.removeEventListener('pointermove', handlePointerMove);
      resizeObserver.disconnect();
      renderer.dispose();
      material.dispose();
      plane.geometry.dispose();
    };
  }, [palette]);

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 w-screen h-screen pointer-events-none overflow-hidden select-none ${className}`}
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
};
