import { ToolDefinition, ToolContext } from '../../core/tool-registry.js';
import { TasksToolSchema, TasksInput, TasksResponse, TaskArtifact } from '../../types/index.js';
import { createWarpLLMService } from '../../integrations/warp-llm-service.js';
import { nanoid } from 'nanoid';
import { logger } from '../../core/logger.js';

export const TasksTool: ToolDefinition = {
  name: 'tasks',
  description: 'Break down technical plans into executable tasks with dependencies, priorities, and acceptance criteria using SpecKit methodology.',
  schema: TasksToolSchema,
  handler: async (args: TasksInput, context: ToolContext): Promise<TasksResponse> => {
    const { granularity, includeTests, priority } = args;
    const { correlationId, workflowManager, logger: contextLogger } = context;
    
    contextLogger.info('Starting tasks tool execution', {
      correlationId,
      granularity,
      includeTests,
      priority
    });

    try {
      // Get current workflow and ensure plan exists
      const workflow = await workflowManager.getCurrentWorkflow();
      if (!workflow) {
        throw new Error('No active workflow found. Run /specify and /plan first.');
      }

      if (!workflow.artifacts.plan) {
        throw new Error('No plan found in workflow. Run /plan first to create a technical plan.');
      }

      const plan = workflow.artifacts.plan;
      const spec = workflow.artifacts.spec;
      
      // Generate task breakdown using Warp LLM service
      const warpLLM = createWarpLLMService(correlationId);
      
      const tasksPrompt = `You are a senior project manager breaking down a technical plan into executable tasks for a development team.

## Project Context
${spec ? `**Project**: ${spec.title}\n**Description**: ${spec.description}\n` : ''}

## Technical Plan
**Architecture**: ${plan.architecture}
**Technology Stack**: ${plan.techStack.join(', ')}
**Key Features**: ${plan.features.join(', ')}

**Milestones**:
${plan.milestones.map((milestone: any, i: number) => `${i + 1}. ${milestone.name} - ${milestone.description} (${milestone.estimatedHours}h)`).join('\n')}

**Identified Risks**: ${plan.risks.join(', ')}

## Task Breakdown Requirements
**Granularity**: ${granularity} (${getGranularityDescription(granularity)})
**Include Tests**: ${includeTests ? 'Yes - include testing tasks' : 'No - focus on implementation only'}
**Priority Focus**: ${priority} - prioritize ${getPriorityDescription(priority)}

## Instructions
Break down this technical plan into specific, actionable tasks that include:

1. **Task ID & Title** - Unique identifier and clear, descriptive title
2. **Description** - Detailed description of what needs to be accomplished
3. **Priority** - High, Medium, or Low based on the priority focus
4. **Dependencies** - Other tasks that must be completed first
5. **Acceptance Criteria** - Specific, measurable criteria for task completion
6. **Estimated Hours** - Realistic time estimate for completion
7. **Category** - Type of work (setup, development, testing, deployment, etc.)

Focus on:
- Clear, actionable task descriptions
- Realistic time estimates and dependencies
- Specific acceptance criteria that can be verified
- Logical task sequencing and dependency management
${includeTests ? '- Comprehensive testing coverage for all features' : ''}
- ${getPriorityGuidance(priority)}

Provide tasks in order of execution, considering dependencies and priorities.`;

      const llmResponse = await warpLLM.generateTaskBreakdown(
        tasksPrompt,
        granularity
      );

      // Parse the AI response and create task artifacts
      const tasks = await parseTasksFromLLM(llmResponse, {
        granularity,
        includeTests,
        priority,
        plan,
        spec
      });

      // Update workflow phase and save tasks
      await workflowManager.setTasks(tasks);
      await workflowManager.updateWorkflowPhase('implementation');

      const tasksFilePath = await workflowManager.getFilePath('tasks.md');

      contextLogger.info('Task breakdown generated successfully', {
        correlationId,
        taskCount: tasks.length,
        granularity,
        highPriorityTasks: tasks.filter(t => t.priority === 'high').length,
        totalEstimatedHours: tasks.reduce((sum, t) => sum + t.estimatedHours, 0),
        filePath: tasksFilePath
      });

      return {
        success: true,
        data: tasks,
        filePath: tasksFilePath,
        metadata: {
          executionTime: 0,
          timestamp: new Date(),
          version: '1.0.0'
        }
      };

    } catch (error) {
      contextLogger.error('Tasks tool execution failed', {
        correlationId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: `Failed to generate tasks: ${error instanceof Error ? error.message : String(error)}`,
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

function getGranularityDescription(granularity: string): string {
  switch (granularity) {
    case 'high': return '5-15 high-level tasks focusing on major milestones';
    case 'medium': return '15-30 medium-granularity tasks with clear deliverables';
    case 'detailed': return '30+ detailed tasks with specific implementation steps';
    default: return 'medium-granularity tasks';
  }
}

function getPriorityDescription(priority: string): string {
  switch (priority) {
    case 'feature': return 'feature development and core functionality';
    case 'performance': return 'performance optimization and scalability';
    case 'polish': return 'UI/UX refinement and quality improvements';
    default: return 'feature development';
  }
}

function getPriorityGuidance(priority: string): string {
  switch (priority) {
    case 'feature': return 'Prioritize tasks that deliver user-facing functionality and core features';
    case 'performance': return 'Prioritize tasks that improve system performance, scalability, and efficiency';
    case 'polish': return 'Prioritize tasks that enhance user experience, design, and quality';
    default: return 'Balance feature development with technical quality';
  }
}

async function parseTasksFromLLM(
  llmResponse: string,
  context: {
    granularity: string;
    includeTests: boolean;
    priority: string;
    plan: any;
    spec: any;
  }
): Promise<TaskArtifact[]> {
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(llmResponse);
    if (Array.isArray(parsed) || Array.isArray(parsed.tasks)) {
      const taskArray = Array.isArray(parsed) ? parsed : parsed.tasks;
      return taskArray.map((task: any) => normalizeTask(task));
    }
  } catch (parseError) {
    logger.warn('Failed to parse LLM response as JSON, extracting from text', { parseError });
  }

  // Fallback: extract tasks from text response
  return extractTasksFromText(llmResponse, context);
}

function normalizeTask(rawTask: any): TaskArtifact {
  return {
    id: rawTask.id || generateTaskId(rawTask.title || 'Task'),
    title: rawTask.title || rawTask.name || 'Untitled Task',
    description: rawTask.description || rawTask.desc || 'Task description not provided',
    status: 'pending',
    priority: normalizePriority(rawTask.priority),
    dependencies: Array.isArray(rawTask.dependencies) ? rawTask.dependencies : 
                  Array.isArray(rawTask.deps) ? rawTask.deps :
                  typeof rawTask.dependencies === 'string' ? [rawTask.dependencies] : [],
    testCriteria: Array.isArray(rawTask.testCriteria) ? rawTask.testCriteria :
                  Array.isArray(rawTask.acceptance) ? rawTask.acceptance :
                  Array.isArray(rawTask.acceptanceCriteria) ? rawTask.acceptanceCriteria :
                  extractTestCriteria(rawTask.description || ''),
    estimatedHours: parseInt(rawTask.estimatedHours) || parseInt(rawTask.hours) || 
                   parseInt(rawTask.estimate) || estimateHours(rawTask.title || ''),
    assignee: rawTask.assignee || undefined
  };
}

function normalizePriority(priority: any): 'low' | 'medium' | 'high' {
  if (typeof priority !== 'string') return 'medium';
  
  const p = priority.toLowerCase();
  if (p.includes('high') || p.includes('critical') || p.includes('urgent')) return 'high';
  if (p.includes('low') || p.includes('minor') || p.includes('nice')) return 'low';
  return 'medium';
}

function generateTaskId(title: string): string {
  const prefix = title.split(' ').slice(0, 2).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `${prefix}-${nanoid(6)}`;
}

function extractTestCriteria(description: string): string[] {
  const criteria: string[] = [];
  
  // Look for acceptance criteria patterns
  const lines = description.split('\n');
  for (const line of lines) {
    if (line.toLowerCase().includes('accept') || line.toLowerCase().includes('criteria')) {
      const match = line.match(/:\s*(.+)$/);
      if (match) {
        criteria.push(match[1].trim());
      }
    }
  }
  
  // Default criteria if none found
  if (criteria.length === 0) {
    criteria.push('Task implementation is complete and functional');
    criteria.push('Code is tested and documented');
    criteria.push('Implementation meets requirements');
  }
  
  return criteria.slice(0, 5);
}

function estimateHours(title: string): number {
  // Simple estimation based on task type keywords
  const t = title.toLowerCase();
  
  if (t.includes('setup') || t.includes('config')) return 4;
  if (t.includes('test') || t.includes('debug')) return 6;
  if (t.includes('design') || t.includes('ui')) return 8;
  if (t.includes('implement') || t.includes('develop')) return 12;
  if (t.includes('integrate') || t.includes('deploy')) return 16;
  if (t.includes('architecture') || t.includes('refactor')) return 20;
  
  return 8; // Default estimate
}

function extractTasksFromText(text: string, context: any): TaskArtifact[] {
  const tasks: TaskArtifact[] = [];
  const lines = text.split('\n');
  
  let currentTask: Partial<TaskArtifact> | null = null;
  let taskCounter = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Look for task titles (numbered lists, headers, or bullet points)
    const taskTitleMatch = line.match(/^(?:\d+\.|\*|-|#+)\s*(.+?)(?:\s*\((\d+)h?\))?$/i);
    
    if (taskTitleMatch) {
      // Save previous task if exists
      if (currentTask && currentTask.title) {
        tasks.push(normalizeTask(currentTask));
      }
      
      // Start new task
      const title = taskTitleMatch[1].trim();
      const estimatedHours = taskTitleMatch[2] ? parseInt(taskTitleMatch[2]) : estimateHours(title);
      
      currentTask = {
        id: generateTaskId(title),
        title,
        description: '',
        priority: 'medium',
        estimatedHours,
        dependencies: [],
        testCriteria: []
      };
      
      // Look ahead for description
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (!nextLine || nextLine.match(/^(?:\d+\.|\*|-|#+)/)) break;
        
        if (nextLine.toLowerCase().includes('depend')) {
          const deps = nextLine.split(':')[1]?.split(',').map(s => s.trim()) || [];
          currentTask.dependencies = deps;
        } else if (nextLine.toLowerCase().includes('priority')) {
          const priority = nextLine.toLowerCase();
          currentTask.priority = priority.includes('high') ? 'high' : 
                               priority.includes('low') ? 'low' : 'medium';
        } else if (!currentTask.description) {
          currentTask.description = nextLine;
        }
      }
      
      taskCounter++;
    }
  }
  
  // Save final task
  if (currentTask && currentTask.title) {
    tasks.push(normalizeTask(currentTask));
  }
  
  // Generate default tasks if none found
  if (tasks.length === 0) {
    tasks.push(...generateDefaultTasks(context));
  }
  
  return tasks.slice(0, getMaxTasks(context.granularity));
}

function generateDefaultTasks(context: any): TaskArtifact[] {
  const baseTasks = [
    {
      title: 'Project Setup and Configuration',
      description: 'Initialize project structure, configure build tools, and set up development environment',
      priority: 'high' as const,
      estimatedHours: 8
    },
    {
      title: 'Core Architecture Implementation',
      description: 'Implement the main application architecture and core components',
      priority: 'high' as const,
      estimatedHours: 24,
      dependencies: ['Project Setup and Configuration']
    },
    {
      title: 'Feature Development',
      description: 'Implement primary features and functionality',
      priority: 'high' as const,
      estimatedHours: 40,
      dependencies: ['Core Architecture Implementation']
    },
    {
      title: 'Testing and Quality Assurance',
      description: 'Write tests, perform quality assurance, and fix bugs',
      priority: 'medium' as const,
      estimatedHours: 16,
      dependencies: ['Feature Development']
    },
    {
      title: 'Documentation and Deployment',
      description: 'Create documentation and deploy to production',
      priority: 'medium' as const,
      estimatedHours: 8,
      dependencies: ['Testing and Quality Assurance']
    }
  ];
  
  if (context.granularity === 'detailed') {
    // Add more detailed tasks
    baseTasks.splice(2, 0, 
      {
        title: 'UI Component Development',
        description: 'Create reusable UI components and layouts',
        priority: 'high' as const,
        estimatedHours: 20,
        dependencies: ['Core Architecture Implementation']
      },
      {
        title: 'API Integration',
        description: 'Implement API endpoints and data layer integration',
        priority: 'high' as const,
        estimatedHours: 16,
        dependencies: ['Core Architecture Implementation']
      }
    );
  }
  
  return baseTasks.map(task => ({
    id: generateTaskId(task.title),
    title: task.title,
    description: task.description,
    status: 'pending' as const,
    priority: task.priority,
    dependencies: task.dependencies || [],
    testCriteria: extractTestCriteria(task.description),
    estimatedHours: task.estimatedHours,
    assignee: undefined
  }));
}

function getMaxTasks(granularity: string): number {
  switch (granularity) {
    case 'high': return 15;
    case 'medium': return 30;
    case 'detailed': return 50;
    default: return 30;
  }
}