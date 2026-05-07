#version 300 es

// Full-screen quad using gl_VertexID — no VBO needed.
// Draw with gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4).

out vec2 vUv;

void main() {
  // Positions in NDC for a TRIANGLE_STRIP covering the full viewport
  vec2 pos[4];
  pos[0] = vec2(-1.0, -1.0);
  pos[1] = vec2( 1.0, -1.0);
  pos[2] = vec2(-1.0,  1.0);
  pos[3] = vec2( 1.0,  1.0);

  vec2 uv[4];
  uv[0] = vec2(0.0, 0.0);
  uv[1] = vec2(1.0, 0.0);
  uv[2] = vec2(0.0, 1.0);
  uv[3] = vec2(1.0, 1.0);

  vUv = uv[gl_VertexID];
  gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
}
