// A single base color; form comes from lighting, not painted lunar noise.
export const PLANET_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldNormal, vWorldPosition;
  void main() {
    vWorldNormal = normalize(mat3(modelMatrix)*normal);
    vec4 world = modelMatrix*vec4(position,1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix*viewMatrix*world;
  }
`;
export const PLANET_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vWorldNormal, vWorldPosition;
  uniform vec3 uColor;
  uniform float uActive, uVisibility;
  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 v = normalize(cameraPosition-vWorldPosition);
    vec3 l = normalize(vec3(-0.6,0.8,0.9));
    float diffuse = max(dot(n,l),0.0);
    float rim = pow(1.0-max(dot(n,v),0.0),2.4);
    float specular = pow(max(dot(n,normalize(l+v)),0.0),42.0)*0.16;
    // Baseline emission is present on EVERY planet, not just the selected one.
    // Keep a lit/shaded gradient so the brighter surface still reads as a sphere.
    vec3 color = uColor*(0.85+0.30+diffuse*0.90);
    vec3 radiatingEdge = mix(uColor,vec3(0.90,0.96,1.0),0.54);
    color += radiatingEdge*(specular+rim*(1.70+uActive*0.45));
    color *= uVisibility;
    gl_FragColor = vec4(color,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
export const HALO_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
  }
`;
export const HALO_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uTime, uPhase, uActive, uVisibility;
  void main() {
    // Radius expressed in planet radii, not a hand-tuned independent ring size.
    float r = length((vUv-0.5)*2.0)*1.8;
    if (r>1.8) discard;
    float distanceFromSurface = max(r-0.98,0.0);
    float breath = 1.0+sin(uTime*0.55+uPhase)*0.045;
    float inner = exp(-distanceFromSurface*10.5/breath);
    float mist = exp(-distanceFromSurface*5.8/breath);
    float alpha = (inner*0.38+mist*0.105)*smoothstep(0.94,1.0,r);
    alpha *= 1.0-smoothstep(1.55,1.8,r);
    alpha *= (1.05+uActive*0.35)*uVisibility;
    float outward = clamp(distanceFromSurface/0.72,0.0,1.0);
    float luminance = dot(uColor,vec3(0.2126,0.7152,0.0722));
    vec3 innerColor = mix(uColor,vec3(0.84,0.94,1.0),0.55);
    vec3 outerColor = mix(uColor,vec3(luminance),0.82);
    float radiance = (1.85+uActive*0.30)*(1.0-outward*0.28);
    gl_FragColor = vec4(mix(innerColor,outerColor,outward)*radiance,alpha);
    #include <colorspace_fragment>
  }
`;
