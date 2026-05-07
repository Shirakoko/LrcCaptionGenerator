#version 300 es
precision highp float;

// unit 0: blurred texture
// unit 1: original (pre-blur) snapshot
uniform sampler2D u_blurred;
uniform sampler2D u_original;
uniform vec3 u_glowColor;
uniform float u_intensity;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 orig = texture(u_original, vUv);
  vec4 blur = texture(u_blurred,  vUv);

  // Screen blend: glow layer on top of original
  vec3 glow   = blur.rgb * u_glowColor * u_intensity;
  vec3 result = orig.rgb + glow * (1.0 - orig.rgb);

  float a = max(orig.a, blur.a * u_intensity);
  fragColor = vec4(result, a);
}
