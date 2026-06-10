<template>
  <view class="page">
    <view class="hero">
      <text class="hero__title">疯狂上货</text>
      <text class="hero__subtitle">30 秒内按提示点击正确商品，帮超市补满货架。</text>
    </view>

    <view class="panel score-panel">
      <view class="score-item">
        <text class="score-item__label">倒计时</text>
        <text class="score-item__value">{{ timeLeft }}s</text>
      </view>
      <view class="score-item">
        <text class="score-item__label">当前得分</text>
        <text class="score-item__value">{{ score }}</text>
      </view>
      <view class="score-item">
        <text class="score-item__label">最高分</text>
        <text class="score-item__value">{{ bestScore }}</text>
      </view>
    </view>

    <view class="panel task-panel">
      <text class="task-panel__label">本轮目标</text>
      <text class="task-panel__target">{{ currentTargetText }}</text>
      <text class="task-panel__hint">{{ statusText }}</text>
    </view>

    <view class="goods-grid">
      <button
        v-for="good in goods"
        :key="good.id"
        class="goods-card"
        :class="{ 'goods-card--active': gameRunning && targetId === good.id }"
        @click="chooseGood(good.id)"
      >
        <text class="goods-card__emoji">{{ good.emoji }}</text>
        <text class="goods-card__name">{{ good.name }}</text>
      </button>
    </view>

    <button class="start-button" @click="startGame">
      {{ gameRunning ? "重新开始" : gameOver ? "再玩一局" : "开始游戏" }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onHide, onUnload } from "@dcloudio/uni-app";

type Good = {
  id: string;
  name: string;
  emoji: string;
};

const goods: Good[] = [
  { id: "apple", name: "苹果", emoji: "🍎" },
  { id: "milk", name: "牛奶", emoji: "🥛" },
  { id: "bread", name: "面包", emoji: "🍞" },
  { id: "cake", name: "蛋糕", emoji: "🍰" },
  { id: "carrot", name: "胡萝卜", emoji: "🥕" },
  { id: "banana", name: "香蕉", emoji: "🍌" },
];

const GAME_DURATION = 30;
const BEST_SCORE_KEY = "crazy-supermarket-best-score";

const score = ref(0);
const timeLeft = ref(GAME_DURATION);
const gameRunning = ref(false);
const gameOver = ref(false);
const targetId = ref(goods[0].id);
const statusText = ref("点击开始游戏，看看你能补满多少货架。");
const bestScore = ref(Number(uni.getStorageSync(BEST_SCORE_KEY) || 0));

let timer: ReturnType<typeof setInterval> | null = null;

const currentTargetText = computed(() => {
  if (!gameRunning.value && !gameOver.value) {
    return "准备开张";
  }

  if (gameOver.value) {
    return "本局结束";
  }

  const target = goods.find((good) => good.id === targetId.value);
  return target ? `${target.emoji} ${target.name}` : "补货中";
});

const pickNextTarget = () => {
  const nextIndex = Math.floor(Math.random() * goods.length);
  targetId.value = goods[nextIndex].id;
};

const stopTimer = () => {
  if (!timer) {
    return;
  }

  clearInterval(timer);
  timer = null;
};

const finishGame = () => {
  stopTimer();
  gameRunning.value = false;
  gameOver.value = true;
  statusText.value = `打烊啦，你成功补货 ${score.value} 次。`;

  if (score.value > bestScore.value) {
    bestScore.value = score.value;
    uni.setStorageSync(BEST_SCORE_KEY, score.value);
    statusText.value = `新纪录！你成功补货 ${score.value} 次。`;
  }
};

const startGame = () => {
  stopTimer();
  score.value = 0;
  timeLeft.value = GAME_DURATION;
  gameRunning.value = true;
  gameOver.value = false;
  statusText.value = "看准提示，快速补货。";
  pickNextTarget();

  timer = setInterval(() => {
    if (timeLeft.value <= 1) {
      timeLeft.value = 0;
      finishGame();
      return;
    }

    timeLeft.value -= 1;
  }, 1000);
};

const chooseGood = (id: string) => {
  if (!gameRunning.value) {
    statusText.value = "请先开始游戏。";
    return;
  }

  if (id === targetId.value) {
    score.value += 1;
    statusText.value = "补货成功，继续保持。";
    pickNextTarget();
    return;
  }

  score.value = Math.max(0, score.value - 1);
  statusText.value = "拿错商品了，扣 1 分。";
};

onHide(stopTimer);
onUnload(stopTimer);
</script>

<style>
.page {
  min-height: 100vh;
  padding: 40rpx 28rpx 64rpx;
  background: linear-gradient(180deg, #fff7eb 0%, #ffe0b5 100%);
  box-sizing: border-box;
}

.hero {
  padding: 32rpx;
  border-radius: 28rpx;
  background: #ff8f3d;
  color: #ffffff;
  box-shadow: 0 20rpx 40rpx rgba(255, 143, 61, 0.2);
}

.hero__title {
  display: block;
  font-size: 52rpx;
  font-weight: 700;
}

.hero__subtitle {
  display: block;
  margin-top: 16rpx;
  font-size: 28rpx;
  line-height: 1.6;
}

.panel {
  margin-top: 24rpx;
  padding: 28rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 16rpx 32rpx rgba(98, 65, 20, 0.08);
}

.score-panel {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
}

.score-item {
  flex: 1;
  text-align: center;
}

.score-item__label {
  display: block;
  font-size: 24rpx;
  color: #8c6a47;
}

.score-item__value {
  display: block;
  margin-top: 12rpx;
  font-size: 44rpx;
  font-weight: 700;
  color: #3d2b1f;
}

.task-panel {
  text-align: center;
}

.task-panel__label {
  font-size: 26rpx;
  color: #8c6a47;
}

.task-panel__target {
  display: block;
  margin-top: 18rpx;
  font-size: 44rpx;
  font-weight: 700;
  color: #ff7a00;
}

.task-panel__hint {
  display: block;
  margin-top: 16rpx;
  font-size: 26rpx;
  color: #5f4b3b;
}

.goods-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20rpx;
  margin-top: 24rpx;
}

.goods-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 220rpx;
  border: 4rpx solid transparent;
  border-radius: 24rpx;
  background: #ffffff;
  color: #3d2b1f;
  box-shadow: 0 16rpx 32rpx rgba(98, 65, 20, 0.08);
}

.goods-card--active {
  border-color: #ff7a00;
  background: #fff2df;
}

.goods-card::after {
  border: 0;
}

.goods-card__emoji {
  font-size: 60rpx;
}

.goods-card__name {
  margin-top: 16rpx;
  font-size: 30rpx;
}

.start-button {
  margin-top: 32rpx;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #ff8a00 0%, #ff5b3a 100%);
}

.start-button::after {
  border: 0;
}
</style>
