import { BATTLE_HEIGHT, BATTLE_WIDTH, type BattleSimulation } from './battle';

const INSTANCE_STRIDE = 8;
const LINE_STRIDE = 6;

const INSTANCE_VERTEX_SHADER = `#version 300 es
  precision highp float;
  layout(location = 0) in vec2 a_corner;
  layout(location = 1) in vec2 a_center;
  layout(location = 2) in float a_heading;
  layout(location = 3) in vec3 a_color;
  layout(location = 4) in float a_flash;
  layout(location = 5) in float a_size;
  uniform vec2 u_resolution;
  out vec4 v_color;

  void main() {
    float sine = sin(a_heading);
    float cosine = cos(a_heading);
    vec2 rotated = vec2(a_corner.x * cosine - a_corner.y * sine, a_corner.x * sine + a_corner.y * cosine);
    vec2 position = a_center + rotated * a_size;
    vec2 clip = vec2(position.x / u_resolution.x * 2.0 - 1.0, 1.0 - position.y / u_resolution.y * 2.0);
    gl_Position = vec4(clip, 0.0, 1.0);
    v_color = vec4(mix(a_color, vec3(1.0), a_flash), 1.0);
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
  private readonly colors: Array<[number, number, number]>;
  private simulation: BattleSimulation;
  private instanceData = new Float32Array(0);
  private lineData = new Float32Array(0);

  constructor(private readonly canvas: HTMLCanvasElement, simulation: BattleSimulation) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, premultipliedAlpha: false });
    if (!gl) throw new Error('This prototype needs WebGL 2.');
    this.gl = gl;
    this.simulation = simulation;
    this.colors = simulation.scenario.contributors.map((contributor) => rgb(contributor.color));
    this.instanceProgram = createProgram(gl, INSTANCE_VERTEX_SHADER, FRAGMENT_SHADER);
    this.lineProgram = createProgram(gl, LINE_VERTEX_SHADER, FRAGMENT_SHADER);
    const cornerBuffer = gl.createBuffer();
    const instanceBuffer = gl.createBuffer();
    const lineBuffer = gl.createBuffer();
    if (!cornerBuffer || !instanceBuffer || !lineBuffer) throw new Error('Could not allocate WebGL buffers.');
    this.cornerBuffer = cornerBuffer;
    this.instanceBuffer = instanceBuffer;
    this.lineBuffer = lineBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 0, -0.72, 0.62, -0.45, 0, -0.72, -0.62]), gl.STATIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.resize();
  }

  setSimulation(simulation: BattleSimulation): void {
    this.simulation = simulation;
    this.colors.splice(0, this.colors.length, ...simulation.scenario.contributors.map((contributor) => rgb(contributor.color)));
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
    const instanceCount = fighterCount + this.simulation.bases.length;
    const requiredLength = instanceCount * INSTANCE_STRIDE;
    if (this.instanceData.length < requiredLength) this.instanceData = new Float32Array(Math.ceil(requiredLength * 1.25));
    const fighterSize = fighterCount > 45_000 ? 2.2 : fighterCount > 20_000 ? 2.8 : fighterCount > 8_000 ? 3.5 : 5;
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
      offset += INSTANCE_STRIDE;
    }
    for (const base of this.simulation.bases) {
      const color = this.colors[base.team] ?? [1, 1, 1];
      this.instanceData[offset] = base.x;
      this.instanceData[offset + 1] = base.y;
      this.instanceData[offset + 2] = base.angle + Math.PI;
      this.instanceData[offset + 3] = color[0];
      this.instanceData[offset + 4] = color[1];
      this.instanceData[offset + 5] = color[2];
      this.instanceData[offset + 6] = 0;
      this.instanceData[offset + 7] = 18;
      offset += INSTANCE_STRIDE;
    }

    gl.useProgram(this.instanceProgram);
    gl.uniform2f(gl.getUniformLocation(this.instanceProgram, 'u_resolution'), BATTLE_WIDTH, BATTLE_HEIGHT);
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
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount);
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
