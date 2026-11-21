import {isGameOver} from './game-logic.mjs?v=preview-gel';

// Finished saves retain their record, but must not launch straight back into
// the game-over dialog as if that were a second start menu.
export function canContinueRun(hasSavedGame,board){
  return hasSavedGame&&!isGameOver(board);
}
