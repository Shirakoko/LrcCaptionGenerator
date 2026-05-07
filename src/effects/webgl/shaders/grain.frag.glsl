#version 300 es
precision highp float;

uniform sampler2D u_tex;
uniform vec2 u_texelSize;
uniform float u_intensity;
uniform float u_time;
uniform float u_size;

in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  vec4 src = texture(u_tex, vUv);
  if (src.a < 0.02) { fragColor = src; return; }

  float sz = max(u_size, 1.0);
  vec2 noiseUv = floor(vUv / (sz * u_texelSize)) * (sz * u_texelSize);
  float noise = hash(noiseUv + fract(u_time)) * 2.0 - 1.0;
  float n = noise * u_intensity;

  fragColor = vec4(clamp(src.rgb + n, 0.0, 1.0), src.a);
}
