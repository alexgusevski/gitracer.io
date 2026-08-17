import { BATTLE_HEIGHT, BATTLE_WIDTH, type BattleSimulation } from './battle';

const INSTANCE_STRIDE = 9;
const LINE_STRIDE = 6;

const INSTANCE_VERTEX_SHADER = `#version 300 es
  precision highp float;
  layout(location = 0) in vec2 a_corner;
  layout(location = 1) in vec2 a_center;
  layout(location = 2) in float a_heading;
  layout(location = 3) in vec3 a_color;
  layout(location = 4) in float a_flash;
  layout(location = 5) in float a_size;
  layout(location = 6) in float a_avatar;
  uniform vec2 u_resolution;
  out vec2 v_local;
  out vec4 v_color;
  flat out float v_avatar;

  void main() {
    vec2 position = a_center + a_corner * a_size;
    vec2 clip = vec2(position.x / u_resolution.x * 2.0 - 1.0, 1.0 - position.y / u_resolution.y * 2.0);
    gl_Position = vec4(clip, 0.0, 1.0);
    v_local = a_corner;
    v_color = vec4(mix(a_color, vec3(1.0), a_flash), 1.0);
    v_avatar = a_avatar;
  }
`;

const INSTANCE_FRAGMENT_SHADER = `#version 300 es
  precision mediump float;
  in vec2 v_local;
  in vec4 v_color;
  flat in float v_avatar;
  uniform sampler2D u_avatar_atlas;
  uniform float u_avatar_count;
  uniform float u_avatar_ready;
  out vec4 out_color;

  void main() {
    float distance_from_center = length(v_local);
    float edge = 1.0 - smoothstep(0.88, 1.0, distance_from_center);
    if (edge <= 0.0) discard;
    float rim = smoothstep(0.72, 0.92, distance_from_center);
    vec2 avatar_local = v_local * 0.5 + 0.5;
    vec2 avatar_uv = vec2((v_avatar + avatar_local.x) / max(1.0, u_avatar_count), avatar_local.y);
    vec4 portrait = texture(u_avatar_atlas, avatar_uv);
    vec3 body = mix(v_color.rgb, portrait.rgb, u_avatar_ready * portrait.a);
    body = mix(body, body * 0.58, rim);
    out_color = vec4(body, edge * v_color.a);
  }
`;

const LINE_VERTEX_SHADER = `#version 300 es
  precision highp float;
  layout(location = 0) in vec2 a_position;
  layout(location = 1) in vec4 a_color;
  uniform vec2 u_resolution;
  out vec4 v_color;

  void main() {
    vec2 clip = vec2(a_position.x / u_resolution.x * 2.0 - 1.0, 1.0 - a_position.y / u_resolution.y * 2.0);
    gl_Position = vec4(clip, 0.0, 1.0);
    v_color = a_color;
  }
`;

const FRAGMENT_SHADER = `#version 300 es
  precision mediump float;
  in vec4 v_color;
  out vec4 out_color;
  void main() { out_color = v_color; }
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create a WebGL shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compilation error.';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create a WebGL program.');
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown WebGL linking error.';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function rgb(color: string): [number, number, number] {
  const value = Number.parseInt(color.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export class BattleRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly instanceProgram: WebGLProgram;
  private readonly lineProgram: WebGLProgram;
  private readonly cornerBuffer: WebGLBuffer;
  private readonly instanceBuffer: WebGLBuffer;
  private readonly lineBuffer: WebGLBuffer;
  private readonly avatarTexture: WebGLTexture;
  private readonly colors: Array<[number, number, number]>;
  private simulation: BattleSimulation;
  private instanceData = new Float32Array(0);
  private lineData = new Float32Array(0);
  private avatarReady = false;
  private avatarLoadToken = 0;

  constructor(private readonly canvas: HTMLCanvasElement, simulation: BattleSimulation) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, premultipliedAlpha: false });
    if (!gl) throw new Error('This prototype needs WebGL 2.');
    this.gl = gl;
    this.simulation = simulation;
    this.colors = simulation.scenario.contributors.map((contributor) => rgb(contributor.color));
    this.instanceProgram = createProgram(gl, INSTANCE_VERTEX_SHADER, INSTANCE_FRAGMENT_SHADER);
    this.lineProgram = createProgram(gl, LINE_VERTEX_SHADER, FRAGMENT_SHADER);
    const cornerBuffer = gl.createBuffer();
    const instanceBuffer = gl.createBuffer();
    const lineBuffer = gl.createBuffer();
    const avatarTexture = gl.createTexture();
    if (!cornerBuffer || !instanceBuffer || !lineBuffer || !avatarTexture) throw new Error('Could not allocate WebGL buffers.');
    this.cornerBuffer = cornerBuffer;
    this.instanceBuffer = instanceBuffer;
    this.lineBuffer = lineBuffer;
    this.avatarTexture = avatarTexture;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, this.avatarTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.resize();
    void this.loadAvatarAtlas();
  }

  setSimulation(simulation: BattleSimulation): void {
    this.simulation = simulation;
    this.colors.splice(0, this.colors.length, ...simulation.scenario.contributors.map((contributor) => rgb(contributor.color)));
    void this.loadAvatarAtlas();
  }

  resize(): void {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(BATTLE_WIDTH * ratio);
    this.canvas.height = Math.round(BATTLE_HEIGHT * ratio);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(): void {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.drawInstances();
    this.drawLines();
  }

  private drawInstances(): void {
    const gl = this.gl;
    const fighterCount = this.simulation.fighters.length;
    const instanceCount = fighterCount;
    const requiredLength = instanceCount * INSTANCE_STRIDE;
    if (this.instanceData.length < requiredLength) this.instanceData = new Float32Array(Math.ceil(requiredLength * 1.25));
    const fighterSize = fighterCount > 45_000 ? 2.8 : fighterCount > 20_000 ? 3.4 : fighterCount > 8_000 ? 4.2 : 6;
    let offset = 0;
    for (const fighter of this.simulation.fighters) {
      const color = this.colors[fighter.team] ?? [1, 1, 1];
      this.instanceData[offset] = fighter.x;
      this.instanceData[offset + 1] = fighter.y;
      this.instanceData[offset + 2] = fighter.heading;
      this.instanceData[offset + 3] = color[0];
      this.instanceData[offset + 4] = color[1];
      this.instanceData[offset + 5] = color[2];
      this.instanceData[offset + 6] = fighter.hitFlash > 0 ? 1 : 0;
      this.instanceData[offset + 7] = fighterSize;
      this.instanceData[offset + 8] = fighter.team;
      offset += INSTANCE_STRIDE;
    }
    gl.useProgram(this.instanceProgram);
    gl.uniform2f(gl.getUniformLocation(this.instanceProgram, 'u_resolution'), BATTLE_WIDTH, BATTLE_HEIGHT);
    gl.uniform1f(gl.getUniformLocation(this.instanceProgram, 'u_avatar_count'), Math.max(1, this.colors.length));
    gl.uniform1f(gl.getUniformLocation(this.instanceProgram, 'u_avatar_ready'), this.avatarReady ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.avatarTexture);
    gl.uniform1i(gl.getUniformLocation(this.instanceProgram, 'u_avatar_atlas'), 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.subarray(0, requiredLength), gl.DYNAMIC_DRAW);
    const stride = INSTANCE_STRIDE * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 2 * 4);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 6 * 4);
    gl.vertexAttribDivisor(4, 1);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 7 * 4);
    gl.vertexAttribDivisor(5, 1);
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 1, gl.FLOAT, false, stride, 8 * 4);
    gl.vertexAttribDivisor(6, 1);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount);
  }

  private async loadAvatarAtlas(): Promise<void> {
    const token = ++this.avatarLoadToken;
    this.avatarReady = false;
    const contributors = this.simulation.scenario.contributors;
    const images = await Promise.all(contributors.map((contributor) => new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      const timeout = window.setTimeout(() => resolve(null), 4000);
      image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'no-referrer';
      image.onload = () => {
        window.clearTimeout(timeout);
        resolve(image);
      };
      image.onerror = () => {
        window.clearTimeout(timeout);
        resolve(null);
      };
      image.src = contributor.avatarUrl;
    })));
    if (token !== this.avatarLoadToken) return;

    const cellSize = 16;
    const atlas = document.createElement('canvas');
    atlas.width = Math.max(1, contributors.length) * cellSize;
    atlas.height = cellSize;
    const context = atlas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    contributors.forEach((contributor, index) => {
      context.fillStyle = contributor.color;
      context.fillRect(index * cellSize, 0, cellSize, cellSize);
      const image = images[index];
      if (image) context.drawImage(image, index * cellSize, 0, cellSize, cellSize);
    });

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.avatarTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.avatarReady = true;
  }

  private drawLines(): void {
    const gl = this.gl;
    const lineCount = this.simulation.tracers.length + this.simulation.bursts.length * 4;
    const requiredLength = lineCount * 2 * LINE_STRIDE;
    if (!requiredLength) return;
    if (this.lineData.length < requiredLength) this.lineData = new Float32Array(Math.ceil(requiredLength * 1.25));
    let offset = 0;
    const addVertex = (x: number, y: number, color: [number, number, number], alpha: number) => {
      this.lineData[offset] = x;
      this.lineData[offset + 1] = y;
      this.lineData[offset + 2] = color[0];
      this.lineData[offset + 3] = color[1];
      this.lineData[offset + 4] = color[2];
      this.lineData[offset + 5] = alpha;
      offset += LINE_STRIDE;
    };
    for (const tracer of this.simulation.tracers) {
      const color = this.colors[tracer.team] ?? [1, 1, 1];
      const alpha = Math.max(0, tracer.ttl / tracer.maxTtl);
      addVertex(tracer.x1, tracer.y1, color, alpha);
      addVertex(tracer.x2, tracer.y2, color, alpha);
    }
    for (const burst of this.simulation.bursts) {
      const color = this.colors[burst.team] ?? [1, 1, 1];
      const progress = 1 - burst.ttl / burst.maxTtl;
      const alpha = 1 - progress;
      for (let ray = 0; ray < 4; ray += 1) {
        const angle = ray * Math.PI / 2 + burst.team * 0.7;
        const distance = 3 + burst.size * progress;
        addVertex(burst.x + Math.cos(angle) * distance * 0.3, burst.y + Math.sin(angle) * distance * 0.3, color, alpha);
        addVertex(burst.x + Math.cos(angle) * distance, burst.y + Math.sin(angle) * distance, color, alpha);
      }
    }

    gl.useProgram(this.lineProgram);
    gl.uniform2f(gl.getUniformLocation(this.lineProgram, 'u_resolution'), BATTLE_WIDTH, BATTLE_HEIGHT);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.lineData.subarray(0, requiredLength), gl.DYNAMIC_DRAW);
    const stride = LINE_STRIDE * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 2 * 4);
    gl.vertexAttribDivisor(1, 0);
    gl.drawArrays(gl.LINES, 0, lineCount * 2);
  }
}
