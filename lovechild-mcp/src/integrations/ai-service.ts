import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { groq } from '@ai-sdk/groq';
import { logger } from '../core/logger.js';
import { configManager } from '../core/config.js';
import { 
  LoveChildError,
  SpecificationArtifact,
  PlanArtifact
} from '../types/index.js';

export interface GeneratedFile {
  filePath: string;
  content: string;
}

export interface CodeGenerationResult {
  files: GeneratedFile[];
  dependencies: string[];
  devDependencies: string[];
  commands: string[];
  projectStructure: string;
  summary: string;
}

export interface CodeGenerationOptions {
  projectType: 'landing-page' | 'dashboard' | 'webapp' | 'component-library';
  complexity: 'simple' | 'medium' | 'complex';
  style: 'minimal' | 'modern' | 'glassmorphism' | 'brutalism';
  features?: string[];
  constraints?: string[];
  customInstructions?: string;
}

export class AIService {
  private correlationId: string;
  private initialized = false;

  constructor(correlationId?: string) {
    this.correlationId = correlationId || 'ai-service';
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const config = configManager.getConfig();
    const hasProvider = config.ai.providers.anthropic?.apiKey || 
                       config.ai.providers.openai?.apiKey || 
                       config.ai.providers.groq?.apiKey;

    if (!hasProvider) {
      throw new LoveChildError(
        'No AI provider configured. Please set at least one API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY).',
        'AI_NOT_CONFIGURED'
      );
    }

    this.initialized = true;
    logger.info('AI service initialized', {
      correlationId: this.correlationId,
      defaultProvider: config.ai.defaultProvider,
      availableProviders: Object.keys(config.ai.providers).filter(p => config.ai.providers[p as keyof typeof config.ai.providers]?.apiKey)
    });
  }

  private getProvider() {
    const config = configManager.getConfig();
    const provider = config.ai.defaultProvider;

    switch (provider) {
      case 'anthropic':
        if (!config.ai.providers.anthropic?.apiKey) {
          throw new LoveChildError('Anthropic API key not configured', 'ANTHROPIC_NOT_CONFIGURED');
        }
        return anthropic('claude-3-5-sonnet-20241022');
      
      case 'openai':
        if (!config.ai.providers.openai?.apiKey) {
          throw new LoveChildError('OpenAI API key not configured', 'OPENAI_NOT_CONFIGURED');
        }
        return openai('gpt-4o');
      
      case 'groq':
        if (!config.ai.providers.groq?.apiKey) {
          throw new LoveChildError('Groq API key not configured', 'GROQ_NOT_CONFIGURED');
        }
        return groq('llama-3.1-70b-versatile');
      
      default:
        throw new LoveChildError(`Unsupported AI provider: ${provider}`, 'UNSUPPORTED_AI_PROVIDER');
    }
  }

  private buildSystemPrompt(): string {
    return `You are a senior full-stack developer specializing in React/TypeScript applications with modern tooling. Your expertise includes:

- React 18+ with hooks and modern patterns
- TypeScript with strict typing
- Vite for build tooling and development
- Tailwind CSS for styling
- Modern npm package ecosystem
- Clean code architecture and best practices

Generate complete, production-ready code that follows these principles:
- Type safety with proper TypeScript interfaces
- Component composition and reusability
- Responsive design with Tailwind CSS
- Accessibility best practices
- Performance optimization
- Clean file organization

CRITICAL OUTPUT FORMAT:
You must respond with a JSON object containing exactly these fields:

{
  "files": [
    {
      "filePath": "src/components/Example.tsx",
      "content": "// Complete file content here"
    }
  ],
  "dependencies": ["react-router-dom", "lucide-react"],
  "devDependencies": ["@types/node"],
  "commands": ["npm install", "npm run dev"],
  "projectStructure": "Description of folder structure",
  "summary": "Brief summary of what was generated"
}

Use semantic file paths (src/components/, src/pages/, src/types/, src/hooks/, src/utils/).
Only include dependencies actually used in the generated code.
Ensure all imports resolve correctly.
Write clean, documented, production-ready code.`;
  }

  private buildUserPrompt(
    specification: SpecificationArtifact,
    plan?: PlanArtifact,
    options: CodeGenerationOptions = { projectType: 'webapp', complexity: 'medium', style: 'modern' }
  ): string {
    const { projectType, complexity, style, features, constraints, customInstructions } = options;

    let prompt = `Generate a ${complexity} ${projectType} React/TypeScript application using Vite and Tailwind CSS.

PROJECT SPECIFICATION:
Title: ${specification.title}
Description: ${specification.description}
Style: ${style}
Technology: ${specification.technology}

REQUIREMENTS:
${specification.requirements.map(req => `- ${req}`).join('\n')}

CONSTRAINTS:
${specification.constraints.map(constraint => `- ${constraint}`).join('\n')}`;

    if (specification.scrapedContext) {
      prompt += `\n\nINSPIRATION CONTEXT:
Reference URL: ${specification.scrapedContext.url}
Use this as inspiration for design and functionality (adapt, don't copy exactly):
${specification.scrapedContext.content.slice(0, 2000)}...`;
    }

    if (plan) {
      prompt += `\n\nTECH STACK:
${plan.techStack.join(', ')}

ARCHITECTURE: ${plan.architecture}

FEATURES:
${plan.features.map(feature => `- ${feature}`).join('\n')}`;
    }

    if (features && features.length > 0) {
      prompt += `\n\nADDITIONAL FEATURES:
${features.map(feature => `- ${feature}`).join('\n')}`;
    }

    if (constraints && constraints.length > 0) {
      prompt += `\n\nADDITIONAL CONSTRAINTS:
${constraints.map(constraint => `- ${constraint}`).join('\n')}`;
    }

    if (customInstructions) {
      prompt += `\n\nCUSTOM INSTRUCTIONS:
${customInstructions}`;
    }

    prompt += `\n\nGenerate a complete, working application with:
- Main App component with routing if needed
- All necessary components and pages
- TypeScript interfaces for data structures  
- Proper Tailwind CSS styling with ${style} aesthetic
- Responsive design for mobile and desktop
- Proper error boundaries and loading states
- Clean, maintainable code structure

Focus on ${projectType} patterns and ${complexity} functionality level.`;

    return prompt;
  }

  async generateCode(
    specification: SpecificationArtifact,
    plan?: PlanArtifact,
    options?: CodeGenerationOptions
  ): Promise<CodeGenerationResult> {
    await this.initialize();

    const timer = logger.startTimer('ai-code-generation');
    
    try {
      logger.info('Starting AI code generation', {
        correlationId: this.correlationId,
        title: specification.title,
        projectType: options?.projectType || 'webapp',
        complexity: options?.complexity || 'medium',
        style: options?.style || 'modern'
      });

      const provider = this.getProvider();
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(specification, plan, options);

      const { text } = await generateText({
        model: provider,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        maxOutputTokens: 8192
      });

      // Parse the structured JSON response
      let result: CodeGenerationResult;
      try {
        // Extract JSON from response (handle potential markdown formatting)
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
        const jsonText = jsonMatch[1] || text;
        
        const parsed = JSON.parse(jsonText.trim());
        
        // Validate the structure
        if (!parsed.files || !Array.isArray(parsed.files)) {
          throw new Error('Invalid response structure: missing files array');
        }

        result = {
          files: parsed.files,
          dependencies: parsed.dependencies || [],
          devDependencies: parsed.devDependencies || [],
          commands: parsed.commands || ['npm install', 'npm run dev'],
          projectStructure: parsed.projectStructure || 'Standard React/Vite project structure',
          summary: parsed.summary || 'Generated React/TypeScript application'
        };

        // Validate each file has required fields
        for (const file of result.files) {
          if (!file.filePath || !file.content) {
            throw new Error(`Invalid file structure: missing filePath or content`);
          }
        }

      } catch (parseError) {
        logger.error('Failed to parse AI response as JSON', {
          correlationId: this.correlationId,
          error: parseError instanceof Error ? parseError.message : String(parseError),
          responseLength: text.length,
          responsePreview: text.slice(0, 500)
        });
        
        throw new LoveChildError(
          'AI generated invalid response format. Expected structured JSON with files array.',
          'AI_INVALID_RESPONSE',
          parseError
        );
      }

      const executionTime = timer();
      logger.info('AI code generation completed', {
        correlationId: this.correlationId,
        title: specification.title,
        filesGenerated: result.files.length,
        dependencies: result.dependencies.length,
        executionTime
      });

      return result;

    } catch (error) {
      const executionTime = timer();
      logger.error('AI code generation failed', {
        correlationId: this.correlationId,
        title: specification.title,
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new LoveChildError(
        `AI code generation failed: ${error instanceof Error ? error.message : String(error)}`,
        'AI_GENERATION_FAILED',
        error
      );
    }
  }

  async validateGeneratedCode(files: GeneratedFile[]): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      logger.info('Validating generated code', {
        correlationId: this.correlationId,
        fileCount: files.length
      });

      // Basic file validation
      for (const file of files) {
        // Check for common syntax issues
        if (file.filePath.endsWith('.tsx') || file.filePath.endsWith('.ts')) {
          // Basic TypeScript validation
          if (!file.content.trim()) {
            errors.push(`Empty file: ${file.filePath}`);
            continue;
          }

          // Check for unclosed brackets/braces
          const openBraces = (file.content.match(/\{/g) || []).length;
          const closeBraces = (file.content.match(/\}/g) || []).length;
          if (openBraces !== closeBraces) {
            errors.push(`Mismatched braces in ${file.filePath}`);
          }

          // Check for imports without proper quotes
          const badImports = file.content.match(/import.*from\s+[^'"]/);
          if (badImports) {
            errors.push(`Invalid import syntax in ${file.filePath}`);
          }

          // Check for React components without proper export
          if (file.filePath.includes('components/') && !file.content.includes('export')) {
            warnings.push(`Component ${file.filePath} may be missing export`);
          }
        }

        // Check for proper file extensions
        if (!file.filePath.match(/\.(tsx?|jsx?|css|json|md)$/)) {
          warnings.push(`Unusual file extension: ${file.filePath}`);
        }
      }

      // Check for essential files
      const hasAppFile = files.some(f => f.filePath.includes('App.tsx') || f.filePath.includes('main.tsx'));
      if (!hasAppFile) {
        warnings.push('No main App component or entry point found');
      }

      const valid = errors.length === 0;

      logger.info('Code validation completed', {
        correlationId: this.correlationId,
        valid,
        errorCount: errors.length,
        warningCount: warnings.length
      });

      return { valid, errors, warnings };

    } catch (error) {
      logger.error('Code validation failed', {
        correlationId: this.correlationId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        valid: false,
        errors: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
        warnings
      };
    }
  }

  async extractDependencies(files: GeneratedFile[]): Promise<{
    dependencies: string[];
    devDependencies: string[];
  }> {
    const dependencies = new Set<string>();
    const devDependencies = new Set<string>();

    try {
      logger.info('Extracting dependencies from generated code', {
        correlationId: this.correlationId,
        fileCount: files.length
      });

      for (const file of files) {
        if (file.filePath.endsWith('.tsx') || file.filePath.endsWith('.ts') || file.filePath.endsWith('.jsx') || file.filePath.endsWith('.js')) {
          // Extract import statements
          const importMatches = file.content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
          
          for (const match of importMatches) {
            const importPath = match[1];
            
            // Skip relative imports
            if (importPath.startsWith('.') || importPath.startsWith('/')) {
              continue;
            }

            // Extract package name (handle scoped packages)
            let packageName = importPath;
            if (importPath.startsWith('@')) {
              const parts = importPath.split('/');
              packageName = parts.slice(0, 2).join('/'); // @scope/package
            } else {
              packageName = importPath.split('/')[0]; // package
            }

            // Categorize dependencies
            if (packageName.startsWith('@types/') || 
                packageName.includes('eslint') || 
                packageName.includes('prettier') ||
                packageName.includes('vitest') ||
                packageName.includes('typescript')) {
              devDependencies.add(packageName);
            } else {
              dependencies.add(packageName);
            }
          }
        }
      }

      // Add essential React dependencies if not present
      if (files.some(f => f.content.includes('React') || f.filePath.endsWith('.tsx'))) {
        dependencies.add('react');
        dependencies.add('react-dom');
        devDependencies.add('@types/react');
        devDependencies.add('@types/react-dom');
      }

      const result = {
        dependencies: Array.from(dependencies).sort(),
        devDependencies: Array.from(devDependencies).sort()
      };

      logger.info('Dependency extraction completed', {
        correlationId: this.correlationId,
        dependencies: result.dependencies.length,
        devDependencies: result.devDependencies.length
      });

      return result;

    } catch (error) {
      logger.error('Dependency extraction failed', {
        correlationId: this.correlationId,
        error: error instanceof Error ? error.message : String(error)
      });

      return { dependencies: [], devDependencies: [] };
    }
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy', details: any }> {
    const details: any = {
      initialized: this.initialized,
      timestamp: new Date().toISOString()
    };

    try {
      const config = configManager.getConfig();
      details.defaultProvider = config.ai.defaultProvider;
      details.availableProviders = Object.keys(config.ai.providers).filter(
        p => config.ai.providers[p as keyof typeof config.ai.providers]?.apiKey
      );

      if (details.availableProviders.length === 0) {
        details.error = 'No AI providers configured';
        return { status: 'unhealthy', details };
      }

      logger.info('AI service health check passed', {
        correlationId: this.correlationId,
        details
      });

      return { status: 'healthy', details };

    } catch (error) {
      details.error = error instanceof Error ? error.message : String(error);
      
      logger.warn('AI service health check failed', {
        correlationId: this.correlationId,
        details
      });

      return { status: 'unhealthy', details };
    }
  }
}

// Factory function for creating service instances
export function createAIService(correlationId?: string): AIService {
  return new AIService(correlationId);
}