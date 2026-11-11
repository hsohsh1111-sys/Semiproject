// Opposed key/fill pairs give the same diffuse energy after a half turn without
// bypassing material normals, adding emission, or attaching lights to the body.
export const FITTING_AMBIENT = 0.6
export const FITTING_HEMISPHERE = { sky: '#edf3ff', ground: '#bcc4b7', intensity: 0.8 }
export const FITTING_LIGHTS = [
  { position: [3, 5, 4], intensity: 1.1 },
  { position: [-3, 5, -4], intensity: 1.1 },
  { position: [-4, 3, 2], intensity: 0.8 },
  { position: [4, 3, -2], intensity: 0.8 },
]
