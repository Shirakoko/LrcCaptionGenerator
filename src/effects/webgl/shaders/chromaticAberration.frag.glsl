#version 300 es
precision highp float;

uniform sampler2D u_tex;
uniform vec2 u_texelSize;
uniform float u_offset;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 off = vec2(u_offset * u_texelSize.x, 0.0);

  float r = texture(u_tex, vUv - off).r;
  float g = texture(u_tex, vUv      ).g;
  float b = texture(u_tex, vUv + off).b;

  float aR = texture(u_tex, vUv - off).a;
  float aG = texture(u_tex, vUv      ).a;
  float aB = texture(u_tex, vUv + off).a;
  float a  = max(aR, max(aG, aB));

  fragColor = vec4(r, g, b, a);
}
