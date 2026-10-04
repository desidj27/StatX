/** Log every interaction immediately (sync) so panel logs show something. */
export function logInteractionReceived(interaction) {
  const label = interaction.isChatInputCommand()
    ? `cmd:${interaction.commandName}`
    : interaction.isButton()
      ? `btn:${interaction.customId}`
      : interaction.isMessageContextMenuCommand()
        ? `ctx:${interaction.commandName}`
        : `type:${interaction.type}`;
  console.log(`[interaction] ${label} id=${interaction.id}`);
}

export async function safeDeferReply(interaction, label = "command") {
  if (interaction.deferred || interaction.replied) return;

  const t0 = Date.now();
  console.log(`[defer] start ${label}`);
  await Promise.race([
    interaction.deferReply(),
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`deferReply timed out (${label})`)),
        2900
      );
    }),
  ]);
  console.log(`[defer] ok ${label} +${Date.now() - t0}ms`);
}

export async function safeDeferUpdate(interaction, label = "button") {
  if (interaction.deferred || interaction.replied) return;

  const t0 = Date.now();
  console.log(`[defer] start ${label}`);
  await Promise.race([
    interaction.deferUpdate(),
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`deferUpdate timed out (${label})`)),
        2900
      );
    }),
  ]);
  console.log(`[defer] ok ${label} +${Date.now() - t0}ms`);
}
