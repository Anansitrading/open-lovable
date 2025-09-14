import { ToolDefinition, ToolContext } from '../core/tool-registry.js';
import { PreviewToolSchema, PreviewToolInput, PreviewToolResult, previewTool } from './preview.js';

export const E2BPreviewTool: ToolDefinition = {
  name: 'preview',
  description: 'Create and manage live E2B sandbox preview deployments for React/Vite projects with real-time development servers.',
  schema: PreviewToolSchema,
  handler: async (args: PreviewToolInput, context: ToolContext): Promise<PreviewToolResult> => {
    return await previewTool(args, context.correlationId);
  }
};