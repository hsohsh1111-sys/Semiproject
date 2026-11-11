import { useEffect, useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { ringVertices } from './silhouette.js'

export default function RingSurface({ rings, children }) {
  const geometry = useMemo(() => {
    const indices = [], segments = 64
    for (let row = 0; row < rings.length - 1; row++) {
      for (let i = 0; i < segments; i++) {
        const a = row * (segments + 1) + i, b = a + 1, c = a + segments + 1, d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(ringVertices(rings, segments), 3))
    result.setIndex(indices)
    result.computeVertexNormals()
    return result
  }, [rings])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry}>{children}</mesh>
}
