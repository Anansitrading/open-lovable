import { z } from 'zod';
import { logger } from '../core/logger.js';
import { createAIService, CodeGenerationResult, CodeGenerationOptions } from '../integrations/ai-service.js';
import { LoveChildError } from '../types/index.js';

export const GenerateToolSchema = z.object({
  workflowId: z.string().describe("Workflow ID to generate code for"),
  projectType: z.enum(['landing-page', 'dashboard', 'webapp', 'component-library']).default('webapp').describe("Type of project to generate"),
  complexity: z.enum(['simple', 'medium', 'complex']).default('medium').describe("Complexity level of the generated application"),
  style: z.enum(['minimal', 'modern', 'glassmorphism', 'brutalism']).default('modern').describe("Design style for the application"),
  features: z.array(z.string()).optional().describe("Additional features to include"),
  constraints: z.array(z.string()).optional().describe("Additional constraints to consider"),
  customInstructions: z.string().optional().describe("Custom instructions for code generation"),
  validateCode: z.boolean().default(true).describe("Whether to validate generated code"),
  extractDeps: z.boolean().default(true).describe("Whether to extract and analyze dependencies")
});

export type GenerateToolInput = z.infer<typeof GenerateToolSchema>;

export interface GenerateToolResult {
  success: boolean;
  workflowId: string;
  generation?: {
    files: Array<{ filePath: string; content: string; size: number }>;
    dependencies: string[];
    devDependencies: string[];
    commands: string[];
    projectStructure: string;
    summary: string;
  };
  validation?: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  extractedDeps?: {
    dependencies: string[];
    devDependencies: string[];
  };
  message: string;
  details?: any;
}

/**
 * AI Code Generation Tool - Generate React/TypeScript applications from specifications
 */
export async function generateTool(
  input: GenerateToolInput,
  correlationId: string
): Promise<GenerateToolResult> {
  const timer = logger.startTimer('generate-tool');
  
  try {
    logger.info('Processing code generation request', {
      correlationId,
      workflowId: input.workflowId,
      projectType: input.projectType,
      complexity: input.complexity,
      style: input.style,
      featuresCount: input.features?.length || 0,
      constraintsCount: input.constraints?.length || 0,
      hasCustomInstructions: !!input.customInstructions
    });

    // Get workflow context to retrieve specification and plan
    const workflowState = global.workflowState?.get?.(input.workflowId);
    if (!workflowState) {
      const executionTime = timer();
      return {
        success: false,
        workflowId: input.workflowId,
        message: `No workflow found with ID ${input.workflowId}. Please run 'specify' first to create a specification.`,
        details: { executionTime }
      };
    }

    const specification = workflowState.artifacts?.spec;
    if (!specification) {
      const executionTime = timer();
      return {
        success: false,
        workflowId: input.workflowId,
        message: `No specification found for workflow ${input.workflowId}. Please run 'specify' first.`,
        details: { executionTime }
      };
    }

    const plan = workflowState.artifacts?.plan;

    // Initialize AI service
    const aiService = createAIService(correlationId);

    // Prepare generation options
    const options: CodeGenerationOptions = {
      projectType: input.projectType,
      complexity: input.complexity,
      style: input.style,
      features: input.features,
      constraints: input.constraints,
      customInstructions: input.customInstructions
    };

    // Generate code
    logger.info('Starting AI code generation', {
      correlationId,
      workflowId: input.workflowId,
      title: specification.title,
      options
    });

    const generationResult = await aiService.generateCode(specification, plan, options);

    // Prepare file info with sizes
    const files = generationResult.files.map(file => ({
      filePath: file.filePath,
      content: file.content,
      size: Buffer.byteLength(file.content, 'utf8')
    }));

    const result: GenerateToolResult = {
      success: true,
      workflowId: input.workflowId,
      generation: {
        files,
        dependencies: generationResult.dependencies,
        devDependencies: generationResult.devDependencies,
        commands: generationResult.commands,
        projectStructure: generationResult.projectStructure,
        summary: generationResult.summary
      },
      message: `Code generation completed successfully. Generated ${files.length} files with ${generationResult.dependencies.length} dependencies.`
    };

    // Validate generated code if requested
    if (input.validateCode) {
      logger.info('Validating generated code', {
        correlationId,
        workflowId: input.workflowId,
        fileCount: files.length
      });

      const validation = await aiService.validateGeneratedCode(generationResult.files);
      result.validation = validation;

      if (!validation.valid) {
        logger.warn('Generated code has validation issues', {
          correlationId,
          workflowId: input.workflowId,
          errors: validation.errors.length,
          warnings: validation.warnings.length
        });
        
        result.message += ` Note: Code validation found ${validation.errors.length} errors and ${validation.warnings.length} warnings.`;
      }
    }

    // Extract dependencies if requested and different from AI output
    if (input.extractDeps) {
      logger.info('Extracting dependencies from generated code', {
        correlationId,
        workflowId: input.workflowId
      });

      const extractedDeps = await aiService.extractDependencies(generationResult.files);
      result.extractedDeps = extractedDeps;

      // Compare with AI-provided dependencies
      const aiDepsSet = new Set(generationResult.dependencies);
      const extractedDepsSet = new Set(extractedDeps.dependencies);
      const missing = extractedDeps.dependencies.filter(dep => !aiDepsSet.has(dep));
      const extra = generationResult.dependencies.filter(dep => !extractedDepsSet.has(dep));

      if (missing.length > 0 || extra.length > 0) {
        logger.info('Dependency differences detected', {
          correlationId,
          workflowId: input.workflowId,
          missing,
          extra
        });
        
        result.details = { 
          ...(result.details || {}),
          dependencyAnalysis: {
            aiProvided: generationResult.dependencies.length,
            extracted: extractedDeps.dependencies.length,
            missing,
            extra
          }
        };
      }
    }

    const executionTime = timer();
    result.details = { 
      ...(result.details || {}),
      executionTime,
      totalFileSize: files.reduce((sum, file) => sum + file.size, 0),
      averageFileSize: Math.round(files.reduce((sum, file) => sum + file.size, 0) / files.length)
    };

    logger.info('Code generation completed successfully', {
      correlationId,
      workflowId: input.workflowId,
      filesGenerated: files.length,
      totalSize: result.details.totalFileSize,
      executionTime
    });

    return result;

  } catch (error) {
    const executionTime = timer();
    logger.error('Code generation failed', {
      correlationId,
      workflowId: input.workflowId,
      executionTime,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      workflowId: input.workflowId,
      message: `Code generation failed: ${error instanceof Error ? error.message : String(error)}`,
      details: {
        projectType: input.projectType,
        complexity: input.complexity,
        style: input.style,
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

/**
 * Helper function to store generated code in workflow state for later use
 */
export function storeGeneratedCode(
  workflowId: string,
  generationResult: CodeGenerationResult,
  correlationId: string
): void {
  try {
    if (!global.workflowState) {
      global.workflowState = new Map();
    }

    const workflowState = global.workflowState.get(workflowId);
    if (!workflowState) {
      logger.warn('Cannot store generated code: workflow state not found', {
        correlationId,
        workflowId
      });
      return;
    }

    // Store in workflow state for E2B integration
    workflowState.generatedCode = {
      files: generationResult.files,
      dependencies: generationResult.dependencies,
      devDependencies: generationResult.devDependencies,
      commands: generationResult.commands,
      summary: generationResult.summary,
      timestamp: new Date()
    };

    global.workflowState.set(workflowId, workflowState);

    logger.info('Generated code stored in workflow state', {
      correlationId,
      workflowId,
      fileCount: generationResult.files.length
    });

  } catch (error) {
    logger.error('Failed to store generated code in workflow state', {
      correlationId,
      workflowId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}