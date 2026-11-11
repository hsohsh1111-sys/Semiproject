import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Raycaster } from 'three'
import { logoSurfacePoint, logoContainsPoint, draggedLogoPlacement } from './logoDrag.js'
import { useThree } from '@react-three/fiber'
import { applyGarmentMorphs, disposeGarmentAsset, loadGarmentAsset, TSHIRT_GLB } from './garmentGlb.js'
import { captureMorphWeights } from './glbGeometry.js'
import { createModelAppearance } from './garmentAppearance.js'
import { garmentWeightsForProductSize } from './productSizing.js'

export default function GarmentGlb({ model = TSHIRT_GLB, onStatus, color, morphWeights, design, productSize, onSizeMetrics, editLogo=false, onLogoMove }) {
  const [loaded, setLoaded] = useState(null)
  const drag=useRef(null)
  const raycaster=useRef(new Raycaster())
  function endDrag() {
    const current=drag.current;drag.current=null
    if(current?.target.hasPointerCapture?.(current.pointerId))current.target.releasePointerCapture(current.pointerId)
  }
  useEffect(()=>{if(!editLogo)endDrag();return endDrag},[editLogo,loaded])
  const invalidate = useThree(state => state.invalidate)
  useEffect(() => {
    const controller = new AbortController()
    let active = true, ownedAsset = null, ownedAppearance = null
    setLoaded(null)
    onStatus?.({ state: 'loading', url: model.url })
    loadGarmentAsset(model.url, { signal: controller.signal }).then(result => {
      if (!active) { disposeGarmentAsset(result.asset); return }
      ownedAsset = result.asset
      ownedAppearance = createModelAppearance(result.scene, model)
      setLoaded({ url: model.url, scene: result.scene, appearance: ownedAppearance, defaults: captureMorphWeights(result.scene) })
      onStatus?.({ state: 'ready', url: model.url })
      invalidate()
    }).catch(error => {
      if (!active) return
      onStatus?.({ state: error.kind ?? 'error', url: model.url,
        message: error.message || '의류를 불러오지 못했습니다.' })
      invalidate()
    })
    return () => {
      active = false
      controller.abort()
      ownedAppearance?.dispose()
      if (ownedAsset) disposeGarmentAsset(ownedAsset)
    }
  }, [model.url, model.tintable, model.colorProfile, onStatus, invalidate])

  useLayoutEffect(() => {
    loaded?.appearance?.setSize?.(model.supportsProductDesign ? productSize : null)
    invalidate()
  }, [loaded, productSize, model.supportsProductDesign, invalidate])

  useLayoutEffect(() => {
    loaded?.appearance?.setDesign?.(model.supportsProductDesign ? design : null)
    invalidate()
  }, [loaded, design, model.supportsProductDesign, invalidate])

  useLayoutEffect(() => {
    loaded?.appearance?.setColor(color ?? model.defaultColor ?? 'white')
    invalidate()
  }, [loaded, color, model.defaultColor, invalidate])

  useLayoutEffect(() => {
    // Product sizing owns nominal dimensions. Body morphs keep affecting the
    // person and other garments, never silently resize this selected product.
    if (loaded) applyGarmentMorphs(loaded.scene, loaded.defaults, garmentWeightsForProductSize(productSize, model, morphWeights), loaded.url)
    onSizeMetrics?.(loaded?.appearance?.measureSize?.(productSize) ?? null)
    invalidate()
  }, [loaded, morphWeights, productSize, onSizeMetrics, invalidate])

  if (!loaded || loaded.url !== model.url) return null
  return <group name={`ONFIT_AuthoredGarment_${model.slot ?? 'top'}`} position={model.position} rotation={model.rotation} scale={model.scale}
    onPointerDown={event=>{
      if(!editLogo||!design||!onLogoMove||event.button!==0||!model.supportsProductDesign)return
      const point=logoSurfacePoint(event)
      if(!logoContainsPoint(design,point))return
      event.stopPropagation()
      drag.current={start:point,design,pointerId:event.pointerId,target:event.target}
      event.target.setPointerCapture(event.pointerId)
    }}
    onPointerMove={event=>{
      const current=drag.current
      if(!editLogo||!current||current.pointerId!==event.pointerId)return
      event.stopPropagation()
      raycaster.current.ray.copy(event.ray)
      loaded.scene.updateWorldMatrix(true,true)
      const point=raycaster.current.intersectObject(loaded.scene,true).map(logoSurfacePoint).find(Boolean)
      if(point)onLogoMove?.(draggedLogoPlacement(current.design,current.start,point))
    }}
    onPointerUp={event=>{if(drag.current?.pointerId===event.pointerId){event.stopPropagation();endDrag()}}}
    onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
    <primitive object={loaded.scene} dispose={null} />
  </group>
}
