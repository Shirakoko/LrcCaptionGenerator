#version 300 es
precision highp float;

uniform sampler2D u_tex;
uniform vec2 u_texelSize;
uniform float u_blockSize;

in vec2 vUv;
out vec4 fragColor;

void main() {
  float sz = max(u_blockSize, 1.0);
  vec2 blockUv = floor(vUv / (sz * u_texelSize)) * (sz * u_texelSize)
                 + (sz * u_texelSize) * 0.5;
  fragColor = texture(u_tex, blockUv);
}
