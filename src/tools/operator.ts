import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  atHome,
  atRemdim,
  channelHome,
  channelRemdim,
  faderAction,
  grandmasterLevel,
  groupHome,
  groupRemdim,
  keyPress,
} from "../eos/addresses.js";
import { buildCommand } from "../eos/command.js";
import type { EosContext } from "../eos/context.js";
import {
  buildChannelParkCli,
  buildMakeManualCommand,
  buildSetCueTimingCommand,
} from "../eos/programming.js";
import { sendChannelSelection, sendGroupSelection } from "../eos/selection.js";
import {
  buttonStateFields,
  buttonStateToEdge,
  channelSelectionFields,
  expandChannelSelection,
  grandmasterLevelSchema,
  groupSelectionFields,
  hasChannelSelection,
  hasGroupSelection,
  highlightStateSchema,
  timingValueSchema,
} from "../specs/lighting-ops.js";
import { gateLiveWrite, jsonResult, liveWriteFields, sendButton } from "./helpers.js";

async function sendCliStep(ctx: EosContext, line: string): Promise<string> {
  const cmd = buildCommand(line, "enter");
  await ctx.client.send("/eos/newcmd", cmd.text);
  return cmd.text;
}

export function registerOperatorTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "grandmaster_set_level",
    {
      description:
        "Set grand master 0–100% via mapped OSC fader /eos/fader/0/1 (internal 0.0–1.0). Separate from blackout — never use GM=0 as BO.",
      inputSchema: z.object({
        level: grandmasterLevelSchema,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ level, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const faderValue = level / 100;
      const address = grandmasterLevel();
      await ctx.client.send(address, faderValue);
      return jsonResult({
        ok: true,
        action: "grandmaster_set_level",
        address,
        level,
        faderValue,
      });
    }
  );

  server.registerTool(
    "blackout",
    {
      description:
        "Console Blackout via /eos/key/blackout. Separate from grandmaster_set_level(0). Never Chan Thru Out.",
      inputSchema: z.object({
        ...buttonStateFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ state, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const effectiveState = state ?? "toggle";
      const edge = buttonStateToEdge(effectiveState);
      const address = keyPress("blackout");
      await sendButton(ctx, address, edge);
      return jsonResult({ ok: true, action: "blackout", address, state: effectiveState, edge });
    }
  );

  const parkChannelFields = {
    ...channelSelectionFields,
    method: z.enum(["cli", "key"]).optional().default("cli"),
    ...liveWriteFields,
  };

  const parkChannelHandler = async ({
    method,
    confirm,
    allow_live,
    ...selection
  }: {
    method?: "cli" | "key";
    confirm?: boolean;
    allow_live?: boolean;
    channel?: number;
    channels?: number[];
    ranges?: Array<{ from: number; thru: number }>;
    from?: number;
    thru?: number;
    minus?: number[];
  }) => {
    const blocked = gateLiveWrite(ctx, { confirm, allow_live });
    if (blocked) return blocked;

    if (!hasChannelSelection(selection)) {
      return jsonResult(
        { ok: false, error: "Provide channel, channels, ranges, or from/thru for park." },
        true
      );
    }

    const steps: string[] = [];
    const transport = method ?? "cli";
    if (transport === "key") {
      steps.push(...(await sendChannelSelection(ctx, selection)));
      const address = keyPress("park");
      await sendButton(ctx, address);
      steps.push(address);
    } else {
      try {
        steps.push(await sendCliStep(ctx, buildChannelParkCli("Park", selection)));
      } catch (error) {
        return jsonResult(
          { ok: false, error: error instanceof Error ? error.message : String(error) },
          true
        );
      }
    }

    const parked = expandChannelSelection(selection);
    ctx.listener.getState().parkedChannels = [
      ...new Set([...ctx.listener.getState().parkedChannels, ...parked]),
    ];
    return jsonResult({ ok: true, action: "park_channel", method: transport, steps, parked });
  };

  server.registerTool(
    "park_channel",
    {
      description:
        "Park via CLI 'Chan N Park' (/eos/newcmd) or key /eos/key/park after channel select (channels/ranges/minus). Requires confirm + allow_live.",
      inputSchema: z.object(parkChannelFields),
      annotations: { destructiveHint: true },
    },
    parkChannelHandler
  );

  server.registerTool(
    "park",
    {
      description: "Park channels (legacy alias of park_channel).",
      inputSchema: z.object(parkChannelFields),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const result = await parkChannelHandler(args);
      if (result.isError) return result;
      const body = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
      body.action = "park";
      body.canonicalAction = "park_channel";
      return jsonResult(body);
    }
  );

  const unparkChannelHandler = async ({
    confirm,
    allow_live,
    ...selection
  }: {
    confirm?: boolean;
    allow_live?: boolean;
    channel?: number;
    channels?: number[];
    ranges?: Array<{ from: number; thru: number }>;
    from?: number;
    thru?: number;
    minus?: number[];
  }) => {
    const blocked = gateLiveWrite(ctx, { confirm, allow_live });
    if (blocked) return blocked;

    if (!hasChannelSelection(selection)) {
      return jsonResult(
        { ok: false, error: "Provide channel, channels, ranges, or from/thru for unpark." },
        true
      );
    }

    let sent: string;
    try {
      sent = await sendCliStep(ctx, buildChannelParkCli("Unpark", selection));
    } catch (error) {
      return jsonResult(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        true
      );
    }

    const unparked = expandChannelSelection(selection);
    ctx.listener.getState().parkedChannels = ctx.listener
      .getState()
      .parkedChannels.filter((ch) => !unparked.includes(ch));
    return jsonResult({ ok: true, action: "unpark_channel", sent, unparked });
  };

  server.registerTool(
    "unpark_channel",
    {
      description:
        "Unpark via CLI 'Chan N Unpark' (/eos/newcmd) with shared channels/ranges selection. Requires confirm + allow_live.",
      inputSchema: z.object({
        ...channelSelectionFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    unparkChannelHandler
  );

  server.registerTool(
    "unpark",
    {
      description: "Unpark channels (legacy alias of unpark_channel).",
      inputSchema: z.object({
        ...channelSelectionFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const result = await unparkChannelHandler(args);
      if (result.isError) return result;
      const body = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
      body.action = "unpark";
      body.canonicalAction = "unpark_channel";
      return jsonResult(body);
    }
  );

  server.registerTool(
    "get_parked",
    {
      description: "Return channels parked this session (CLI park/unpark tracking + sync hint).",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const state = ctx.listener.getState();
      return jsonResult({
        parkedChannels: state.parkedChannels,
        count: state.parkedChannels.length,
        note: "Run sync_show_targets patch=true for full patch state; park list is session-tracked.",
      });
    }
  );

  server.registerTool(
    "highlight",
    {
      description:
        "Highlight channel-check mode via /eos/key/highlight. With channels/ranges: select then highlight (default on). Without selection: mode only (state required). No level arg.",
      inputSchema: z.object({
        state: highlightStateSchema.optional(),
        ...channelSelectionFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ state, confirm, allow_live, ...selection }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const hasSelection = hasChannelSelection(selection);
      const effectiveState = state ?? (hasSelection ? "on" : undefined);
      if (!effectiveState) {
        return jsonResult(
          { ok: false, error: "Pass state (on|off|toggle) when no channel selection is given." },
          true
        );
      }

      const steps: string[] = [];
      if (hasSelection) {
        steps.push(...(await sendChannelSelection(ctx, selection)));
      }

      const address = keyPress("highlight");
      const edge = buttonStateToEdge(effectiveState);
      await sendButton(ctx, address, edge);
      steps.push(`${address} (${edge})`);

      return jsonResult({
        ok: true,
        action: "highlight",
        state: effectiveState,
        steps,
        address,
        edge,
      });
    }
  );

  server.registerTool(
    "rem_dim",
    {
      description:
        "Rem Dim via /eos/at/remdim, /eos/chan/{n}/remdim, /eos/group/{n}/remdim, or /eos/key/rem_dim. Same selection shape as highlight.",
      inputSchema: z.object({
        state: highlightStateSchema.optional(),
        group: z.number().int().positive().optional(),
        use_key: z.boolean().optional().describe("Force /eos/key/rem_dim instead of target remdim path."),
        ...channelSelectionFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ state, group, use_key, confirm, allow_live, ...selection }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const hasSelection = hasChannelSelection(selection) || group !== undefined;
      const effectiveState = state ?? (hasSelection ? "on" : undefined);
      if (!effectiveState) {
        return jsonResult(
          { ok: false, error: "Pass state (on|off|toggle) when no selection is given." },
          true
        );
      }

      const steps: string[] = [];
      if (group !== undefined) {
        steps.push(...(await sendGroupSelection(ctx, { group })));
      } else if (hasChannelSelection(selection)) {
        steps.push(...(await sendChannelSelection(ctx, selection)));
      }

      const singleChannel =
        selection.channel !== undefined &&
        !(selection.channels?.length) &&
        !(selection.ranges?.length) &&
        selection.from === undefined;

      let address: string;
      if (use_key) {
        address = keyPress("rem_dim");
      } else if (group !== undefined) {
        address = groupRemdim(group);
      } else if (singleChannel) {
        address = channelRemdim(selection.channel!);
      } else if (hasSelection) {
        address = atRemdim();
      } else {
        address = keyPress("rem_dim");
      }

      const edge = buttonStateToEdge(effectiveState);
      await sendButton(ctx, address, edge);
      steps.push(`${address} (${edge})`);

      return jsonResult({
        ok: true,
        action: "rem_dim",
        state: effectiveState,
        address,
        group,
        steps,
        edge,
      });
    }
  );

  server.registerTool(
    "timing_disable",
    {
      description: "Press [Timing Disable] via /eos/key/timing_disable.",
      inputSchema: z.object({
        ...buttonStateFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ state, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const effectiveState = state ?? "toggle";
      const edge = buttonStateToEdge(effectiveState);
      const address = keyPress("timing_disable");
      await sendButton(ctx, address, edge);
      return jsonResult({
        ok: true,
        action: "timing_disable",
        address,
        state: effectiveState,
        edge,
      });
    }
  );

  server.registerTool(
    "sneak",
    {
      description:
        "Press [Sneak] via /eos/key/sneak after optional channel selection. Optional time prepends CLI Time before the key.",
      inputSchema: z.object({
        time: timingValueSchema.optional().describe("Optional fade time before Sneak (CLI Time N)."),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...channelSelectionFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ time, edge, confirm, allow_live, ...selection }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const steps: string[] = [];
      if (hasChannelSelection(selection)) {
        steps.push(...(await sendChannelSelection(ctx, selection)));
      }
      if (time !== undefined) {
        steps.push(await sendCliStep(ctx, `Time ${time}`));
      }

      const address = keyPress("sneak");
      await sendButton(ctx, address, edge);
      steps.push(address);
      return jsonResult({
        ok: true,
        action: "sneak",
        address,
        edge: edge ?? "tap",
        time,
        steps,
      });
    }
  );

  server.registerTool(
    "home",
    {
      description:
        "Home selected targets via /eos/at/home, /eos/chan/{n}/home, /eos/group/{n}/home, fader home, or /eos/key/home. Selection required.",
      inputSchema: z.object({
        ...groupSelectionFields,
        faderBank: z.number().int().min(0).optional(),
        fader: z.number().int().positive().optional(),
        use_key: z.boolean().optional(),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...channelSelectionFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ faderBank, fader, use_key, edge, confirm, allow_live, ...selection }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const hasExplicitGroup =
        selection.group !== undefined || (selection.groups?.length ?? 0) > 0;
      const groupInput = hasExplicitGroup
        ? {
            group: selection.group,
            groups: selection.groups,
            from: selection.from,
            thru: selection.thru,
          }
        : {};
      const channelInput = {
        channel: selection.channel,
        channels: selection.channels,
        ranges: selection.ranges,
        from: hasExplicitGroup ? undefined : selection.from,
        thru: hasExplicitGroup ? undefined : selection.thru,
        minus: selection.minus,
      };

      const hasChannel = hasChannelSelection(channelInput);
      const hasFader = faderBank !== undefined && fader !== undefined;
      const hasGroup = hasGroupSelection(groupInput);

      if (!hasChannel && !hasGroup && !hasFader && !use_key) {
        return jsonResult(
          {
            ok: false,
            error:
              "home requires selection: channels/ranges, group/groups, faderBank+fader, or use_key=true.",
          },
          true
        );
      }

      const steps: string[] = [];
      if (hasGroup) {
        steps.push(...(await sendGroupSelection(ctx, groupInput)));
      } else if (hasChannel) {
        steps.push(...(await sendChannelSelection(ctx, channelInput)));
      }

      const singleChannel =
        channelInput.channel !== undefined &&
        !(channelInput.channels?.length) &&
        !(channelInput.ranges?.length);

      const singleGroup =
        groupInput.group !== undefined &&
        !(groupInput.groups?.length) &&
        groupInput.from === undefined;

      let address: string;
      if (use_key) {
        address = keyPress("home");
      } else if (hasGroup && singleGroup) {
        address = groupHome(groupInput.group!);
      } else if (hasGroup) {
        address = atHome();
      } else if (singleChannel) {
        address = channelHome(channelInput.channel!);
      } else if (hasFader) {
        address = faderAction(faderBank!, fader!, "home");
      } else if (hasChannel) {
        address = atHome();
      } else {
        address = keyPress("home");
      }

      await sendButton(ctx, address, edge);
      steps.push(address);

      return jsonResult({
        ok: true,
        action: "home",
        address,
        group: groupInput.group,
        groups: groupInput.groups,
        faderBank,
        fader,
        steps,
        edge: edge ?? "tap",
      });
    }
  );

  server.registerTool(
    "make_manual",
    {
      description:
        "Make Manual via /eos/newcmd only (no OSC verb). Optional channels/ranges select programmer first. Required after Go before Update.",
      inputSchema: z.object({
        ...channelSelectionFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ confirm, allow_live, ...selection }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const steps: string[] = [];
      if (hasChannelSelection(selection)) {
        steps.push(...(await sendChannelSelection(ctx, selection)));
      }
      const sent = await sendCliStep(ctx, buildMakeManualCommand());
      steps.push(sent);
      return jsonResult({ ok: true, action: "make_manual", path: "/eos/newcmd", sent, steps });
    }
  );

  server.registerTool(
    "set_cue_timing",
    {
      description:
        "Set cue timing (time, delay, down, focus/color/beam, follow/hang, block) via CLI.",
      inputSchema: z.object({
        cue: z.union([z.number(), z.string()]),
        cueList: z.number().int().positive().optional(),
        part: z.number().int().positive().optional(),
        time: timingValueSchema.optional(),
        delay: timingValueSchema.optional(),
        down: timingValueSchema.optional(),
        downDelay: timingValueSchema.optional(),
        focus: timingValueSchema.optional(),
        color: timingValueSchema.optional(),
        beam: timingValueSchema.optional(),
        follow: z.boolean().optional(),
        hang: timingValueSchema.optional(),
        block: z.boolean().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateLiveWrite(ctx, args);
      if (blocked) return blocked;

      const sent = await sendCliStep(ctx, buildSetCueTimingCommand(args));
      return jsonResult({ ok: true, action: "set_cue_timing", sent, cueList: args.cueList, cue: args.cue });
    }
  );
}
