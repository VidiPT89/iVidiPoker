import { randomInt } from 'node:crypto';

// Receives the same private projection as a player, never the deck or another hand.
export function chooseBotAction(view, id, evaluate, random = () => randomInt(10000) / 10000) {
  const player = view.players.find(seat => seat.id === id);
  if (!player || player.cards.length !== 2) throw new Error('Bot requires its own two cards');
  const [first, second] = player.cards;
  const call = Math.max(0, view.currentBet - player.bet);
  const maximum = player.bet + player.stack;
  const pot = Math.max(20, view.pot);
  let strength;

  if (view.board.length < 3) {
    const high = Math.max(first.rank, second.rank);
    const low = Math.min(first.rank, second.rank);
    strength = first.rank === second.rank
      ? 0.55 + high / 35
      : 0.12 + high / 42 + low / 65
        + (first.suit === second.suit ? 0.07 : 0)
        + (high - low <= 2 ? 0.05 : 0);
  } else {
    const handValue = evaluate([...player.cards, ...view.board]);
    const category = Math.floor(handValue / 15 ** 5);
    strength = [0.16, 0.42, 0.64, 0.76, 0.85, 0.91, 0.96, 0.99, 1][category];
    const highestBoard = Math.max(...view.board.map(card => card.rank));
    if (category === 1 && player.cards.some(card => card.rank === highestBoard)) strength += 0.12;
    const privatePair = first.rank === second.rank || player.cards.some(hole => view.board.some(card => card.rank === hole.rank));
    if (category >= 1 && category <= 3 && !privatePair) strength = 0.22 + Math.max(first.rank, second.rank) / 100;
    // A strong shared board is not, by itself, a strong private advantage.
    if (view.board.length === 5 && evaluate(view.board) === handValue) {
      const royalFlush = category === 8 && Math.floor(handValue / 15 ** 4) % 15 === 14;
      strength = royalFlush ? 1 : Math.min(strength, 0.35);
    }
  }

  const roll = random();
  const price = Math.min(call, player.stack) / (pot + Math.min(call, player.stack));
  if (call > 0 && strength < 0.65 && (price > strength * 0.65 || call > player.stack * 0.4) && roll < 0.85) {
    return { action: 'fold', amount: 0 };
  }
  const valueRaise = strength >= 0.64 && roll < 0.55;
  const occasionalBluff = call === 0 && strength < 0.4 && roll < 0.05;
  if (view.canRaise && (valueRaise || occasionalBluff)) {
    const increment = Math.max(view.minRaise, Math.round((pot + call) * (strength > 0.85 ? 0.75 : 0.5)));
    return { action: 'raise', amount: Math.min(maximum, view.currentBet + increment) };
  }
  return { action: call === 0 ? 'check' : 'call', amount: 0 };
}
