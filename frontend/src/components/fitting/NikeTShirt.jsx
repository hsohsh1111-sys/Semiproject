import { useEffect, useMemo, useRef } from 'react'
import { useLoader } from '@react-three/fiber'
import { CatmullRomCurve3, DoubleSide, SRGBColorSpace, TextureLoader, TubeGeometry } from 'three'
import { createTShirt, SHIRT_PHOTO } from './tshirtGeometry.js'

const vertexShader = `
  varying vec2 photoUv;
  void main() {
    photoUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const fragmentShader = `
  uniform sampler2D photo;
  uniform float opacity;
  varying vec2 photoUv;
  void main() {
    vec3 ink = texture2D(photo, photoUv).rgb;
    float alpha = smoothstep(0.02, 0.08, max(ink.r, max(ink.g, ink.b)));
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(ink, alpha * opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export default function NikeTShirt({ surface, parameters, fit, calculatedGarment, transparent, fixedSize }) {
  const photo = useLoader(TextureLoader, SHIRT_PHOTO)
  const frozenSurface = useRef(null)
  if (!fixedSize) frozenSurface.current = null
  if (fixedSize && !frozenSurface.current) frozenSurface.current = surface
  const effectiveSurface = frozenSurface.current ?? surface
  const { geometry, logo, trims } = useMemo(() =>
    createTShirt(parameters, fit, calculatedGarment, effectiveSurface),
  [parameters, fit, calculatedGarment, effectiveSurface])
  const trimGeometries = useMemo(() => Object.entries(trims).map(([name, points]) => ({
    name,
    geometry: new TubeGeometry(new CatmullRomCurve3(points, true), name === 'hem' ? 128 : 96,
      name === 'neck' ? .004 : .0028, 8, true),
  })), [trims])
  const texture = useMemo(() => {
    const value = photo.clone()
    value.colorSpace = SRGBColorSpace
    value.needsUpdate = true
    return value
  }, [photo])
  const uniforms = useMemo(() => ({ photo: { value: texture }, opacity: { value: transparent ? .4 : 1 } }),
    [texture, transparent])
  useEffect(() => () => { geometry.dispose(); logo.dispose(); trimGeometries.forEach(trim => trim.geometry.dispose()) },
    [geometry, logo, trimGeometries])
  useEffect(() => () => texture.dispose(), [texture])
  return <group name="ONFIT_Nike_TShirt_Test">
    <mesh name="TShirtBodyAndSleeves" geometry={geometry}>
      <meshStandardMaterial color="#101112" roughness={.96} metalness={0} side={DoubleSide}
        transparent={transparent} opacity={transparent ? .4 : 1} depthWrite={!transparent} />
    </mesh>
    {trimGeometries.map(trim => <mesh key={trim.name} name={`ShirtTrim_${trim.name}`} geometry={trim.geometry}>
      <meshStandardMaterial color="#18191a" roughness={1} metalness={0}
        transparent={transparent} opacity={transparent ? .4 : 1} />
    </mesh>)}
    <mesh name="PhotoLogo" geometry={logo} renderOrder={2}>
      <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms}
        transparent depthWrite={false} side={DoubleSide} />
    </mesh>
  </group>
}
