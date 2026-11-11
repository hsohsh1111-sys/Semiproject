import { useEffect, useMemo, useRef, useState } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Box3, TextureLoader, NoColorSpace } from 'three'
import { createBodyAppearance, MUSCLE_DETAIL_URL, MUSCLE_DETAIL_ENABLED } from './bodyAppearance.js'
import NikeTShirt from './NikeTShirt.jsx'
import GarmentGlb from './GarmentGlb.jsx'
import { headwearForBody } from './headwearFit.js'
import { applyMorphTest, captureMorphWeights, modelLayout, modelHeightLayout, preciseFrame } from './glbGeometry.js'
import { createGlbCameraSession } from './glbCamera.js'
import { applyBodyMorphs, bodyMorphWeights, bodyBuildWeights, BODY_MORPH_MODEL_URL, FEMALE_BODY_MODEL_URL, supportsBodyMorphs } from './bodyMorphs.js'

export const MANNEQUIN_MODEL_URLS = {
  // Body-only derivative; the original GLB stays untouched.
  test: BODY_MORPH_MODEL_URL,
  male: '/models/ONFIT_Human_Male.glb',
  female: FEMALE_BODY_MODEL_URL,
}

function GlbCamera({ frame, rotation, viewRevision, editLogo }) {
  const { camera, gl, size, invalidate } = useThree()
  const sessionRef = useRef(null)
  const controlsRef = useRef(null)
  useEffect(() => {
    const previous = camera.clone()
    const controls = new OrbitControls(camera, gl.domElement)
    controlsRef.current=controls
    controls.addEventListener('change', invalidate)
    sessionRef.current = createGlbCameraSession(camera, controls)
    return () => {
      controls.removeEventListener('change', invalidate)
      controls.dispose()
      controlsRef.current=null
      sessionRef.current = null
      // Return to the existing ring view when GLB controls unmount.
      camera.position.copy(previous.position)
      camera.quaternion.copy(previous.quaternion)
      camera.up.copy(previous.up)
      camera.zoom = previous.zoom
      camera.near = previous.near
      camera.far = previous.far
      camera.updateProjectionMatrix()
      invalidate()
    }
  }, [camera, gl, invalidate])
  useEffect(()=>{if(controlsRef.current)controlsRef.current.enabled=!editLogo},[editLogo,frame])
  useEffect(() => {
    if (sessionRef.current?.initialize(frame, size.width / size.height)) invalidate()
  }, [frame, camera, size.width, size.height, invalidate])
  useEffect(() => {
    sessionRef.current?.showSelectedView()
    invalidate()
  }, [rotation, viewRevision, invalidate])
  return null
}

export default function GlbMannequinModel({ parameters, modelUrl = MANNEQUIN_MODEL_URLS.test, targetName,
  targetWeight = 0, onTargets, rotation = 0, viewRevision = 0, tshirt = null, garmentGlb = null, onGarmentStatus, garmentColor = 'white', bottomGarment = null, onBottomStatus, outerGarment = null, onOuterStatus, headwear = null, onHeadwearStatus, headwearColor = 'black', bottomColor, outerColor, productDesign, productSize, onSizeMetrics, editLogo=false, onLogoMove, bodyBuild='average' }) {
  const gltf = useLoader(GLTFLoader, modelUrl)
  const invalidate = useThree(state => state.invalidate)
  const [frame, setFrame] = useState(null)
  const [surface, setSurface] = useState(null)
  const [muscleDetail,setMuscleDetail]=useState(null)
  useEffect(()=>{
    if(!MUSCLE_DETAIL_ENABLED){setMuscleDetail(null);return}
    let active=true
    const texture=new TextureLoader().load(MUSCLE_DETAIL_URL,loaded=>{
      if(!active){loaded.dispose();return}
      loaded.flipY=false;loaded.colorSpace=NoColorSpace;loaded.needsUpdate=true
      setMuscleDetail(loaded);invalidate()
    },undefined,()=>{if(active)setMuscleDetail(null)})
    return()=>{active=false;texture.dispose()}
  },[invalidate,MUSCLE_DETAIL_ENABLED])
  const garmentWeights = useMemo(() => {
    if (!supportsBodyMorphs(modelUrl)) return null
    if (!targetName) return {...bodyMorphWeights(parameters),...bodyBuildWeights(bodyBuild)}
    // Manual diagnostic resets the body to defaults before overriding one key.
    const weights = bodyMorphWeights()
    if (Object.hasOwn(weights, targetName)) weights[targetName] = targetWeight
    return weights
  }, [parameters, modelUrl, targetName, targetWeight,bodyBuild])
  const { scene, targetNames, defaults, layout } = useMemo(() => {
    const model = gltf.scene.clone(true)
    const targets = new Set()
    model.traverse(object => {
      if (object.isMesh && object.morphTargetDictionary) {
        Object.keys(object.morphTargetDictionary).forEach(name => targets.add(name))
      }
    })
    return {
      scene: model,
      targetNames: [...targets],
      defaults: captureMorphWeights(model),
      layout: modelLayout(model),
    }
  }, [gltf])
  const bodyAppearance=useRef(null)
  useEffect(()=>{
    const appearance=createBodyAppearance(scene);bodyAppearance.current=appearance
    return()=>{bodyAppearance.current=null;appearance.dispose()}
  },[scene])
  useEffect(()=>{bodyAppearance.current?.setBuild(modelUrl===BODY_MORPH_MODEL_URL?bodyBuild:'average',muscleDetail);invalidate()},[scene,bodyBuild,muscleDetail,modelUrl,invalidate])
  const heightLayout=useMemo(()=>modelHeightLayout(layout,parameters?.height_m),[layout,parameters?.height_m])

  useEffect(() => {
    onTargets?.(targetNames)
  }, [onTargets, targetNames])

  useEffect(() => {
    applyBodyMorphs(scene, defaults, parameters, modelUrl,bodyBuild)
    // Manual diagnostic is explicit; never interpret this as a body measurement.
    if (targetName) applyMorphTest(scene, defaults, targetName, targetWeight)
    const current = preciseFrame(scene)
    // Freeze the model's initial camera frame. Morphs still update the actual
    // surface, but must never replace the user's camera/OrbitControls state.
    setFrame(previous => previous?.scene === scene ? previous : { ...current, scene })
    // Shirt coordinates share the outer yaw group, not world camera coordinates.
    const inverse = scene.parent.parent.matrixWorld.clone().invert()
    const points = current.points.map(p => p.clone().applyMatrix4(inverse))
    setSurface({ points, bounds: new Box3().setFromPoints(points) })
    invalidate()
  }, [scene, defaults, parameters, modelUrl, targetName, targetWeight, rotation, invalidate,bodyBuild])

  return <>
    <group scale={heightLayout.scale} position={heightLayout.position}>
      <primitive object={scene} dispose={null} />
      {garmentGlb && <GarmentGlb key="top" model={garmentGlb} onStatus={onGarmentStatus} color={garmentColor} morphWeights={garmentWeights} design={productDesign} productSize={productSize} onSizeMetrics={onSizeMetrics} editLogo={editLogo} onLogoMove={onLogoMove} />}
      {bottomGarment && <GarmentGlb key="bottom" model={bottomGarment} onStatus={onBottomStatus} morphWeights={garmentWeights} color={bottomColor} />}
      {outerGarment && <GarmentGlb key="outer" model={outerGarment} onStatus={onOuterStatus} morphWeights={garmentWeights} color={outerColor} />}
      {headwear && <GarmentGlb key="headwear" model={headwearForBody(headwear, modelUrl)} onStatus={onHeadwearStatus} color={headwearColor} />}
    </group>
    {tshirt && surface && <NikeTShirt {...tshirt} surface={surface} />}
    {frame && <GlbCamera frame={frame} rotation={rotation} viewRevision={viewRevision} editLogo={editLogo} />}
  </>
}
