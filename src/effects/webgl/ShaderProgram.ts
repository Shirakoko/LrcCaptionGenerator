/**
 * Thin wrapper around a compiled WebGL2 shader program.
 * Caches uniform locations for fast per-frame updates.
 */
export class ShaderProgram {
  private gl: WebGL2RenderingContext;
  readonly program: WebGLProgram;
  private locs = new Map<string, WebGLUniformLocation | null>();

  constructor(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string) {
    this.gl = gl;
    this.program = this._link(vertSrc, fragSrc);
  }

  private _compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error:\n${info}`);
    }
    return shader;
  }

  private _link(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const vert = this._compile(gl.VERTEX_SHADER, vertSrc);
    const frag = this._compile(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`Program link error:\n${info}`);
    }
    return prog;
  }

  use(): void {
    this.gl.useProgram(this.program);
  }

  private _loc(name: string): WebGLUniformLocation | null {
    if (!this.locs.has(name)) {
      this.locs.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.locs.get(name)!;
  }

  set1f(name: string, v: number): void {
    const loc = this._loc(name);
    if (loc != null) this.gl.uniform1f(loc, v);
  }

  set2f(name: string, x: number, y: number): void {
    const loc = this._loc(name);
    if (loc != null) this.gl.uniform2f(loc, x, y);
  }

  set3f(name: string, x: number, y: number, z: number): void {
    const loc = this._loc(name);
    if (loc != null) this.gl.uniform3f(loc, x, y, z);
  }

  set1i(name: string, v: number): void {
    const loc = this._loc(name);
    if (loc != null) this.gl.uniform1i(loc, v);
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
  }
}
