import { ToolDefinition, ToolContext } from '../core/tool-registry.js';
import { BuildToolSchema, BuildToolInput, BuildToolResult, buildTool } from './build-tool.js';

export const AIBuildTool: ToolDefinition = {
  name: 'build',
  description: 'Complete end-to-end workflow from specification to live preview. Orchestrates specification, planning, AI code generation, E2B deployment, and live preview creation in a single command.',
  schema: BuildToolSchema,
  handler: async (args: BuildToolInput, context: ToolContext): Promise<BuildToolResult> => {
    return await buildTool(args, context.correlationId);
  }
};