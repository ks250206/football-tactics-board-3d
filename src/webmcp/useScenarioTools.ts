import { useEffect } from 'react';
import type { Project } from '../core';
import { createTrossardReplay, trossardReplay } from './replays';
import { authorSequence, sequenceSchema } from './sequence';

export interface ScenarioPreview {
  project: Project;
  note: string;
  source?: string;
  focus?: string;
}

export function useScenarioTools(openPreview: (preview: ScenarioPreview) => void) {
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();

    const preview = (create: () => ScenarioPreview, signal?: AbortSignal) => {
      try {
        if (controller.signal.aborted || signal?.aborted) return { error: 'The tool call was cancelled.' };
        const draft = create();
        openPreview(draft);
        return {
          status: 'awaiting_user_confirmation',
          duration: draft.project.duration,
          keyframes: draft.project.frames.length,
          next: 'Ask the user to review the preview and apply it in TOUCHLINE, then press Play.',
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Could not preview the sequence.' };
      }
    };

    const tools: WebMCP.ModelContextTool[] = [
      {
        name: 'touchline_list_replays',
        description: 'List the match moments TOUCHLINE can replay. Call this first when asked to recreate a real match event. Includes the Trossard winner against West Ham in 2025/26.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: () => ({ replays: [trossardReplay] }),
      },
      {
        name: 'touchline_preview_replay',
        description: 'Open an editable replay of a catalogued real match moment. The user reviews and applies the preview before playback.',
        inputSchema: {
          type: 'object', required: ['replayId'], additionalProperties: false,
          properties: { replayId: { type: 'string', enum: [trossardReplay.id] } },
        },
        execute: (input, options) => preview(() => {
          if (input.replayId !== trossardReplay.id) throw new Error('Unknown replayId. Call touchline_list_replays.');
          return {
            project: createTrossardReplay(),
            note: trossardReplay.note,
            source: trossardReplay.source,
            focus: 'away-11',
          };
        }, options?.signal),
      },
      {
        name: 'touchline_preview_sequence',
        description: 'Create a new editable 2D/3D football sequence from sparse player and ball keyframes. Use for imagined tactics or approximate match moments absent from the catalog. Use facts from the user or verified reports and mark estimated movements as approximations. The preview waits for the user before replacing their sequence.',
        inputSchema: sequenceSchema,
        execute: (input, options) => preview(() => ({
          project: authorSequence(input),
          note: 'AIが作成した配置・ボール軌道の近似です。シーケンスを確認してから適用してください。',
        }), options?.signal),
      },
    ];

    async function register() {
      try {
        for (const tool of tools) {
          if (controller.signal.aborted) return;
          await context!.registerTool(tool, { signal: controller.signal });
        }
      } catch (error) {
        if (!controller.signal.aborted) console.warn('TOUCHLINE could not register WebMCP tools.', error);
        controller.abort();
      }
    }

    void register();
    return () => controller.abort();
  }, [openPreview]);
}
