// Cross-platform build of both frontends. --check leaves no output files.
import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import path from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url))
const check=process.argv.includes('--check')
for(const app of ['frontend','ai-fashion']){
  const dir=path.join(root,app)
  const require=createRequire(path.join(dir,'package.json'))
  const {build}=await import(pathToFileURL(require.resolve('vite')).href)
  await build({root:dir,...(check?{publicDir:false,build:{write:false}}:
    app==='ai-fashion'?{build:{outDir:path.join(root,'frontend/dist/ai-fashion'),emptyOutDir:true}}:{})})
}
console.log(check?'Both frontend code builds passed (no output written).':'Combined site: frontend/dist')
