import { createContext, useContext } from 'react';
import type { GameCtx } from './gameStore';

export const GameContext = createContext<GameCtx | null>(null);
export const useGame = (): GameCtx => {
  const c = useContext(GameContext);
  if (!c) throw new Error('GameContext missing: a game panel was rendered outside <GameScreen>');
  return c;
};
