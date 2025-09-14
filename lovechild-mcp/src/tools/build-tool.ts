import { z } from 'zod';
import { logger } from '../core/logger.js';
import { SpecifyTool } from './speckit/specify-tool.js';
import { PlanTool } from './speckit/plan-tool.js';
import { generateTool } from './generate-tool.js';
import { deployTool } from './deploy-tool.js';
import { CodeGenerationOptions } from '../integrations/ai-service.js';
import { LoveChildError } from '../types/index.js';

export const BuildToolSchema = z.object({
  description: z.string().describe("Project description or requirements"),
  fromUrl: z.string().url().optional().describe("URL to scrape for context"),
  projectType: z.enum(['landing-page', 'dashboard', 'webapp', 'component-library']).default('webapp').describe("Type of project to build"),
  complexity: z.enum(['simple', 'medium', 'complex']).default('medium').describe("Complexity level of the application"),
  style: z.enum(['minimal', 'modern', 'glassmorphism', 'brutalism']).default('modern').describe("Design style for the application"),
  technology: z.enum(['react', 'nextjs', 'vite']).default('react').describe("Technology stack"),
  features: z.array(z.string()).optional().describe("Additional features to include"),
  constraints: z.array(z.string()).optional().describe("Additional constraints to consider"),
  customInstructions: z.string().optional().describe("Custom instructions for code generation"),
  projectName: z.string().optional().default('lovable-project').describe("Project name in sandbox"),
  port: z.number().optional().default(3000).describe("Port to serve the preview on"),
  skipPlan: z.boolean().default(false).describe("Skip the planning phase and go directly to code generation"),
  validateCode: z.boolean().default(true).describe("Whether to validate generated code"),
  deployToSandbox: z.boolean().default(true).describe("Whether to deploy to E2B sandbox"),
  createPreview: z.boolean().default(true).describe("Whether to create a live preview")
});

export type BuildToolInput = z.infer<typeof BuildToolSchema>;

export interface BuildToolResult {
  success: boolean;
  workflowId: string;
  phases: {
    specification?: {
      success: boolean;
      title?: string;
      requirements?: number;
      executionTime: number;
      error?: string;
    };
    planning?: {
      success: boolean;
      techStack?: string[];
      features?: number;
      executionTime: number;
      error?: string;
    };
    generation?: {
      success: boolean;
      filesGenerated?: number;
      dependencies?: number;
      executionTime: number;
      error?: string;
    };
    deployment?: {
      success: boolean;
      filesDeployed?: number;
      previewUrl?: string;
      executionTime: number;
      error?: string;
    };
  };
  totalTime: number;
  previewUrl?: string;
  message: string;
  details?: any;
}

/**
 * Build Tool - Complete end-to-end workflow from specification to live preview
 */
export async function buildTool(
  input: BuildToolInput,
  correlationId: string
): Promise<BuildToolResult> {
  const timer = logger.startTimer('build-tool');
  
  try {
    logger.info('Starting end-to-end build workflow', {
      correlationId,
      projectType: input.projectType,
      complexity: input.complexity,
      style: input.style,
      fromUrl: !!input.fromUrl,
      skipPlan: input.skipPlan,
      deployToSandbox: input.deployToSandbox,
      createPreview: input.createPreview
    });

    // Generate a workflow ID for this build
    const workflowId = `build_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const result: BuildToolResult = {
      success: false,
      workflowId,
      phases: {},
      totalTime: 0,
      message: 'Build workflow started.'
    };

    // Phase 1: Specification
    logger.info('Phase 1: Creating specification', {
      correlationId,
      workflowId,
      description: input.description.slice(0, 100),
      fromUrl: input.fromUrl
    });

    const phaseTimer1 = logger.startTimer('build-phase-1-specification');
    try {
      const specResult = await SpecifyTool.handler({
        description: input.description,
        fromUrl: input.fromUrl,
        style: input.style,
        technology: input.technology,
        refine: false
      }, { correlationId, workflowManager: null, logger });

      const executionTime1 = phaseTimer1();
      
      if (specResult.success && specResult.specification) {
        result.phases.specification = {
          success: true,
          title: specResult.specification.title,
          requirements: specResult.specification.requirements.length,
          executionTime: executionTime1
        };
        
        // Store workflow ID in the specification result for chaining
        if (specResult.workflowId) {
          result.workflowId = specResult.workflowId;
        }
      } else {
        result.phases.specification = {
          success: false,
          executionTime: executionTime1,
          error: specResult.message
        };
        
        const totalTime = timer();
        result.totalTime = totalTime;
        result.message = `Build failed in specification phase: ${specResult.message}`;
        return result;
      }
    } catch (error) {
      const executionTime1 = phaseTimer1();
      result.phases.specification = {
        success: false,
        executionTime: executionTime1,
        error: error instanceof Error ? error.message : String(error)
      };
      
      const totalTime = timer();
      result.totalTime = totalTime;
      result.message = `Build failed in specification phase: ${error instanceof Error ? error.message : String(error)}`;
      return result;
    }

    // Phase 2: Planning (optional)
    if (!input.skipPlan) {
      logger.info('Phase 2: Creating plan', {
        correlationId,
        workflowId,
        projectType: input.projectType
      });

      const phaseTimer2 = logger.startTimer('build-phase-2-planning');
      try {
        const planResult = await PlanTool.handler({
          workflowId,
          techStack: ['react', 'typescript', 'vite', 'tailwindcss'],
          architecture: 'spa',
          features: input.features,
          constraints: input.constraints
        }, { correlationId, workflowManager: null, logger });

        const executionTime2 = phaseTimer2();
        
        if (planResult.success && planResult.plan) {
          result.phases.planning = {
            success: true,
            techStack: planResult.plan.techStack,
            features: planResult.plan.features.length,
            executionTime: executionTime2
          };
        } else {
          result.phases.planning = {
            success: false,
            executionTime: executionTime2,
            error: planResult.message
          };
          
          const totalTime = timer();
          result.totalTime = totalTime;
          result.message = `Build failed in planning phase: ${planResult.message}`;
          return result;
        }
      } catch (error) {
        const executionTime2 = phaseTimer2();
        result.phases.planning = {
          success: false,
          executionTime: executionTime2,
          error: error instanceof Error ? error.message : String(error)
        };
        
        const totalTime = timer();
        result.totalTime = totalTime;
        result.message = `Build failed in planning phase: ${error instanceof Error ? error.message : String(error)}`;
        return result;
      }
    }

    // Phase 3: Code Generation
    logger.info('Phase 3: Generating code', {
      correlationId,
      workflowId,
      projectType: input.projectType,
      complexity: input.complexity
    });

    const phaseTimer3 = logger.startTimer('build-phase-3-generation');
    try {
      const generateResult = await generateTool({
        workflowId,
        projectType: input.projectType,
        complexity: input.complexity,
        style: input.style,
        features: input.features,
        constraints: input.constraints,
        customInstructions: input.customInstructions,
        validateCode: input.validateCode,
        extractDeps: true
      }, correlationId);

      const executionTime3 = phaseTimer3();
      
      if (generateResult.success && generateResult.generation) {
        result.phases.generation = {
          success: true,
          filesGenerated: generateResult.generation.files.length,
          dependencies: generateResult.generation.dependencies.length,
          executionTime: executionTime3
        };
      } else {
        result.phases.generation = {
          success: false,
          executionTime: executionTime3,
          error: generateResult.message
        };
        
        const totalTime = timer();
        result.totalTime = totalTime;
        result.message = `Build failed in code generation phase: ${generateResult.message}`;
        return result;
      }
    } catch (error) {
      const executionTime3 = phaseTimer3();
      result.phases.generation = {
        success: false,
        executionTime: executionTime3,
        error: error instanceof Error ? error.message : String(error)
      };
      
      const totalTime = timer();
      result.totalTime = totalTime;
      result.message = `Build failed in code generation phase: ${error instanceof Error ? error.message : String(error)}`;
      return result;
    }

    // Phase 4: Deployment (optional)
    if (input.deployToSandbox) {
      logger.info('Phase 4: Deploying to sandbox', {
        correlationId,
        workflowId,
        projectName: input.projectName,
        port: input.port
      });

      const phaseTimer4 = logger.startTimer('build-phase-4-deployment');
      try {
        const deployResult = await deployTool({
          workflowId,
          projectName: input.projectName,
          port: input.port,
          installDependencies: true,
          startDevServer: true,
          createPreview: input.createPreview
        }, correlationId);

        const executionTime4 = phaseTimer4();
        
        if (deployResult.success) {
          result.phases.deployment = {
            success: true,
            filesDeployed: deployResult.deployment?.filesDeployed,
            previewUrl: deployResult.preview?.url,
            executionTime: executionTime4
          };
          
          if (deployResult.preview?.url) {
            result.previewUrl = deployResult.preview.url;
          }
        } else {
          result.phases.deployment = {
            success: false,
            executionTime: executionTime4,
            error: deployResult.message
          };
          
          const totalTime = timer();
          result.totalTime = totalTime;
          result.message = `Build failed in deployment phase: ${deployResult.message}`;
          return result;
        }
      } catch (error) {
        const executionTime4 = phaseTimer4();
        result.phases.deployment = {
          success: false,
          executionTime: executionTime4,
          error: error instanceof Error ? error.message : String(error)
        };
        
        const totalTime = timer();
        result.totalTime = totalTime;
        result.message = `Build failed in deployment phase: ${error instanceof Error ? error.message : String(error)}`;
        return result;
      }
    }

    // Build completed successfully
    const totalTime = timer();
    result.totalTime = totalTime;
    result.success = true;

    // Generate success message
    const phases = Object.keys(result.phases).length;
    const filesGenerated = result.phases.generation?.filesGenerated || 0;
    const filesDeployed = result.phases.deployment?.filesDeployed || 0;
    
    let message = `Build completed successfully in ${phases} phases! Generated ${filesGenerated} files`;
    
    if (result.phases.deployment?.success) {
      message += `, deployed ${filesDeployed} files`;
    }
    
    if (result.previewUrl) {
      message += `. Live preview: ${result.previewUrl}`;
    }

    result.message = message;
    result.details = {
      workflowId,
      projectType: input.projectType,
      complexity: input.complexity,
      style: input.style,
      technology: input.technology,
      phasesCompleted: phases,
      skippedPlan: input.skipPlan,
      totalTime
    };

    logger.info('End-to-end build workflow completed successfully', {
      correlationId,
      workflowId,
      phases,
      filesGenerated,
      filesDeployed: filesDeployed || 0,
      previewUrl: result.previewUrl,
      totalTime
    });

    return result;

  } catch (error) {
    const totalTime = timer();
    logger.error('End-to-end build workflow failed', {
      correlationId,
      totalTime,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      workflowId: 'unknown',
      phases: {},
      totalTime,
      message: `Build workflow failed: ${error instanceof Error ? error.message : String(error)}`,
      details: {
        projectType: input.projectType,
        complexity: input.complexity,
        style: input.style,
        totalTime,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}