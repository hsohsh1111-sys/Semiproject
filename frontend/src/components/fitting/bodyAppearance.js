// Own only body materials. A real baked tangent-space normal map adds fine
// surface detail on the muscular build without changing the other presets.
export const MUSCLE_DETAIL_URL='/models/ONFIT_Muscle_Detail_v3.png'
export const MUSCLE_DETAIL_ENABLED=false
export function createBodyAppearance(scene) {
  const originals=new Map(),clones=new Map()
  let disposed=false
  scene.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.material)return
    originals.set(mesh,mesh.material)
    const prepare=source=>{
      if(!clones.has(source))clones.set(source,source.clone())
      return clones.get(source)
    }
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(prepare):prepare(mesh.material)
  })
  return {
    setBuild(build,texture) {
      if(disposed)return
      clones.forEach((material,source)=>{
        if(!('normalMap' in material))return
        const muscular=MUSCLE_DETAIL_ENABLED&&build==='muscular'&&Boolean(texture)
        const map=muscular?texture:source.normalMap
        if(material.normalMap!==map){material.normalMap=map;material.needsUpdate=true}
        if(muscular)material.normalScale.set(1,1)
        else material.normalScale.copy(source.normalScale)
        material.roughness=muscular ? .78 : source.roughness
      })
    },
    dispose() {
      if(disposed)return
      originals.forEach((material,mesh)=>{mesh.material=material})
      clones.forEach(material=>material.dispose());disposed=true
    },
  }
}
