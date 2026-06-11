# 满筐小铺微信小游戏架构

## 技术栈

- 微信小游戏原生 Canvas 2D
- 横屏场景与基于世界坐标的平滑跟随相机
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
    world.ts                 # 地图区域、商品与生产设施配置
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
动物的原料、产物及开始加工时间会持久化，重新进入游戏后继续结算。
旧存档中的原奶和包装机库存会迁移成奶牛的牛奶产物。

渲染时先将 Canvas 原点移动到屏幕中心，再按相机缩放和相机世界坐标做反向平移。
HUD 与触控摇杆在恢复 Canvas 状态后绘制，因此不会随镜头移动。
设置卡片中的镜头倍率写入 `settings.cameraScale`，在不同屏幕尺寸下与基础缩放相乘。
真机启动和旋转时通过 `wx.getWindowInfo()` 与 `wx.onWindowResize()` 更新逻辑视口，
Canvas 缓冲区按 DPR 重建，渲染矩阵统一缩放，避免横屏画面被压缩或拉伸。
HUD 使用 `safeArea`/`safeAreaInsets` 计算四边留白，横屏时会将竖屏方向的安全区
转换到当前坐标系，避开刘海、灵动岛、圆角和 Home 区域。

玩家使用圆形碰撞体与设施矩形做圆角碰撞检测，X/Y 分轴移动以保留沿边滑动。
顾客使用多方向转向尝试绕开设施；设施和人物按底部 Y 坐标排序，保持正确遮挡关系。
设施碰撞框会比绘制外轮廓适当内缩，保证视觉通道和实际可通行宽度一致。
镜头只在世界最外侧留少量缓冲，不再提前半个屏幕停止跟随。

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
