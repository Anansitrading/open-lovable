import { ToolDefinition, ToolContext } from '../../core/tool-registry.js';
import { PlanToolSchema, PlanInput, PlanResponse, PlanArtifact } from '../../types/index.js';
import { createWarpLLMService } from '../../integrations/warp-llm-service.js';
import { logger } from '../../core/logger.js';

export const PlanTool: ToolDefinition = {
  name: 'plan',
  description: 'Generate technical implementation plans from project specifications using SpecKit methodology and Warp\'s native AI capabilities.',
  schema: PlanToolSchema,
  handler: async (args: PlanInput, context: ToolContext): Promise<PlanResponse> => {
    const { techStack, architecture, features, constraints } = args;
    const { correlationId, workflowManager, logger: contextLogger } = context;
    
    contextLogger.info('Starting plan tool execution', {
      correlationId,
      techStack,
      architecture,
      features: features?.length || 0,
      constraints: constraints?.length || 0
    });

    try {
      // Get current workflow and ensure spec exists
      const workflow = await workflowManager.getCurrentWorkflow();
      if (!workflow) {
        throw new Error('No active workflow found. Run /specify first to create a specification.');
      }

      if (!workflow.artifacts.spec) {
        throw new Error('No specification found in workflow. Run /specify first.');
      }

      const spec = workflow.artifacts.spec;
      
      // Generate technical plan using Warp LLM service
      const warpLLM = createWarpLLMService(correlationId);
      
      const planPrompt = `You are a senior technical architect creating a comprehensive implementation plan based on a project specification.

## Project Specification
**Title**: ${spec.title}
**Description**: ${spec.description}

**Requirements**:
${spec.requirements.map((req: string, i: number) => `${i + 1}. ${req}`).join('\n')}

**Technical Constraints**:
${spec.constraints.map((constraint: string, i: number) => `${i + 1}. ${constraint}`).join('\n')}

${spec.scrapedContext ? `\n**Source Context**: Based on ${spec.scrapedContext.url}\n` : ''}

## Technical Specifications
**Technology Stack**: ${techStack.join(', ')}
**Architecture**: ${architecture}
${features ? `**Additional Features**: ${features.join(', ')}` : ''}
${constraints ? `**Implementation Constraints**: ${constraints.join(', ')}` : ''}

## Instructions
Create a comprehensive technical implementation plan that includes:

1. **Architecture Overview** - High-level system design and component relationships
2. **Technology Decisions** - Detailed rationale for chosen technologies and alternatives considered
3. **Implementation Phases** - Ordered development phases with clear deliverables
4. **Milestones & Dependencies** - Key milestones with prerequisites and estimated effort
5. **Risk Assessment** - Technical risks and mitigation strategies
6. **Deployment Strategy** - How the system will be built, tested, and deployed

Focus on:
- Practical, actionable implementation steps
- Clear phase dependencies and sequencing
- Realistic time estimates and resource planning
- Technical risk identification and mitigation
- Quality assurance and testing strategy

Provide a structured response that can be easily converted to markdown.`;

      const llmResponse = await warpLLM.generateTechnicalPlan(
        planPrompt,
        techStack,
        architecture
      );

      // Parse the AI response and create plan artifact
      const plan = await parsePlanFromLLM(llmResponse, {
        techStack,
        architecture,
        features: features || [],
        constraints: constraints || [],
        specification: spec
      });

      // Update workflow phase and save plan
      await workflowManager.setPlan(plan);
      await workflowManager.updateWorkflowPhase('tasks');

      const planFilePath = await workflowManager.getFilePath('plan.md');

      contextLogger.info('Technical plan generated successfully', {
        correlationId,
        architecture: plan.architecture,
        techStackSize: plan.techStack.length,
        milestonesCount: plan.milestones.length,
        filePath: planFilePath
      });

      return {
        success: true,
        data: plan,
        filePath: planFilePath,
        metadata: {
          executionTime: 0,
          timestamp: new Date(),
          version: '1.0.0'
        }
      };

    } catch (error) {
      contextLogger.error('Plan tool execution failed', {
        correlationId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: `Failed to generate plan: ${error instanceof Error ? error.message : String(error)}`,
        filePath: '',
        metadata: {
          executionTime: 0,
          timestamp: new Date(),
          version: '1.0.0'
        }
      };
    }
  }
};

async function parsePlanFromLLM(
  llmResponse: string, 
  context: {
    techStack: string[];
    architecture: string;
    features: string[];
    constraints: string[];
    specification: any;
  }
): Promise<PlanArtifact> {
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(llmResponse);
    
    return {
      architecture: parsed.architecture || extractArchitecture(llmResponse) || context.architecture,
      techStack: Array.isArray(parsed.techStack) ? parsed.techStack : context.techStack,
      features: Array.isArray(parsed.features) ? parsed.features : 
                context.features.concat(extractFeatures(llmResponse)),
      milestones: Array.isArray(parsed.milestones) ? parsed.milestones : 
                  extractMilestones(llmResponse),
      risks: Array.isArray(parsed.risks) ? parsed.risks : extractRisks(llmResponse)
    };
  } catch (parseError) {
    // Fallback: extract information from text response
    logger.warn('Failed to parse LLM response as JSON, extracting from text', { parseError });
    
    return {
      architecture: extractArchitecture(llmResponse) || context.architecture,
      techStack: context.techStack,
      features: context.features.concat(extractFeatures(llmResponse)),
      milestones: extractMilestones(llmResponse),
      risks: extractRisks(llmResponse)
    };
  }
}

function extractArchitecture(text: string): string | null {
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Look for architecture mentions
    if (trimmed.toLowerCase().includes('architecture') && trimmed.includes(':')) {
      const match = trimmed.match(/:\s*(.+)$/);
      if (match) {
        return match[1].trim();
      }
    }
  }
  
  return null;
}

function extractFeatures(text: string): string[] {
  const features: string[] = [];
  const lines = text.split('\n');
  let inFeaturesSection = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.toLowerCase().includes('feature') && trimmed.includes(':')) {
      inFeaturesSection = true;
      continue;
    }
    
    if (inFeaturesSection) {
      // Stop if we hit another section
      if (trimmed.match(/^#+\s/) || trimmed.match(/^\*\*[^*]+\*\*/) || trimmed.length === 0) {
        if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) {
          inFeaturesSection = false;
          continue;
        }
      }
      
      // Extract bullet points
      const bulletMatch = trimmed.match(/^[-*•]\s*(.+)$/);
      if (bulletMatch) {
        features.push(bulletMatch[1].trim());
      }
    }
  }
  
  return features.slice(0, 20);
}

function extractMilestones(text: string): PlanArtifact['milestones'] {
  const milestones: PlanArtifact['milestones'] = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for milestone patterns
    const milestoneMatch = line.match(/^(?:#+\s*)?(?:milestone|phase)\s*(\d+)?[:\s]*(.+)$/i);
    if (milestoneMatch) {
      const name = milestoneMatch[2].trim();
      let description = '';
      let dependencies: string[] = [];
      let estimatedHours = 40; // Default estimate
      
      // Look ahead for description and details
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (!nextLine) continue;
        
        if (nextLine.match(/^#+\s/) || nextLine.toLowerCase().includes('milestone')) {
          break;
        }
        
        if (nextLine.toLowerCase().includes('depend')) {
          const depMatch = nextLine.match(/:\s*(.+)$/);
          if (depMatch) {
            dependencies = depMatch[1].split(',').map(s => s.trim());
          }
        } else if (nextLine.toLowerCase().includes('hour') || nextLine.toLowerCase().includes('time')) {
          const timeMatch = nextLine.match(/(\d+)\s*(?:hour|day|week)/i);
          if (timeMatch) {
            estimatedHours = parseInt(timeMatch[1]);
            if (nextLine.toLowerCase().includes('day')) estimatedHours *= 8;
            if (nextLine.toLowerCase().includes('week')) estimatedHours *= 40;
          }
        } else if (!description && nextLine.length > 10) {
          description = nextLine;
        }
      }
      
      milestones.push({
        name,
        description: description || `Implementation of ${name}`,
        dependencies,
        estimatedHours
      });
    }
  }
  
  // If no milestones found, create basic ones
  if (milestones.length === 0) {
    milestones.push(
      {
        name: 'Project Setup',
        description: 'Initialize project structure and development environment',
        dependencies: [],
        estimatedHours: 16
      },
      {
        name: 'Core Implementation',
        description: 'Implement main features and functionality',
        dependencies: ['Project Setup'],
        estimatedHours: 80
      },
      {
        name: 'Testing & Deployment',
        description: 'Quality assurance and production deployment',
        dependencies: ['Core Implementation'],
        estimatedHours: 24
      }
    );
  }
  
  return milestones.slice(0, 10);
}

function extractRisks(text: string): string[] {
  const risks: string[] = [];
  const lines = text.split('\n');
  let inRiskSection = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.toLowerCase().includes('risk') && trimmed.includes(':')) {
      inRiskSection = true;
      continue;
    }
    
    if (inRiskSection) {
      // Stop if we hit another section
      if (trimmed.match(/^#+\s/) || trimmed.match(/^\*\*[^*]+\*\*/) || trimmed.length === 0) {
        if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) {
          inRiskSection = false;
          continue;
        }
      }
      
      // Extract bullet points
      const bulletMatch = trimmed.match(/^[-*•]\s*(.+)$/);
      if (bulletMatch) {
        risks.push(bulletMatch[1].trim());
      }
    }
  }
  
  // Add default risks if none found
  if (risks.length === 0) {
    risks.push(
      'Technical complexity may exceed initial estimates',
      'External dependencies could introduce delays',
      'Performance requirements may require architecture adjustments'
    );
  }
  
  return risks.slice(0, 10);
}