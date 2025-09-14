import { z } from 'zod';
import { logger } from './logger.js';
import { ValidationError, LoveChildError } from '../types/index.js';

export interface ToolDefinition {
  name: string;
  description: string;
  schema?: z.ZodType<any>;
  handler: (args: any, context: ToolContext) => Promise<any>;
}

export interface ToolContext {
  correlationId: string;
  workflowManager: any; // Will be properly typed when implemented
  logger: typeof logger;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private initialized = false;

  async registerAllTools(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('Registering MCP tools...');

    try {
      // Import and register SpecKit tools
      await this.registerSpecKitTools();
      
      // Import and register Lovable tools
      await this.registerLovableTools();
      
      // Import and register hybrid workflow tools
      await this.registerHybridTools();
      
      // Register utility tools
      await this.registerUtilityTools();
      
      this.initialized = true;
      logger.info(`Tool registration complete: ${this.tools.size} tools registered`);
      
    } catch (error) {
      logger.error('Failed to register tools', error);
      throw new LoveChildError('Tool registration failed', 'TOOL_REGISTRATION_ERROR', error);
    }
  }

  private async registerSpecKitTools(): Promise<void> {
    // Import SpecKit tools dynamically to avoid circular dependencies
    const { SpecifyTool } = await import('../tools/speckit/specify-tool.js');
    const { PlanTool } = await import('../tools/speckit/plan-tool.js');
    const { TasksTool } = await import('../tools/speckit/tasks-tool.js');
    const { StatusTool } = await import('../tools/speckit/status-tool.js');

    this.registerTool(SpecifyTool);
    this.registerTool(PlanTool);
    this.registerTool(TasksTool);
    this.registerTool(StatusTool);

    logger.info('SpecKit tools registered', { count: 4 });
  }

  private async registerLovableTools(): Promise<void> {
    // Import stub tools for future Lovable functionality (Phase 3)
    const { GenerateTool, PreviewTool } = await import('../tools/stubs.js');

    this.registerTool(GenerateTool);
    this.registerTool(PreviewTool);

    logger.info('Lovable tools registered (stubs)', { count: 2 });
  }

  private async registerHybridTools(): Promise<void> {
    // Import stub tools for future hybrid workflow functionality (Phase 4)
    const { IterateTool, DeployTool } = await import('../tools/stubs.js');

    this.registerTool(IterateTool);
    this.registerTool(DeployTool);

    logger.info('Hybrid workflow tools registered (stubs)', { count: 2 });
  }

  private async registerUtilityTools(): Promise<void> {
    // Import stub tools for advanced features (Phase 5)
    const { AnalyzeTool, OptimizeTool, CollaborateTool } = await import('../tools/stubs.js');

    this.registerTool(AnalyzeTool);
    this.registerTool(OptimizeTool);
    this.registerTool(CollaborateTool);

    logger.info('Utility tools registered (stubs)', { count: 3 });
  }

  registerTool(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool '${tool.name}' is already registered, overriding`);
    }

    // Validate tool definition
    this.validateToolDefinition(tool);

    this.tools.set(tool.name, tool);
    logger.debug(`Tool registered: ${tool.name}`);
  }

  private validateToolDefinition(tool: ToolDefinition): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new ValidationError('Tool name is required and must be a string');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new ValidationError('Tool description is required and must be a string');
    }

    if (typeof tool.handler !== 'function') {
      throw new ValidationError('Tool handler must be a function');
    }

    // Tool name validation
    if (!/^[a-z][a-z0-9_-]*$/.test(tool.name)) {
      throw new ValidationError('Tool name must start with lowercase letter and contain only lowercase letters, numbers, underscores, and hyphens');
    }
  }

  async getTool(name: string): Promise<ToolDefinition | null> {
    if (!this.initialized) {
      throw new LoveChildError('Tool registry not initialized', 'TOOL_REGISTRY_NOT_INITIALIZED');
    }

    return this.tools.get(name) || null;
  }

  async listTools(): Promise<Array<{ name: string; description: string; inputSchema?: any }>> {
    if (!this.initialized) {
      throw new LoveChildError('Tool registry not initialized', 'TOOL_REGISTRY_NOT_INITIALIZED');
    }

    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.schema ? this.zodSchemaToJsonSchema(tool.schema) : undefined
    }));
  }

  async getToolCount(): Promise<number> {
    return this.tools.size;
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  hasTools(names: string[]): boolean {
    return names.every(name => this.tools.has(name));
  }

  // Helper method to convert Zod schema to JSON schema for MCP
  private zodSchemaToJsonSchema(schema: z.ZodType<any>): any {
    // This is a simplified conversion - you might want to use a more robust library
    // like zod-to-json-schema for production use
    try {
      const shape = (schema as any)._def?.shape?.();
      if (shape) {
        const properties: any = {};
        const required: string[] = [];

        Object.entries(shape).forEach(([key, value]: [string, any]) => {
          const fieldSchema = value as z.ZodType<any>;
          properties[key] = this.convertZodFieldToJsonSchema(fieldSchema);

          // Check if field is required
          if (!fieldSchema.isOptional?.()) {
            required.push(key);
          }
        });

        return {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined
        };
      }
    } catch (error) {
      logger.warn('Failed to convert Zod schema to JSON schema', { error });
    }

    return {
      type: 'object',
      description: 'Parameters for this tool'
    };
  }

  private convertZodFieldToJsonSchema(field: z.ZodType<any>): any {
    const typeName = (field as any)._def?.typeName;

    switch (typeName) {
      case 'ZodString':
        return { 
          type: 'string',
          description: (field as any)._def?.description
        };
      case 'ZodNumber':
        return { 
          type: 'number',
          description: (field as any)._def?.description
        };
      case 'ZodBoolean':
        return { 
          type: 'boolean',
          description: (field as any)._def?.description
        };
      case 'ZodArray':
        return { 
          type: 'array',
          items: this.convertZodFieldToJsonSchema((field as any)._def.type),
          description: (field as any)._def?.description
        };
      case 'ZodEnum':
        return { 
          type: 'string',
          enum: (field as any)._def.values,
          description: (field as any)._def?.description
        };
      case 'ZodOptional':
        return this.convertZodFieldToJsonSchema((field as any)._def.innerType);
      case 'ZodDefault':
        const schema = this.convertZodFieldToJsonSchema((field as any)._def.innerType);
        schema.default = (field as any)._def.defaultValue();
        return schema;
      default:
        return { 
          type: 'string',
          description: (field as any)._def?.description || 'Parameter value'
        };
    }
  }

  // Development and debugging helpers
  async validateAllTools(): Promise<{ valid: string[]; invalid: Array<{ name: string; error: string }> }> {
    const valid: string[] = [];
    const invalid: Array<{ name: string; error: string }> = [];

    for (const [name, tool] of this.tools.entries()) {
      try {
        this.validateToolDefinition(tool);
        valid.push(name);
      } catch (error) {
        invalid.push({
          name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return { valid, invalid };
  }

  // Get tool statistics
  getStatistics(): {
    totalTools: number;
    toolsByCategory: Record<string, number>;
    initialized: boolean;
  } {
    const toolsByCategory: Record<string, number> = {};

    for (const toolName of this.tools.keys()) {
      const category = this.getToolCategory(toolName);
      toolsByCategory[category] = (toolsByCategory[category] || 0) + 1;
    }

    return {
      totalTools: this.tools.size,
      toolsByCategory,
      initialized: this.initialized
    };
  }

  private getToolCategory(toolName: string): string {
    if (toolName.startsWith('specify') || toolName.startsWith('plan') || toolName.startsWith('tasks') || toolName.startsWith('status')) {
      return 'speckit';
    }
    if (toolName.startsWith('scrape') || toolName.startsWith('generate') || toolName.startsWith('preview')) {
      return 'lovable';
    }
    if (toolName.startsWith('reimagine') || toolName.startsWith('clone') || toolName.startsWith('iterate')) {
      return 'hybrid';
    }
    return 'utility';
  }

  // Cleanup method
  cleanup(): void {
    logger.info('Cleaning up tool registry', { toolCount: this.tools.size });
    
    // Clear all registered tools
    this.tools.clear();
    this.initialized = false;
    
    logger.info('Tool registry cleanup complete');
  }
}