# crazy-supermarket

一个基于 **Vue 3 + TypeScript + uni-app + Vite** 的微信小程序小游戏示例。

## 游戏玩法

- 点击“开始游戏”后会进入 30 秒倒计时
- 根据页面提示，快速点击对应的商品完成补货
- 点击正确商品加 1 分，点错扣 1 分（最低 0 分）
- 本地自动记录最高分

## 开发

```bash
npm install
npm run dev:mp-weixin
```

然后将 `dist/dev/mp-weixin` 导入微信开发者工具进行预览。

## 构建

```bash
npm run build:mp-weixin
```
