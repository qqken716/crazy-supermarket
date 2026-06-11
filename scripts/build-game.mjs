import { build, context } from 'esbuild'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const isWatch = process.argv.includes('--watch')
const outputDirectory = resolve('dist/game')
const gameDirectory = resolve(outputDirectory, 'minigame')
const appId = 'wx8e95e3af64a26c06'

await rm(outputDirectory, { force: true, recursive: true })
await mkdir(gameDirectory, { recursive: true })

const buildOptions = {
  entryPoints: ['src/game.ts'],
  outfile: 'dist/game/minigame/game.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: isWatch ? 'inline' : false,
  minify: !isWatch,
  logLevel: 'info',
  define: {
    __DEV__: JSON.stringify(isWatch),
  },
}

async function writeGameConfig() {
  await writeFile(
    resolve(gameDirectory, 'game.json'),
    `${JSON.stringify(
      {
        deviceOrientation: 'landscape',
        showStatusBar: false,
        networkTimeout: {
          request: 10000,
          connectSocket: 10000,
          uploadFile: 10000,
          downloadFile: 10000,
        },
      },
      null,
      2,
    )}\n`,
  )

  await writeFile(
    resolve(outputDirectory, 'project.config.json'),
    `${JSON.stringify(
      {
        description: '满筐小铺微信小游戏',
        appid: appId,
        projectname: 'mankuang-shop',
        compileType: 'game',
        libVersion: '3.15.2',
        cloudfunctionRoot: 'cloudfunctions/',
        miniprogramRoot: 'minigame/',
        srcMiniprogramRoot: 'minigame/',
        simulatorType: 'wechat',
        simulatorPluginLibVersion: {},
        condition: {},
        packOptions: {
          ignore: [],
          include: [],
        },
        setting: {
          es6: true,
          minified: !isWatch,
          urlCheck: true,
          postcss: false,
          compileHotReLoad: isWatch,
        },
      },
      null,
      2,
    )}\n`,
  )

  const cloudFunctions = resolve('cloudfunctions')
  try {
    await readFile(resolve(cloudFunctions, 'login/index.js'))
    await cp(cloudFunctions, resolve(outputDirectory, 'cloudfunctions'), {
      recursive: true,
    })
  } catch {
    // Cloud functions are deployed separately and are optional for local play.
  }
}

await writeGameConfig()

if (isWatch) {
  const buildContext = await context(buildOptions)
  await buildContext.watch()
  console.log(`Watching. Import ${outputDirectory} in WeChat DevTools.`)
} else {
  await build(buildOptions)
  console.log(`Built WeChat Mini Game: ${outputDirectory}`)
}
