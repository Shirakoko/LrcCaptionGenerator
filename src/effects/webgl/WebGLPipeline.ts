import { ShaderProgram } from './ShaderProgram.ts';

import vertSrc  from './shaders/common.vert.glsl?raw';
import blurSrc  from './shaders/blur.frag.glsl?raw';
import grainSrc from './shaders/grain.frag.glsl?raw';
import pixSrc   from './shaders/pixelate.frag.glsl?raw';
import glowSrc  from './shaders/glow.frag.glsl?raw';
import caSrc    from './shaders/chromaticAberration.frag.glsl?raw';

type UniformValue = number | [number, number] | [number, number, number];

/**
 * WebGL2 post-processing pipeline.
 *
 * Usage:
 *   pipeline.uploadSource(offscreenCanvas2D);
 *   pipeline.runPass('grain', { u_intensity: 0.3, u_time: t });
 *   pipeline.runPass('blur',  { u_radius: 4, u_direction: [1, 0] });
 *   pipeline.runPass('blur',  { u_radius: 4, u_direction: [0, 1] });
 *   pipeline.composite(mainCtx);
 */
export class WebGLPipeline {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private programs = new Map<string, ShaderProgram>();

  // Ping-pong textures + FBOs
  private texA!: WebGLTexture;
  private texB!: WebGLTexture;
  private fboA!: WebGLFramebuffer;
  private fboB!: WebGLFramebuffer;

  // Glow snapshot texture (texC) + its FBO
  private texC!: WebGLTexture;
  private fboC!: WebGLFramebuffer;

  // Which texture is the current "read" source (true = A, false = B)
  private readA = true;

  private w = 0;
  private h = 0;
  private contextLost = false;

  constructor(w: number, h: number) {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this._initGL();
    });

    this._initGL();
    this.resize(w, h);
  }

  private _initGL(): void {
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // Compile all programs
    this.programs.clear();
    this.programs.set('blur',               new ShaderProgram(gl, vertSrc, blurSrc));
    this.programs.set('grain',              new ShaderProgram(gl, vertSrc, grainSrc));
    this.programs.set('pixelate',           new ShaderProgram(gl, vertSrc, pixSrc));
    this.programs.set('glow',               new ShaderProgram(gl, vertSrc, glowSrc));
    this.programs.set('chromaticAberration',new ShaderProgram(gl, vertSrc, caSrc));
  }

  // ── Texture / FBO helpers ─────────────────────────────────────────────────

  private _makeTex(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private _allocTex(tex: WebGLTexture, w: number, h: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  private _makeFbo(tex: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width  = w;
    this.canvas.height = h;

    const gl = this.gl;

    // Delete old resources if they exist
    if (this.texA) { gl.deleteTexture(this.texA); gl.deleteFramebuffer(this.fboA); }
    if (this.texB) { gl.deleteTexture(this.texB); gl.deleteFramebuffer(this.fboB); }
    if (this.texC) { gl.deleteTexture(this.texC); gl.deleteFramebuffer(this.fboC); }

    this.texA = this._makeTex(); this._allocTex(this.texA, w, h); this.fboA = this._makeFbo(this.texA);
    this.texB = this._makeTex(); this._allocTex(this.texB, w, h); this.fboB = this._makeFbo(this.texB);
    this.texC = this._makeTex(); this._allocTex(this.texC, w, h); this.fboC = this._makeFbo(this.texC);
  }

  /** Upload a 2D canvas as the initial source texture (into texA). */
  uploadSource(source: HTMLCanvasElement): void {
    if (this.contextLost) return;
    this.resize(source.width, source.height);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texA);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.readA = true;
  }

  /** Run a named shader pass. Reads from current source tex, writes to the other. */
  runPass(name: string, uniforms: Record<string, UniformValue> = {}): void {
    if (this.contextLost) return;
    const gl = this.gl;
    const prog = this.programs.get(name);
    if (!prog) throw new Error(`Unknown shader pass: ${name}`);

    const srcTex  = this.readA ? this.texA : this.texB;
    const dstFbo  = this.readA ? this.fboB : this.fboA;

    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    prog.use();

    // Bind source texture to unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    prog.set1i('u_tex', 0);

    // Auto-inject texel size
    prog.set2f('u_texelSize', 1 / this.w, 1 / this.h);

    // Set caller-supplied uniforms
    for (const [key, val] of Object.entries(uniforms)) {
      if (typeof val === 'number') {
        prog.set1f(key, val);
      } else if (val.length === 2) {
        prog.set2f(key, val[0], val[1]);
      } else {
        prog.set3f(key, val[0], val[1], val[2]);
      }
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Swap ping-pong
    this.readA = !this.readA;
  }

  /**
   * Copy the current source texture into texC (glow snapshot).
   * Call this before the blur passes for glow.
   */
  saveGlowSnapshot(): void {
    if (this.contextLost) return;
    const gl = this.gl;
    const srcTex = this.readA ? this.texA : this.texB;

    // Blit srcTex → fboC via a simple pass (reuse blur shader with radius=0 is wasteful;
    // instead use a minimal copy by drawing with the grain shader at intensity=0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboC);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const prog = this.programs.get('grain')!;
    prog.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    prog.set1i('u_tex', 0);
    prog.set2f('u_texelSize', 1 / this.w, 1 / this.h);
    prog.set1f('u_intensity', 0);
    prog.set1f('u_time', 0);
    prog.set1f('u_size', 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // readA is unchanged — snapshot doesn't affect the ping-pong chain
  }

  /**
   * Glow composite pass: blends the current (blurred) texture with the
   * pre-blur snapshot stored in texC.
   */
  runGlowComposite(glowColor: [number, number, number], intensity: number): void {
    if (this.contextLost) return;
    const gl = this.gl;
    const prog = this.programs.get('glow')!;

    const blurredTex = this.readA ? this.texA : this.texB;
    const dstFbo     = this.readA ? this.fboB : this.fboA;

    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    prog.use();

    // unit 0 = blurred
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, blurredTex);
    prog.set1i('u_blurred', 0);

    // unit 1 = original snapshot
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texC);
    prog.set1i('u_original', 1);

    prog.set2f('u_texelSize', 1 / this.w, 1 / this.h);
    prog.set3f('u_glowColor', glowColor[0], glowColor[1], glowColor[2]);
    prog.set1f('u_intensity', intensity);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.readA = !this.readA;
  }

  /**
   * Draw the final processed texture onto a 2D canvas context.
   * Uses drawImage so the main canvas stays a 2D canvas (export-compatible).
   */
  composite(targetCtx: CanvasRenderingContext2D): void {
    if (this.contextLost) return;
    const gl = this.gl;

    // Blit current source texture to the default framebuffer
    const srcTex = this.readA ? this.texA : this.texB;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Use grain at intensity=0 as a simple copy-to-screen pass
    const prog = this.programs.get('grain')!;
    prog.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    prog.set1i('u_tex', 0);
    prog.set2f('u_texelSize', 1 / this.w, 1 / this.h);
    prog.set1f('u_intensity', 0);
    prog.set1f('u_time', 0);
    prog.set1f('u_size', 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // drawImage the WebGL canvas onto the 2D context
    targetCtx.drawImage(this.canvas, 0, 0);
  }

  dispose(): void {
    const gl = this.gl;
    for (const p of this.programs.values()) p.dispose();
    this.programs.clear();
    if (this.texA) gl.deleteTexture(this.texA);
    if (this.texB) gl.deleteTexture(this.texB);
    if (this.texC) gl.deleteTexture(this.texC);
    if (this.fboA) gl.deleteFramebuffer(this.fboA);
    if (this.fboB) gl.deleteFramebuffer(this.fboB);
    if (this.fboC) gl.deleteFramebuffer(this.fboC);
  }
}
