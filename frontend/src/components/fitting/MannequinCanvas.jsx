import { Component } from 'react'
import { Canvas } from '@react-three/fiber'
import BodyModel from './BodyModel.jsx'
import GarmentModel from './GarmentModel.jsx'
import GlbMannequinModel, { MANNEQUIN_MODEL_URLS } from './GlbMannequinModel.jsx'
import { FITTING_AMBIENT, FITTING_HEMISPHERE, FITTING_LIGHTS } from './fittingLighting.js'

class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <p role="alert">3D 화면을 열 수 없습니다. WebGL 지원과 브라우저 하드웨어 가속을 확인해 주세요.</p> : this.props.children }
}

export default function MannequinCanvas({ parameters, garmentParameters = parameters, calculatedGarment = null, rotation, viewRevision = 0,
  fit = 'none', transparent = false, modelType = 'rings', morphTarget, morphWeight, onMorphTargets,
  nikeShirt = false, shirtVisible = true, fixedSize = false, garmentGlb = null, onGarmentStatus, garmentColor = 'white', bottomGarment = null, onBottomStatus, outerGarment = null, onOuterStatus, headwear = null, onHeadwearStatus, headwearColor = 'black', bottomColor, outerColor, productDesign, productSize, onSizeMetrics, editLogo=false, onLogoMove,bodyBuild='average' }) {
  return <SceneBoundary>
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [0, 1.15, 3.8], fov: 42 }}
      fallback={<p>이 브라우저에서는 WebGL 3D 화면을 사용할 수 없습니다.</p>}>
      <color attach="background" args={['#edf1ee']} />
      <ambientLight intensity={FITTING_AMBIENT} />
      <hemisphereLight args={[FITTING_HEMISPHERE.sky, FITTING_HEMISPHERE.ground, FITTING_HEMISPHERE.intensity]} />
      {FITTING_LIGHTS.map((light, index) => <directionalLight key={index} position={light.position} intensity={light.intensity} />)}
      <group rotation={[0, rotation * Math.PI / 180, 0]}>
        {modelType !== 'rings'
          ? <GlbMannequinModel key={modelType} parameters={parameters} modelUrl={MANNEQUIN_MODEL_URLS[modelType]} targetName={morphTarget}
              targetWeight={morphWeight} onTargets={onMorphTargets} rotation={rotation} viewRevision={viewRevision}
              garmentGlb={shirtVisible ? garmentGlb : null} onGarmentStatus={onGarmentStatus} garmentColor={garmentColor}
              bottomGarment={bottomGarment} onBottomStatus={onBottomStatus} bottomColor={bottomColor}
              outerGarment={outerGarment} onOuterStatus={onOuterStatus} outerColor={outerColor}
              headwear={headwear} onHeadwearStatus={onHeadwearStatus} headwearColor={headwearColor}
              productDesign={productDesign}
              productSize={productSize}
              onSizeMetrics={onSizeMetrics}
              editLogo={editLogo} onLogoMove={onLogoMove}
              bodyBuild={bodyBuild}
              tshirt={nikeShirt && shirtVisible && fit !== 'none'
                ? { parameters: garmentParameters, fit, calculatedGarment, transparent, fixedSize } : null} />
          : <BodyModel parameters={parameters} />}
        {!nikeShirt && !garmentGlb && fit !== 'none' && <GarmentModel parameters={garmentParameters} fit={fit} transparent={transparent} calculatedGarment={calculatedGarment} />}
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.01, 0]}>
        <circleGeometry args={[1, 64]} /><meshStandardMaterial color="#d7dfd9" />
      </mesh>
    </Canvas>
  </SceneBoundary>
}
