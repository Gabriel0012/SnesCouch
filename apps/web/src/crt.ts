const picture = document.querySelector<HTMLElement>("#picture")!;
const view = document.querySelector<HTMLCanvasElement>("#crt")!;

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_src;
varying vec2 v_uv;

void main() {
  vec2 centered = v_uv * 2.0 - 1.0;
  float r2 = dot(centered, centered);
  vec2 curved = centered * (1.0 + 0.048 * r2);
  if (max(abs(curved.x), abs(curved.y)) > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 uv = curved * 0.5 + 0.5;
  vec2 texel = vec2(1.0 / u_src.x, 0.0);
  float edge = abs(centered.x);
  vec2 shift = vec2(0.65 * edge / u_src.x, 0.0);
  float red = texture2D(u_tex, uv + shift).r;
  float blue = texture2D(u_tex, uv - shift).b;
  vec3 mid = texture2D(u_tex, uv).rgb;
  vec3 left = texture2D(u_tex, uv - texel).rgb;
  vec3 right = texture2D(u_tex, uv + texel).rgb;
  vec3 color = mid * 0.7 + left * 0.15 + right * 0.15;
  color.r = mix(color.r, red, 0.45);
  color.b = mix(color.b, blue, 0.45);

  float beam = sin(fract(uv.y * u_src.y) * 3.14159265);
  color *= mix(0.58, 1.06, beam * beam);

  float stripe = mod(floor(gl_FragCoord.x), 3.0);
  vec3 mask = vec3(0.74);
  mask.r = mix(mask.r, 1.0, 1.0 - step(0.5, stripe));
  mask.g = mix(mask.g, 1.0, 1.0 - step(0.5, abs(stripe - 1.0)));
  mask.b = mix(mask.b, 1.0, step(1.5, stripe));
  color *= mask;

  float vignette = smoothstep(1.2, 0.28, r2);
  color *= mix(0.76, 1.0, vignette);
  gl_FragColor = vec4(clamp(color * 1.08, 0.0, 1.0), 1.0);
}
`;

let source: HTMLCanvasElement | null = null;
let gl: WebGLRenderingContext | null = null;
let texture: WebGLTexture | null = null;
let srcUniform: WebGLUniformLocation | null = null;
let enabled = false;
let raf = 0;
let failed = false;
let dropHook: (() => void) | null = null;

const resizeObserver = new ResizeObserver(() => {
  if (enabled) resize();
});
resizeObserver.observe(view);

new MutationObserver(() => syncLoop()).observe(picture, { attributes: true, attributeFilter: ["hidden"] });

export function bindScreen(next: HTMLCanvasElement) {
  source = next;
}

export function whenCrtDrops(fn: () => void) {
  dropHook = fn;
}

export function setCrt(on: boolean): boolean {
  if (!on) {
    enabled = false;
    picture.classList.remove("crt");
    syncLoop();
    return true;
  }
  if (!ensure()) return false;
  enabled = true;
  picture.classList.add("crt");
  syncLoop();
  return true;
}

function syncLoop() {
  const run = enabled && !picture.hidden && gl !== null;
  if (run && raf === 0) raf = requestAnimationFrame(tick);
  if (!run && raf !== 0) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

function tick() {
  raf = 0;
  if (!enabled || picture.hidden || !gl || gl.isContextLost()) return;
  try {
    draw();
  } catch {
    enabled = false;
    picture.classList.remove("crt");
    dropHook?.();
    return;
  }
  raf = requestAnimationFrame(tick);
}

function ensure(): boolean {
  if (failed) return false;
  if (gl && !gl.isContextLost()) return true;
  gl = null;
  const context = view.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
  });
  if (!context || context.isContextLost()) return false;
  const program = link(context);
  if (!program) {
    failed = true;
    return false;
  }
  gl = context;
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);
  srcUniform = gl.getUniformLocation(program, "u_src");
  texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(gl.getUniformLocation(program, "u_tex"), 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  return true;
}

view.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  if (!enabled && !gl) return;
  enabled = false;
  gl = null;
  picture.classList.remove("crt");
  syncLoop();
  dropHook?.();
});

function link(context: WebGLRenderingContext): WebGLProgram | null {
  const vertex = compile(context, context.VERTEX_SHADER, VERT);
  const fragment = compile(context, context.FRAGMENT_SHADER, FRAG);
  if (!vertex || !fragment) return null;
  const program = context.createProgram();
  if (!program) return null;
  context.attachShader(program, vertex);
  context.attachShader(program, fragment);
  context.bindAttribLocation(program, 0, "a_pos");
  context.linkProgram(program);
  context.deleteShader(vertex);
  context.deleteShader(fragment);
  if (!context.getProgramParameter(program, context.LINK_STATUS)) {
    context.deleteProgram(program);
    return null;
  }
  return program;
}

function compile(context: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = context.createShader(type);
  if (!shader) return null;
  context.shaderSource(shader, source);
  context.compileShader(shader);
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    context.deleteShader(shader);
    return null;
  }
  return shader;
}

function resize() {
  const rect = view.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const dpr = window.devicePixelRatio || 1;
  let width = Math.max(2, Math.round(rect.width * dpr));
  let height = Math.max(2, Math.round(rect.height * dpr));
  const longest = Math.max(width, height);
  if (longest > 1600) {
    const scale = 1600 / longest;
    width = Math.max(2, Math.round(width * scale));
    height = Math.max(2, Math.round(height * scale));
  }
  if (view.width !== width || view.height !== height) {
    view.width = width;
    view.height = height;
  }
}

function draw() {
  if (!gl || !texture || !source || source.width < 2 || source.height < 2) return;
  resize();
  if (view.width < 2 || view.height < 2) return;
  gl.viewport(0, 0, view.width, view.height);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.uniform2f(srcUniform, source.width, source.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
