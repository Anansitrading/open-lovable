import { spawn, ChildProcess } from 'child_process';
import { logger } from '../core/logger.js';
import { configManager } from '../core/config.js';
import { AIProviderError } from '../types/index.js';

export interface WarpLLMOptions {
  model?: string;
  timeout?: number;
  maxRetries?: number;
  verbose?: boolean;
  workingDirectory?: string;
}

export interface WarpStreamOptions extends WarpLLMOptions {
  onChunk?: (chunk: string) => void;
  onError?: (error: string) => void;
  onComplete?: (output: string) => void;
}

export class WarpLLMService {
  private readonly defaultTimeout = 60000; // 60 seconds
  private readonly defaultMaxRetries = 3;
  private activeProcesses = new Set<ChildProcess>();

  constructor(private correlationId?: string) {}

  async generateResponse(prompt: string, options: WarpLLMOptions = {}): Promise<string> {
    const timer = logger.startTimer('warp-llm-generate');
    const startTime = Date.now();

    try {
      logger.aiRequest('warp-cli', options.model, { prompt: prompt.substring(0, 100) + '...' });
      
      const result = await this.executeWarpCommand(prompt, {
        ...options,
        streaming: false
      });
      
      const executionTime = timer();
      logger.info('Warp LLM generation completed', {
        correlationId: this.correlationId,
        executionTime,
        outputLength: result.length,
        model: options.model
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error('Warp LLM generation failed', {
        correlationId: this.correlationId,
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new AIProviderError(`Warp CLI generation failed: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  async streamResponse(prompt: string, options: WarpStreamOptions = {}): Promise<string> {
    const timer = logger.startTimer('warp-llm-stream');
    const streamLogger = logger.createStreamLogger('warp-llm', this.correlationId || 'unknown');
    
    try {
      logger.aiRequest('warp-cli-stream', options.model, { prompt: prompt.substring(0, 100) + '...' });
      
      const result = await this.executeWarpCommand(prompt, {
        ...options,
        streaming: true,
        onChunk: (chunk) => {
          streamLogger.chunk(chunk);
          options.onChunk?.(chunk);
        },
        onError: (error) => {
          streamLogger.error(error);
          options.onError?.(error);
        }
      });
      
      const executionTime = timer();
      streamLogger.complete(result.length, executionTime);
      options.onComplete?.(result);

      return result;
    } catch (error) {
      streamLogger.error(error);
      throw new AIProviderError(`Warp CLI streaming failed: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  private async executeWarpCommand(
    prompt: string, 
    options: WarpLLMOptions & { 
      streaming?: boolean; 
      onChunk?: (chunk: string) => void;
      onError?: (error: string) => void;
    } = {}
  ): Promise<string> {
    const config = configManager.getConfig();
    const timeout = options.timeout || this.defaultTimeout;
    const workingDir = options.workingDirectory || config.workspace.directory;
    
    // Build Warp command arguments
    const warpArgs = ['agent', 'run'];
    
    // Add agent mode
    warpArgs.push('--mode', 'agent');
    
    // Add model if specified
    if (options.model) {
      warpArgs.push('--model', options.model);
    }
    
    // Add verbose flag if requested
    if (options.verbose || configManager.isVerboseEnabled()) {
      warpArgs.push('--verbose');
    }
    
    // Add the prompt
    warpArgs.push('--prompt', prompt);

    return new Promise((resolve, reject) => {
      const childProcess = spawn('warp', warpArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: workingDir,
        env: {
          ...process.env,
          // Ensure Warp can access necessary environment
          HOME: process.env.HOME,
          PATH: process.env.PATH,
        }
      });

      this.activeProcesses.add(childProcess);
      
      let output = '';
      let errorOutput = '';
      let timeoutHandle: NodeJS.Timeout;

      // Set up timeout
      if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
          logger.warn('Warp CLI command timeout', {
            correlationId: this.correlationId,
            timeout,
            command: warpArgs.join(' ')
          });
          
          childProcess.kill('SIGTERM');
          
          // Force kill after grace period
          setTimeout(() => {
            if (!childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 5000);
          
          reject(new AIProviderError(`Warp CLI command timeout after ${timeout}ms`));
        }, timeout);
      }

      // Handle stdout (main output)
      childProcess.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        
        if (options.streaming && options.onChunk) {
          options.onChunk(chunk);
        }
      });

      // Handle stderr (errors and warnings)
      childProcess.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        errorOutput += chunk;
        
        // Log warnings but don't fail on them
        if (chunk.toLowerCase().includes('warn')) {
          logger.warn('Warp CLI warning', {
            correlationId: this.correlationId,
            warning: chunk.trim()
          });
        } else {
          logger.debug('Warp CLI stderr', {
            correlationId: this.correlationId,
            stderr: chunk.trim()
          });
        }
        
        if (options.streaming && options.onError) {
          options.onError(chunk);
        }
      });

      // Handle process completion
      childProcess.on('close', (code: number | null, signal: string | null) => {
        this.activeProcesses.delete(childProcess);
        
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        logger.debug('Warp CLI process completed', {
          correlationId: this.correlationId,
          exitCode: code,
          signal,
          outputLength: output.length,
          hasError: !!errorOutput
        });

        if (code === 0) {
          resolve(output.trim());
        } else {
          const errorMessage = errorOutput || `Process exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`;
          reject(new AIProviderError(`Warp CLI failed: ${errorMessage}`));
        }
      });

      // Handle process errors
      childProcess.on('error', (error: Error) => {
        this.activeProcesses.delete(childProcess);
        
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        logger.error('Warp CLI process error', {
          correlationId: this.correlationId,
          error: error.message,
          code: (error as any).code
        });

        if ((error as any).code === 'ENOENT') {
          reject(new AIProviderError('Warp CLI not found. Please ensure Warp is installed and accessible in PATH.'));
        } else {
          reject(new AIProviderError(`Warp CLI process error: ${error.message}`));
        }
      });
    });
  }

  // Specialized methods for SpecKit workflows
  async generateSpecification(requirements: string, context?: any): Promise<string> {
    const contextInfo = context ? `\n\nAdditional Context:\n${JSON.stringify(context, null, 2)}` : '';
    
    const prompt = `Generate a comprehensive software project specification in markdown format based on these requirements:

${requirements}${contextInfo}

Please create a well-structured specification that includes:

1. **Project Overview** - Clear description and goals
2. **Requirements** - Functional and non-functional requirements  
3. **User Stories** - Detailed user stories with acceptance criteria
4. **Technical Constraints** - Any technical limitations or requirements
5. **Success Criteria** - How to measure project success

Format the output as proper markdown with clear headings, bullet points, and structured content suitable for saving as spec.md.`;

    return this.generateResponse(prompt, { 
      model: 'claude-3.5-sonnet',
      timeout: 45000 // Longer timeout for spec generation
    });
  }

  async generateTechnicalPlan(specification: string, techStack: string[], architecture: string): Promise<string> {
    const prompt = `Based on this project specification, create a detailed technical implementation plan:

## Project Specification
${specification}

## Technology Stack
${techStack.join(', ')}

## Target Architecture
${architecture}

Please create a comprehensive technical plan that includes:

1. **Architecture Overview** - High-level system design
2. **Technology Decisions** - Rationale for chosen tech stack
3. **Implementation Phases** - Ordered development phases
4. **Milestones & Dependencies** - Key milestones with dependencies
5. **Risk Assessment** - Potential risks and mitigation strategies
6. **Deployment Strategy** - How the system will be deployed

Format the output as structured markdown suitable for saving as plan.md.`;

    return this.generateResponse(prompt, {
      model: 'claude-3.5-sonnet',
      timeout: 45000
    });
  }

  async generateTaskBreakdown(plan: string, granularity: 'high' | 'medium' | 'detailed' = 'medium'): Promise<string> {
    const granularityInstructions = {
      high: 'Create high-level tasks (5-15 tasks total) focusing on major milestones',
      medium: 'Create medium-granularity tasks (15-30 tasks) with clear deliverables',
      detailed: 'Create detailed tasks (30+ tasks) with specific implementation steps'
    };

    const prompt = `Based on this technical plan, create a structured task breakdown:

## Technical Plan
${plan}

## Task Granularity
${granularityInstructions[granularity]}

Please create a comprehensive task list that includes:

1. **Task ID & Title** - Unique identifier and descriptive title
2. **Description** - Clear description of what needs to be done
3. **Dependencies** - Prerequisites and dependent tasks
4. **Acceptance Criteria** - How to know the task is complete
5. **Estimated Effort** - Time estimation (hours/days)
6. **Priority** - Task priority (High/Medium/Low)

Format as a markdown table or structured list suitable for saving as tasks.md.`;

    return this.generateResponse(prompt, {
      model: 'claude-3.5-sonnet',
      timeout: 45000
    });
  }

  // Cleanup method for graceful shutdown
  cleanup(): void {
    logger.info('Cleaning up Warp LLM service', {
      correlationId: this.correlationId,
      activeProcesses: this.activeProcesses.size
    });

    this.activeProcesses.forEach(process => {
      if (!process.killed) {
        logger.debug('Terminating Warp CLI process', {
          correlationId: this.correlationId,
          pid: process.pid
        });
        
        process.kill('SIGTERM');
        
        // Force kill after grace period
        setTimeout(() => {
          if (!process.killed) {
            process.kill('SIGKILL');
          }
        }, 5000);
      }
    });

    this.activeProcesses.clear();
  }
}

// Factory function for creating service instances
export const createWarpLLMService = (correlationId?: string) => {
  return new WarpLLMService(correlationId);
};