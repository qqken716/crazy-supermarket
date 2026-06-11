# 微信小游戏架构

## 技术栈

- 微信小游戏原生 Canvas 2D
- TypeScript
- esbuild
- 微信云开发

当前工程不再使用 uni-app、Vue、Pinia 或 Vite。微信小游戏入口必须是
`game.js` 和 `game.json`，构建产物位于 `dist/game`。

## 目录

```text
src/
  game.ts                    # 小游戏入口
  domain/game-profile.ts     # 持久化档案类型和初始档案
  game/
    input.ts                 # 触控摇杆
    supermarket-game.ts      # 游戏循环、交互和渲染
    world.ts                 # 地图区域和运行时顾客类型
  platform/cloud.ts          # 微信登录和云函数适配
  store/game-store.ts        # 本地缓存与云同步编排
  types/wechat-minigame.d.ts # 微信小游戏 API 类型
cloudfunctions/
  login/
  gameProfile/
cloud/database/
  schemas/
scripts/
  build-game.mjs
  open-wechat-devtools.mjs
```

## 存档策略

1. 启动时立即读取本地存档并开始渲染。
2. 后台异步调用微信登录和云函数读取云存档。
3. 高频操作只更新内存，250ms 防抖写入本地存储。
4. 普通数据最多每 90 秒上传一次。
5. 解锁和升级立即触发云同步。
6. `wx.onHide` 强制保存本地并尝试上传云端。
7. 云函数以 `revision` 做乐观并发控制。

顾客路径、动画、待收金币等瞬时运行态不进入 `UserProfile`。

## 构建

```bash
npm run build
```

构建脚本生成：

```text
dist/game/
  minigame/
    game.js
    game.json
  project.config.json
  cloudfunctions/
```

`project.config.json` 使用：

```json
{
  "compileType": "game",
  "appid": "wx8e95e3af64a26c06"
}
```

## 云开发部署

1. 使用小游戏 AppID 打开 `dist/game`。
2. 在开发者工具中开通云开发环境。
3. 创建 `user_profiles` 集合。
4. 配置 `cloud/database/database.rules.json` 中的权限。
5. 上传并部署 `login`、`gameProfile`，选择云端安装依赖。

云开发尚未开通时，游戏自动使用本地离线存档，不影响游戏循环。
