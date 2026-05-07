#version 300 es
precision highp float;

uniform sampler2D u_tex;
uniform vec2 u_texelSize;
uniform float u_radius;
uniform vec2 u_direction;

in vec2 vUv;
out vec4 fragColor;

void main() {
  float sigma = max(u_radius * 0.4, 0.5);
  int taps = clamp(int(sigma * 3.0), 1, 15);

  vec4 color = vec4(0.0);
  float weightSum = 0.0;
  vec2 step = u_direction * u_texelSize;

  for (int i = -15; i <= 15; i++) {
    if (abs(i) > taps) continue;
    float w = exp(-float(i * i) / (2.0 * sigma * sigma));
    color += texture(u_tex, vUv + step * float(i)) * w;
    weightSum += w;
  }
  fragColor = color / weightSum;
}
