import { ToolDefinition, ToolContext } from '../../core/tool-registry.js';
import { SpecifyToolSchema, SpecifyInput, SpecifyResponse, SpecificationArtifact } from '../../types/index.js';
import { createWarpLLMService } from '../../integrations/warp-llm-service.js';
import { logger } from '../../core/logger.js';

export const SpecifyTool: ToolDefinition = {
  name: 'specify',
  description: 'Generate comprehensive project specifications using SpecKit methodology with AI assistance. Can optionally scrape a website URL for context.',
  schema: SpecifyToolSchema,
  handler: async (args: SpecifyInput, context: ToolContext): Promise<SpecifyResponse> => {
    const { description, fromUrl, style, technology, refine } = args;
    const { correlationId, workflowManager, logger: contextLogger } = context;
    
    contextLogger.info('Starting specify tool execution', {
      correlationId,
      hasUrl: !!fromUrl,
      technology,
      style,
      refine
    });

    try {
      // Initialize or get current workflow
      let workflow = await workflowManager.getCurrentWorkflow();
      
      if (!workflow && !refine) {
        // Create new workflow for new specifications
        workflow = await workflowManager.createNewWorkflow(description);
      }

      if (!workflow) {
        throw new Error('No active workflow found. Use refine=false to create a new workflow.');
      }

      let scrapedContext = null;

      // Handle URL scraping if provided
      if (fromUrl) {
        contextLogger.info('Scraping website for context', { 
          correlationId, 
          url: fromUrl 
        });

        // TODO: Implement Firecrawl web scraping in Phase 2
        // For now, use a placeholder
        scrapedContext = {
          url: fromUrl,
          content: `# Website Context Placeholder\n\nURL: ${fromUrl}\n\nWeb scraping functionality will be implemented in Phase 2.\nFor now, please provide detailed requirements in the description field.`,
          timestamp: new Date()
        };
        
        contextLogger.info('Using web scraping placeholder', {
          correlationId,
          url: fromUrl
        });
      }

      // Prepare context for AI generation
      let contextPrompt = '';
      if (scrapedContext) {
        contextPrompt = `\n\n## Website Context (from ${scrapedContext.url})\n\n${scrapedContext.content}`;
      }

      if (refine && workflow.artifacts.spec) {
        contextPrompt += `\n\n## Current Specification\n\n${JSON.stringify(workflow.artifacts.spec, null, 2)}`;
      }

      // Generate specification using Warp LLM service
      const warpLLM = createWarpLLMService(correlationId);
      
      const fullPrompt = `You are a senior software architect helping to create a comprehensive project specification following industry best practices.

## Project Requirements
${description}

## Target Technology
${technology || 'React with modern web technologies'}

${style ? `## Design Style\n${style}` : ''}

${contextPrompt}

## Instructions
${refine ? 
  'REFINE the existing specification based on the new requirements and context provided above.' : 
  'CREATE a comprehensive specification from scratch based on the requirements above.'
}

Generate a well-structured specification that includes:

1. **Project Title** - Clear, descriptive title
2. **Project Overview** - Detailed description and goals  
3. **Functional Requirements** - Specific features and capabilities
4. **Non-Functional Requirements** - Performance, scalability, security
5. **User Stories** - Detailed user stories with acceptance criteria
6. **Technical Constraints** - Technology limitations and requirements
7. **Success Criteria** - How to measure project success

Please provide the specification in a structured format that can be easily converted to markdown.

Focus on:
- Clear, actionable requirements
- Specific acceptance criteria
- Technical feasibility
- User-centered design
- Measurable success metrics

Respond with a JSON object containing the specification details.`;

      const llmResponse = await warpLLM.generateSpecification(fullPrompt, {
        scrapedContext,
        technology,
        style
      });

      // Parse the AI response and create specification artifact
      const spec = await parseSpecificationFromLLM(llmResponse, {
        description,
        technology: technology || 'react',
        style,
        scrapedContext
      });

      // Save specification to workflow
      await workflowManager.setSpecification(spec);
      
      // Update workflow phase if this is a new specification
      if (!refine) {
        await workflowManager.updateWorkflowPhase('planning');
      }

      const specFilePath = await workflowManager.getFilePath('spec.md');

      contextLogger.info('Specification generated successfully', {
        correlationId,
        specTitle: spec.title,
        requirementsCount: spec.requirements.length,
        filePath: specFilePath
      });

      return {
        success: true,
        data: spec,
        filePath: specFilePath,
        metadata: {
          executionTime: 0, // Will be filled by server
          timestamp: new Date(),
          version: '1.0.0'
        }
      };

    } catch (error) {
      contextLogger.error('Specify tool execution failed', {
        correlationId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: `Failed to generate specification: ${error instanceof Error ? error.message : String(error)}`,
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

// Helper function to parse LLM response into specification artifact
async function parseSpecificationFromLLM(
  llmResponse: string, 
  context: {
    description: string;
    technology: string;
    style?: string;
    scrapedContext?: any;
  }
): Promise<SpecificationArtifact> {
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(llmResponse);
    
    return {
      title: parsed.title || extractTitle(context.description),
      description: parsed.description || parsed.overview || context.description,
      requirements: Array.isArray(parsed.requirements) ? parsed.requirements :
                   Array.isArray(parsed.functionalRequirements) ? parsed.functionalRequirements :
                   extractRequirements(llmResponse),
      constraints: Array.isArray(parsed.constraints) ? parsed.constraints :
                  Array.isArray(parsed.technicalConstraints) ? parsed.technicalConstraints :
                  extractConstraints(llmResponse),
      scrapedContext: context.scrapedContext,
      style: context.style,
      technology: context.technology
    };
  } catch (parseError) {
    // Fallback: extract information from text response
    logger.warn('Failed to parse LLM response as JSON, extracting from text', { parseError });
    
    return {
      title: extractTitle(context.description),
      description: context.description,
      requirements: extractRequirements(llmResponse),
      constraints: extractConstraints(llmResponse),
      scrapedContext: context.scrapedContext,
      style: context.style,
      technology: context.technology
    };
  }
}

function extractTitle(description: string): string {
  // Extract a reasonable title from the description
  const words = description.split(/\s+/).slice(0, 6);
  return words.join(' ').replace(/[^\w\s-]/g, '').trim() || 'Project Specification';
}

function extractRequirements(text: string): string[] {
  const requirements: string[] = [];
  
  // Look for numbered lists or bullet points
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Match numbered requirements (1. , 2. , etc.)
    const numberedMatch = trimmed.match(/^\d+\.\s*(.+)$/);
    if (numberedMatch) {
      requirements.push(numberedMatch[1].trim());
      continue;
    }
    
    // Match bullet points (- , * , etc.)
    const bulletMatch = trimmed.match(/^[-*•]\s*(.+)$/);
    if (bulletMatch) {
      requirements.push(bulletMatch[1].trim());
      continue;
    }
    
    // Match requirements sections
    if (trimmed.toLowerCase().includes('requirement') && trimmed.includes(':')) {
      const reqMatch = trimmed.match(/:\s*(.+)$/);
      if (reqMatch) {
        requirements.push(reqMatch[1].trim());
      }
    }
  }
  
  // If no structured requirements found, create generic ones
  if (requirements.length === 0) {
    requirements.push('Implement core functionality as described');
    requirements.push('Ensure responsive design and cross-browser compatibility');
    requirements.push('Optimize for performance and accessibility');
  }
  
  return requirements.slice(0, 20); // Limit to reasonable number
}

function extractConstraints(text: string): string[] {
  const constraints: string[] = [];
  
  // Look for constraint-related keywords
  const constraintKeywords = ['constraint', 'limitation', 'requirement', 'must use', 'technology'];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    
    if (constraintKeywords.some(keyword => trimmed.includes(keyword))) {
      // Clean up and add the constraint
      const cleaned = line.trim().replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '');
      if (cleaned.length > 10) {
        constraints.push(cleaned);
      }
    }
  }
  
  // Add default technical constraints if none found
  if (constraints.length === 0) {
    constraints.push('Use modern web technologies and best practices');
    constraints.push('Ensure code maintainability and documentation');
    constraints.push('Follow security and performance guidelines');
  }
  
  return constraints.slice(0, 10); // Limit to reasonable number
}