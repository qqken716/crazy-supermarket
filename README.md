# 满筐小铺

原创微信小游戏 2D 模拟经营原型，围绕采集、生产、补货和结账展开，使用原生
Canvas、TypeScript、esbuild 和微信云开发。

品牌 Logo、图标尺寸和使用说明见 [docs/brand.md](docs/brand.md)。

## 已实现

- 触控摇杆和角色移动
- 横屏大地图与平滑跟随角色的镜头
- 高饱和卡通场景、立体货架、人物和悬浮库存 UI
- 设施实体碰撞与基于 Y 坐标的前后遮挡
- 左侧设置卡片支持远、标准、近三档视角
- 刘海、灵动岛、圆角和 Home 区域安全区适配
- 苹果货源自动采集
- 245 基础移动速度与 180ms 连续采集/投料
- 番茄采集和番茄货架
- 番茄投喂鸡，等待产出鸡蛋
- 番茄投喂奶牛，等待直接产出牛奶
- 容量固定为 8 瓶的牛奶冰箱
- 背包容量和货架自动补货
- 顾客生成、购物、收银和离场
- 收银台金币收集
- 20 金币同时解锁番茄、鸡蛋和牛奶生产区
- 本地存档和微信云存档同步
- 90 秒节流、关键事件及后台同步
- `revision` 乐观锁和冲突备份

## 开发

```bash
npm install
npm run type-check
npm run build
npm run open:wechat
```

微信开发者工具导入目录：

```text
dist/game
```

工具顶部应显示“小游戏模式”。

持续构建：

```bash
npm run dev
```

## 云开发

在微信开发者工具中开通云开发，创建 `user_profiles` 集合，并部署：

- `cloudfunctions/login`
- `cloudfunctions/gameProfile`

详细说明见 [docs/architecture.md](docs/architecture.md)。
