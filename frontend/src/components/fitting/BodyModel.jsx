import { useMemo } from 'react'
import { bodyRings, thighEllipsoid } from './silhouette.js'
import RingSurface from './RingSurface.jsx'

function Ellipsoid({ position, scale }) {
  return <mesh position={position} scale={scale}>
    <sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color="#b8c9c5" roughness={0.6} />
  </mesh>
}

export default function BodyModel({ parameters }) {
  const { height_m: h, shoulder_width_m: shoulder, waist_radius_m: waist } = parameters
  const rings = useMemo(() => bodyRings(parameters), [parameters])
  return <group>
    <RingSurface rings={rings}><meshStandardMaterial color="#b8c9c5" roughness={0.6} /></RingSurface>
    <Ellipsoid position={[0, h * .915, 0]} scale={[h * .047, h * .085, h * .055]} />
    {[-1, 1].map(side => <group key={side}>
      <Ellipsoid position={[side * .085, h * .12, 0]} scale={[.055, h * .12, .06]} />
      <Ellipsoid {...thighEllipsoid(parameters, side)} />
      <Ellipsoid position={[side * (shoulder / 2 + .035), h * .61, 0]} scale={[.035, h * .17, .04]} />
    </group>)}
    <mesh position={[0, h * .56, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[waist + .002, .003, 8, 64]} /><meshBasicMaterial color="#e08c57" />
    </mesh>
  </group>
}
