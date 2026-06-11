import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cli = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const project = resolve('dist/game')

await execFileAsync(cli, ['open', '--project', project])
console.log(`Opened WeChat DevTools: ${project}`)
