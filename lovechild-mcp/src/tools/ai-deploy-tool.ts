import { ToolDefinition, ToolContext } from '../core/tool-registry.js';
import { DeployToolSchema, DeployToolInput, DeployToolResult, deployTool } from './deploy-tool.js';

export const AIDeployTool: ToolDefinition = {
  name: 'deploy',
  description: 'Deploy AI-generated code to E2B sandboxes with automatic dependency installation and live preview. Integrates generated code with sandbox environments.',
  schema: DeployToolSchema,
  handler: async (args: DeployToolInput, context: ToolContext): Promise<DeployToolResult> => {
    return await deployTool(args, context.correlationId);
  }
};