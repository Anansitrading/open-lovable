import { ToolDefinition, ToolContext } from '../core/tool-registry.js';
import { GenerateToolSchema, GenerateToolInput, GenerateToolResult, generateTool, storeGeneratedCode } from './generate-tool.js';

export const AIGenerateTool: ToolDefinition = {
  name: 'generate',
  description: 'Generate complete React/TypeScript applications from specifications using AI. Creates files, detects dependencies, and validates code quality.',
  schema: GenerateToolSchema,
  handler: async (args: GenerateToolInput, context: ToolContext): Promise<GenerateToolResult> => {
    const result = await generateTool(args, context.correlationId);
    
    // Store generated code in workflow state for E2B integration if successful
    if (result.success && result.generation) {
      storeGeneratedCode(
        args.workflowId,
        {
          files: result.generation.files.map(f => ({ filePath: f.filePath, content: f.content })),
          dependencies: result.generation.dependencies,
          devDependencies: result.generation.devDependencies,
          commands: result.generation.commands,
          projectStructure: result.generation.projectStructure,
          summary: result.generation.summary
        },
        context.correlationId
      );
    }
    
    return result;
  }
};