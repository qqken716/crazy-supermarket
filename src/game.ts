import { SupermarketGame } from '@/game/supermarket-game'

const game = new SupermarketGame()

void game.start().catch((error) => {
  console.error('[game] startup failed', error)
})
