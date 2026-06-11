# Crazy Supermarket

微信小游戏版 2D 模拟经营原型，使用原生 Canvas、TypeScript、esbuild 和微信云开发。

## 已实现

- 触控摇杆和角色移动
- 苹果货源自动采集
- 背包容量和货架自动补货
- 顾客生成、购物、收银和离场
- 收银台金币收集
- 20 金币解锁新区域
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
