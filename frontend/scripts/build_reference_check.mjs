// Compile frontend code without duplicating hundreds of MB of public assets.
// Actual model/normal-map files are validated by the related asset tests.
import {existsSync} from 'node:fs'
import {build} from 'vite'
const outDir='.codex-reference-v10-codecheck'
if(existsSync(outDir))throw new Error('Refusing to overwrite an existing build check')
await build({publicDir:false,build:{outDir}})
