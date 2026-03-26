// SSR — Screen-Space Reflections via DDA screen-space ray march
// Based on Three.js SSRPass + WickedEngine conventions:
//  - Ray endpoints projected to screen-space pixel coords (DDA march)
//  - Perspective-correct depth interpolation: 1/(1/z0 + t*(1/z1-1/z0))
//  - Hit condition: rayZ <= sceneZ (ray passed behind surface)
//  - Jitter on first step to break up banding
//  - Back-face rejection to avoid inside-geometry artifacts
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform vec2 depthResolution;
uniform mat4 projMatrix;
uniform mat4 invProjMatrix;
uniform float maxDistance;
uniform float thickness;
uniform float infiniteThick;
uniform float stride;
uniform float fresnel;
uniform float opacity;
uniform float distanceAttenuation;
uniform float cameraNear;
uniform float cameraFar;
varying vec2 vUv;

// Reconstruct full view-space position from UV + depth buffer.
vec3 getViewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  vec4 clipPos = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 vp = invProjMatrix * clipPos;
  return vp.xyz / vp.w;
}

// Reconstruct only the view-space Z (cheaper than full getViewPos).
float getViewZ(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  vec4 c = vec4(0.0, 0.0, d * 2.0 - 1.0, 1.0);
  vec4 v = invProjMatrix * c;
  return v.z / v.w;
}

// Surface normal reconstructed from depth-buffer gradients (tDepth is always full-res).
vec3 getNormal(vec2 uv) {
  vec2 texel = 1.0 / depthResolution;
  vec3 c  = getViewPos(uv);
  vec3 l  = getViewPos(uv - vec2(texel.x, 0.0));
  vec3 r  = getViewPos(uv + vec2(texel.x, 0.0));
  vec3 dv = getViewPos(uv - vec2(0.0, texel.y));
  vec3 u  = getViewPos(uv + vec2(0.0, texel.y));
  vec3 dr = r - c;  vec3 dl = c - l;
  vec3 du = u - c;  vec3 dd = c - dv;
  vec3 dx = abs(dr.z) < abs(dl.z) ? dr : dl;
  vec3 dy = abs(du.z) < abs(dd.z) ? du : dd;
  return normalize(cross(dx, dy));
}

// Project a view-space point to normalised UV [0,1].
vec2 viewToScreen(vec3 vp) {
  vec4 clip = projMatrix * vec4(vp, 1.0);
  return clip.xy / clip.w * 0.5 + 0.5;
}

void main() {
  float depth = texture2D(tDepth, vUv).r;
  if (depth >= 1.0) { gl_FragColor = vec4(0.0); return; }

  vec3 viewPos    = getViewPos(vUv);
  vec3 normal     = getNormal(vUv);
  vec3 viewDir    = normalize(-viewPos);   // surface -> camera

  // Reject back-faces and inside-geometry (normal faces away from camera).
  if (dot(normal, viewDir) < 0.001) { gl_FragColor = vec4(0.0); return; }

  vec3 reflectDir = normalize(reflect(-viewDir, normal));

  // Fresnel (Schlick approximation).
  float NdotV       = clamp(dot(normal, viewDir), 0.0, 1.0);
  float fresnelFactor = pow(1.0 - NdotV, 5.0) * fresnel + (1.0 - fresnel);

  // Ray end-point — clamp Z so the ray never crosses the camera plane.
  vec3 rayEnd  = viewPos + reflectDir * maxDistance;
  rayEnd.z     = min(rayEnd.z, -cameraNear * 0.5);

  // Project start and end to screen-space pixel coordinates.
  vec2 ssStart = viewToScreen(viewPos) * resolution;
  vec2 ssEnd   = viewToScreen(rayEnd)  * resolution;

  vec2  delta    = ssEnd - ssStart;
  float totalLen = max(abs(delta.x), abs(delta.y));   // Chebyshev pixel distance
  if (totalLen < 1.0) { gl_FragColor = vec4(0.0); return; }

  // stride uniform: pixels to advance per iteration (1 = full quality).
  float pixelStride = max(1.0, ceil(stride));
  float stepCount   = min(totalLen / pixelStride, 128.0);
  vec2  stepXY      = delta / totalLen * pixelStride;

  // Perspective-correct depth interpolation coefficients.
  float recipStartZ = 1.0 / viewPos.z;
  float recipEndZ   = 1.0 / rayEnd.z;

  // Dither starting step to break up banding artifacts.
  float noise = fract(sin(dot(vUv * 1000.0, vec2(12.9898, 78.233))) * 43758.5453);

  float thick = mix(thickness, 1e6, step(0.5, infiniteThick));

  vec3  hitColor   = vec3(0.0);
  float confidence = 0.0;

  for (float i = 1.0; i <= 128.0; i++) {
    if (i > stepCount) break;

    float fi   = i + noise;
    vec2  xy   = ssStart + stepXY * fi;

    if (xy.x < 0.0 || xy.x >= resolution.x ||
        xy.y < 0.0 || xy.y >= resolution.y) break;

    float s    = (fi * pixelStride) / totalLen;
    float rayZ = 1.0 / (recipStartZ + s * (recipEndZ - recipStartZ));

    vec2  uv     = xy / resolution;
    float sceneZ = getViewZ(uv);

    // Hit: ray has just passed behind the scene surface.
    float diff = rayZ - sceneZ;
    if (diff <= 0.0 && diff > -thick) {

      // Binary refinement over parametric s (8 iterations).
      float sStep = pixelStride / totalLen;
      float sLo   = max(0.0, s - sStep);
      float sHi   = s;

      for (int j = 0; j < 8; j++) {
        float sMid      = (sLo + sHi) * 0.5;
        float rayZMid   = 1.0 / (recipStartZ + sMid * (recipEndZ - recipStartZ));
        vec2  uvMid     = clamp((ssStart + delta * sMid) / resolution, vec2(0.001), vec2(0.999));
        float sceneZMid = getViewZ(uvMid);
        if (rayZMid > sceneZMid) {
          sLo = sMid;
        } else {
          sHi = sMid;
        }
      }

      vec2 uvHit = clamp((ssStart + delta * sHi) / resolution, vec2(0.001), vec2(0.999));
      hitColor = texture2D(tScene, uvHit).rgb;

      vec2 hitEdge = smoothstep(vec2(0.0), vec2(0.10), uvHit) * (1.0 - smoothstep(vec2(0.90), vec2(1.0), uvHit));
      vec2 srcEdge = smoothstep(vec2(0.0), vec2(0.10), vUv)   * (1.0 - smoothstep(vec2(0.90), vec2(1.0), vUv));
      float edge = (hitEdge.x * hitEdge.y) * (srcEdge.x * srcEdge.y);

      float ratio     = 1.0 - clamp(sHi, 0.0, 1.0);
      float distAtten = mix(1.0, ratio * ratio, step(0.5, distanceAttenuation));

      confidence = fresnelFactor * edge * distAtten * opacity;
      break;
    }
  }

  gl_FragColor = vec4(hitColor, confidence);
}
