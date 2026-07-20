import type { TuiPlugin } from "@opencode-ai/plugin/tui";

export const id = "opencode-speak";

export const tui: TuiPlugin = async (api) => {
  const dispose = api.command?.register(() => [
    {
      title: "Toggle voice mode",
      value: "opencode-speak.toggle",
      description: "Start or stop voice mode",
      category: "opencode-speak",
      keybind: "<leader>v",
      onSelect: async () => {
        const active = api.kv.get("voice.active", false);
        const next = !active;
        api.kv.set("voice.active", next);

        api.ui.toast({
          message: next ? "Voice mode ON" : "Voice mode OFF",
          variant: next ? "success" : "info",
          duration: 2000,
        });

        await api.client.tui.appendPrompt({ text: "/voice" });
        await api.client.tui.submitPrompt();
      },
    },
  ]);

  if (dispose) {
    api.lifecycle.onDispose(dispose);
  }
};
