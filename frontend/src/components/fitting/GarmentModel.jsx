import { useMemo } from 'react'
import { DoubleSide } from 'three'
import { garmentRings } from './silhouette.js'
import RingSurface from './RingSurface.jsx'

export default function GarmentModel({ parameters, fit, transparent, calculatedGarment = null }) {
  const rings = useMemo(() => garmentRings(parameters, fit, calculatedGarment), [parameters, fit, calculatedGarment])
  return <RingSurface rings={rings}>
    <meshStandardMaterial color="#395d82" roughness={.85} side={DoubleSide}
      transparent={transparent} opacity={transparent ? .4 : 1} depthWrite={!transparent} />
  </RingSurface>
}
