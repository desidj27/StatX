import { DB } from "./db.js";

/**
 * Reward coins for a chat message (cooldown + economy feature gate).
 * @returns {Promise<number>} coins awarded (0 if skipped)
 */
export async function rewardMessageActivity(guildId, userId, settings) {
  if (!settings?.features?.economy) return 0;
  const amount = Number(settings.economy?.message_reward ?? 0);
  if (amount <= 0) return 0;

  const cooldownSec = Number(settings.economy?.message_reward_cooldown_sec ?? 45);
  const cooldownMs = Math.max(0, cooldownSec) * 1000;
  const now = Date.now();

  const claimed = await DB.tryClaimMessageReward(guildId, userId, {
    amount,
    cooldownMs,
    nowMs: now,
  });
  return claimed ? amount : 0;
}

/**
 * Reward coins for credited voice seconds.
 * @returns {Promise<number>} coins awarded
 */
export async function rewardVoiceActivity(guildId, userId, voiceSeconds, settings) {
  if (!settings?.features?.economy) return 0;
  const perMinute = Number(settings.economy?.voice_reward_per_minute ?? 0);
  if (perMinute <= 0 || voiceSeconds <= 0) return 0;

  const minutes = Math.floor(voiceSeconds / 60);
  if (minutes <= 0) return 0;

  const amount = minutes * perMinute;
  await DB.addBalance(guildId, userId, amount);
  return amount;
}
