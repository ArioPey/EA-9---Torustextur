"use strict";
/* Torustextur – Bildtextur und prozedurale Textur auf einem Torus (reines WebGL). */

(function () {
  const TEXTURE_URL = "textures/marmor_tuerkis.jpg";

  const canvas = document.getElementById("gl");
  const errBox = document.getElementById("error");
  const hudMode = document.getElementById("hud-mode");
  const btnImage = document.getElementById("btn-image");
  const btnProc = document.getElementById("btn-proc");
  const btnSpin = document.getElementById("btn-spin");

  function showError(msg) {
    console.error(msg);
    errBox.hidden = false;
    errBox.textContent = msg;
  }

  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) { showError("WebGL wird von diesem Browser nicht unterstützt."); return; }

  /* ---------- Shader ---------- */
  const VS = `
    attribute vec3 aPos;
    attribute vec3 aNormal;
    attribute vec2 aTexCoord;
    uniform mat4 uModel, uView, uProj;
    varying vec3 vPos;
    varying vec3 vNormal;
    varying vec2 vTex;
    void main() {
      vec4 world = uModel * vec4(aPos, 1.0);
      vPos = world.xyz;
      vNormal = mat3(uModel) * aNormal;
      vTex = aTexCoord;
      gl_Position = uProj * uView * world;
    }`;

  const FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    varying vec3 vPos;
    varying vec3 vNormal;
    varying vec2 vTex;
    uniform sampler2D uTex;
    uniform float uMode;       // 0 = Bildtextur, 1 = prozedural
    uniform vec3 uLightPos;
    uniform vec3 uCamPos;

    const float TAU = 6.2831853;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    // Value-Noise, in u und v periodisch (Texturnaht bleibt unsichtbar)
    float vnoise(vec2 p, vec2 per) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(mod(i, per));
      float b = hash(mod(i + vec2(1.0, 0.0), per));
      float c = hash(mod(i + vec2(0.0, 1.0), per));
      float d = hash(mod(i + vec2(1.0, 1.0), per));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    vec3 sprinkleColor(float h) {
      float k = floor(h * 6.0);
      if (k < 1.0) return vec3(1.00, 1.00, 1.00);
      if (k < 2.0) return vec3(0.98, 0.85, 0.15);
      if (k < 3.0) return vec3(0.20, 0.75, 0.95);
      if (k < 4.0) return vec3(0.25, 0.80, 0.35);
      if (k < 5.0) return vec3(0.90, 0.20, 0.20);
      return vec3(0.55, 0.30, 0.85);
    }

    // Prozedurale Textur: Donut mit Glasur und Streuseln.
    // uv.x läuft um den Ring, uv.y um den Schlauch (y = sin(2*pi*uv.y) ist die Höhe).
    vec3 donut(vec2 uv, out float specStr, out float shin) {
      float y = sin(TAU * uv.y);

      // wellige, periodische Glasurkante mit "Tropfen"
      float edge = 0.10 * sin(TAU * 5.0 * uv.x)
                 + 0.06 * sin(TAU * 11.0 * uv.x + 1.3)
                 + 0.04 * sin(TAU * 23.0 * uv.x + 2.1)
                 - 0.14 * pow(0.5 + 0.5 * sin(TAU * 7.0 * uv.x + 0.7), 6.0);
      float glaze = smoothstep(edge - 0.015, edge + 0.015, y);

      // Teig: unten dunkler gebräunt, mit Körnung
      float grain = vnoise(uv * vec2(96.0, 40.0), vec2(96.0, 40.0));
      vec3 dough = mix(vec3(0.86, 0.62, 0.32), vec3(0.58, 0.34, 0.15), smoothstep(0.1, -0.8, y));
      dough *= 0.86 + 0.28 * grain;

      // Glasur: rosa, am Rand etwas heller
      float cloud = vnoise(uv * vec2(12.0, 5.0), vec2(12.0, 5.0));
      vec3 pink = vec3(0.95, 0.40, 0.58) * (0.92 + 0.10 * cloud);
      float rim = smoothstep(0.06, 0.0, y - edge);
      pink = mix(pink, vec3(1.0, 0.68, 0.78), rim * 0.55);

      vec3 col = mix(dough, pink, glaze);

      // Streusel: Zellraster mit ganzzahliger Zellzahl (48 x 20) => nahtlos
      vec2 q = uv * vec2(48.0, 20.0);
      vec2 id = mod(floor(q), vec2(48.0, 20.0));
      vec2 f = fract(q) - 0.5;
      float h = hash(id);
      f -= (vec2(hash(id + 1.7), hash(id + 3.1)) - 0.5) * 0.3;   // Versatz
      float ang = hash(id + 7.3) * TAU;
      vec2 r = vec2(cos(ang) * f.x + sin(ang) * f.y, -sin(ang) * f.x + cos(ang) * f.y);
      float d = length(vec2(max(abs(r.x) - 0.17, 0.0), r.y));      // Kapsel
      float sp = smoothstep(0.085, 0.065, d) * step(0.62, h);
      sp *= glaze * smoothstep(edge + 0.03, edge + 0.08, y);        // nur auf der Glasur
      col = mix(col, sprinkleColor(hash(id + 5.1)), sp);

      specStr = mix(0.05, 0.9, glaze) * (1.0 - 0.4 * sp);
      shin = mix(10.0, 80.0, glaze);
      return col;
    }

    void main() {
      vec3 albedo;
      float specStr, shin;
      if (uMode < 0.5) {
        albedo = texture2D(uTex, vTex).rgb;
        specStr = 0.35; shin = 40.0;
      } else {
        albedo = donut(vTex, specStr, shin);
      }

      vec3 N = normalize(vNormal);
      vec3 V = normalize(uCamPos - vPos);
      vec3 L = normalize(uLightPos - vPos);
      vec3 H = normalize(L + V);

      float diff = max(dot(N, L), 0.0);
      float spec = (diff > 0.0) ? pow(max(dot(N, H), 0.0), shin) : 0.0;
      float ambient = mix(0.20, 0.42, 0.5 + 0.5 * N.y);       // einfaches Himmelslicht

      vec3 color = albedo * (ambient + 0.85 * diff) + vec3(1.0) * spec * specStr;
      gl_FragColor = vec4(min(color, vec3(1.0)), 1.0);
    }`;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error("Shader-Fehler:\n" + gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Link-Fehler:\n" + gl.getProgramInfoLog(prog));
    }
  } catch (e) { showError(e.message); return; }
  gl.useProgram(prog);

  const loc = {
    aPos: gl.getAttribLocation(prog, "aPos"),
    aNormal: gl.getAttribLocation(prog, "aNormal"),
    aTexCoord: gl.getAttribLocation(prog, "aTexCoord"),
  };
  ["uModel", "uView", "uProj", "uTex", "uMode", "uLightPos", "uCamPos"]
    .forEach(n => { loc[n] = gl.getUniformLocation(prog, n); });

  /* ---------- Matrizen (spaltenweise) ---------- */
  const M = {
    identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++) {
          let s = 0;
          for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
          o[c * 4 + r] = s;
        }
      return o;
    },
    rotY(a) { const m = M.identity(), c = Math.cos(a), s = Math.sin(a);
      m[0] = c; m[8] = s; m[2] = -s; m[10] = c; return m; },
    rotX(a) { const m = M.identity(), c = Math.cos(a), s = Math.sin(a);
      m[5] = c; m[9] = -s; m[6] = s; m[10] = c; return m; },
    perspective(fovy, aspect, n, f) {
      const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
      m[0] = t / aspect; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f);
      return m;
    },
    lookAt(e, c, u) {
      let zx = e[0]-c[0], zy = e[1]-c[1], zz = e[2]-c[2];
      let l = Math.hypot(zx, zy, zz); zx/=l; zy/=l; zz/=l;
      let xx = u[1]*zz - u[2]*zy, xy = u[2]*zx - u[0]*zz, xz = u[0]*zy - u[1]*zx;
      l = Math.hypot(xx, xy, xz); xx/=l; xy/=l; xz/=l;
      const yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;
      return new Float32Array([
        xx, yx, zx, 0,
        xy, yy, zy, 0,
        xz, yz, zz, 0,
        -(xx*e[0]+xy*e[1]+xz*e[2]), -(yx*e[0]+yy*e[1]+yz*e[2]), -(zx*e[0]+zy*e[1]+zz*e[2]), 1
      ]);
    }
  };

  /* ---------- Torus mit Texturkoordinaten ---------- */
  // u = Position um den Ring (0..1), v = Position um den Schlauch (0..1).
  // Die jeweils erste und letzte Vertexreihe liegen an derselben Stelle (u=0 und u=1 bzw. v=0 und v=1),
  // erhalten aber unterschiedliche Texturkoordinaten – so entsteht keine sichtbare Naht.
  function makeTorus(R, r, seg, sides) {
    const pos = [], nor = [], tex = [], idx = [];
    for (let a = 0; a <= seg; a++) {
      const u = a / seg, phi = u * 2 * Math.PI;
      for (let b = 0; b <= sides; b++) {
        const v = b / sides, theta = v * 2 * Math.PI;
        const cp = Math.cos(phi), sp = Math.sin(phi), ct = Math.cos(theta), st = Math.sin(theta);
        pos.push((R + r * ct) * cp, r * st, (R + r * ct) * sp);
        nor.push(ct * cp, st, ct * sp);
        tex.push(u, v);
      }
    }
    for (let a = 0; a < seg; a++)
      for (let b = 0; b < sides; b++) {
        const f = a * (sides + 1) + b, s = f + sides + 1;
        idx.push(f, f + 1, s, s, f + 1, s + 1);
      }
    function buf(target, data) {
      const bf = gl.createBuffer();
      gl.bindBuffer(target, bf);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      return bf;
    }
    return {
      pb: buf(gl.ARRAY_BUFFER, new Float32Array(pos)),
      nb: buf(gl.ARRAY_BUFFER, new Float32Array(nor)),
      tb: buf(gl.ARRAY_BUFFER, new Float32Array(tex)),
      ib: buf(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx)),
      count: idx.length
    };
  }
  const torus = makeTorus(1.5, 0.6, 96, 48);

  /* ---------- Bildtextur laden ---------- */
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Platzhalter (1x1 Türkis), bis das Bild geladen ist
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([30, 190, 190, 255]));

  const img = new Image();
  img.onload = function () {
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      const pot = n => (n & (n - 1)) === 0;
      if (pot(img.width) && pot(img.height)) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      } else {
        // WebGL 1: Nicht-Zweierpotenz-Texturen nur mit CLAMP und ohne Mipmaps
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const ext = gl.getExtension("EXT_texture_filter_anisotropic");
      if (ext) {
        const max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
        gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
      }
    } catch (e) {
      showError("Die Textur konnte nicht in WebGL geladen werden:\n" + e.message +
        "\nTipp: Seite über einen Webserver öffnen (nicht über file://).");
    }
  };
  img.onerror = function () {
    showError("Die Bilddatei " + TEXTURE_URL + " konnte nicht geladen werden.\n" +
      "Prüfen Sie den Pfad und öffnen Sie die Seite über einen Webserver (z. B. python3 -m http.server).");
  };
  img.src = TEXTURE_URL;

  /* ---------- Zustand ---------- */
  const state = { mode: 0, spin: true, angle: 0 };
  const cam = { yaw: 0.0, pitch: 0.55, dist: 7.5 };
  const camDefault = Object.assign({}, cam);
  const TILT = 0.55;   // Torus leicht gekippt, damit das Loch sichtbar ist

  function setMode(m) {
    state.mode = m;
    btnImage.classList.toggle("active", m === 0);
    btnProc.classList.toggle("active", m === 1);
    btnImage.setAttribute("aria-pressed", m === 0);
    btnProc.setAttribute("aria-pressed", m === 1);
    hudMode.textContent = m === 0 ? "Textur: Bild (Marmor)" : "Textur: prozedural (Donut)";
  }
  function setSpin(on) {
    state.spin = on;
    btnSpin.setAttribute("aria-pressed", on);
    btnSpin.classList.toggle("active", on);
    btnSpin.textContent = on ? "Drehung: an (Leertaste)" : "Drehung: aus (Leertaste)";
  }
  btnImage.addEventListener("click", () => setMode(0));
  btnProc.addEventListener("click", () => setMode(1));
  btnSpin.addEventListener("click", () => setSpin(!state.spin));
  document.getElementById("btn-reset").addEventListener("click", () => Object.assign(cam, camDefault));

  /* ---------- Eingabe ---------- */
  const keys = new Set();
  const NAV = ["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d", "q", "e", "+", "-", "="];
  window.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (NAV.includes(k)) { keys.add(k); e.preventDefault(); }
    else if (k === "1") setMode(0);
    else if (k === "2") setMode(1);
    else if (k === " ") { setSpin(!state.spin); e.preventDefault(); }
    else if (k === "r") Object.assign(cam, camDefault);
  });
  window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());

  let drag = null;
  canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", e => {
    if (!drag) return;
    cam.yaw -= (e.clientX - drag.x) * 0.008;
    cam.pitch = clampPitch(cam.pitch + (e.clientY - drag.y) * 0.008);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    cam.dist = clampDist(cam.dist * (1 + Math.sign(e.deltaY) * 0.08));
  }, { passive: false });

  const clampPitch = p => Math.min(1.45, Math.max(-1.45, p));
  const clampDist = d => Math.min(20, Math.max(3.5, d));

  function updateCamera(dt) {
    const rot = 1.6 * dt, zoom = 1.0 * dt;
    if (keys.has("arrowleft")  || keys.has("a")) cam.yaw -= rot;
    if (keys.has("arrowright") || keys.has("d")) cam.yaw += rot;
    if (keys.has("arrowup")    || keys.has("w")) cam.pitch = clampPitch(cam.pitch + rot);
    if (keys.has("arrowdown")  || keys.has("s")) cam.pitch = clampPitch(cam.pitch - rot);
    if (keys.has("q") || keys.has("-")) cam.dist = clampDist(cam.dist * (1 + zoom));
    if (keys.has("e") || keys.has("+") || keys.has("=")) cam.dist = clampDist(cam.dist * (1 - zoom));
  }

  /* ---------- Rendern ---------- */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.05, 0.07, 0.10, 1);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateCamera(dt);
    if (state.spin) state.angle += dt * 0.5;

    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const eye = [
      cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
      cam.dist * Math.sin(cam.pitch),
      cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw)
    ];
    gl.uniformMatrix4fv(loc.uView, false, M.lookAt(eye, [0, 0, 0], [0, 1, 0]));
    gl.uniformMatrix4fv(loc.uProj, false, M.perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100));
    gl.uniformMatrix4fv(loc.uModel, false, M.mul(M.rotX(TILT), M.rotY(state.angle)));
    gl.uniform3fv(loc.uCamPos, eye);
    gl.uniform3f(loc.uLightPos, 4, 6, 6);
    gl.uniform1f(loc.uMode, state.mode);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(loc.uTex, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, torus.pb);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, torus.nb);
    gl.enableVertexAttribArray(loc.aNormal);
    gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, torus.tb);
    gl.enableVertexAttribArray(loc.aTexCoord);
    gl.vertexAttribPointer(loc.aTexCoord, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, torus.ib);
    gl.drawElements(gl.TRIANGLES, torus.count, gl.UNSIGNED_SHORT, 0);

    requestAnimationFrame(frame);
  }

  setMode(0);
  setSpin(true);
  requestAnimationFrame(frame);
})();
