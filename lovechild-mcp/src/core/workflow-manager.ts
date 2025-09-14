import fs from 'fs-extra';
import path from 'path';
import { nanoid } from 'nanoid';
import { logger } from './logger.js';
import { configManager } from './config.js';
import { WorkflowState, WorkflowPhase, SpecificationArtifact, PlanArtifact, TaskArtifact, SandboxInfo } from '../types/index.js';

export class WorkflowManager {
  private currentWorkflow: WorkflowState | null = null;
  private workspaceDir: string = './workspace';
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const config = configManager.getConfig();
      this.workspaceDir = config.workspace.directory;
      
      // Ensure workspace directory exists
      await fs.ensureDir(this.workspaceDir);
      
      // Try to load existing workflow state
      await this.loadExistingWorkflow();
      
      this.initialized = true;
      logger.info('Workflow manager initialized', {
        workspaceDir: this.workspaceDir,
        hasExistingWorkflow: !!this.currentWorkflow
      });
      
    } catch (error) {
      logger.error('Failed to initialize workflow manager', error);
      throw error;
    }
  }

  private async loadExistingWorkflow(): Promise<void> {
    try {
      const workflowStatePath = path.join(this.workspaceDir, 'workflow-state.json');
      
      if (await fs.pathExists(workflowStatePath)) {
        const workflowData = await fs.readJSON(workflowStatePath);
        this.currentWorkflow = {
          ...workflowData,
          metadata: {
            ...workflowData.metadata,
            createdAt: new Date(workflowData.metadata.createdAt),
            updatedAt: new Date(workflowData.metadata.updatedAt)
          }
        };
        
        logger.info('Loaded existing workflow', {
          workflowId: this.currentWorkflow.id,
          phase: this.currentWorkflow.phase,
          version: this.currentWorkflow.metadata.version
        });
      }
    } catch (error) {
      logger.warn('Failed to load existing workflow state', { error });
      // Continue without existing workflow
    }
  }

  async createNewWorkflow(description: string): Promise<WorkflowState> {
    const workflowId = nanoid();
    const now = new Date();
    
    const newWorkflow: WorkflowState = {
      id: workflowId,
      phase: 'specification',
      artifacts: {},
      metadata: {
        createdAt: now,
        updatedAt: now,
        version: 1
      }
    };

    this.currentWorkflow = newWorkflow;
    await this.saveWorkflowState();
    
    logger.info('Created new workflow', {
      workflowId,
      description: description.substring(0, 100)
    });
    
    logger.workflowStateChange('none', 'specification', workflowId);
    
    return newWorkflow;
  }

  async getCurrentWorkflow(): Promise<WorkflowState | null> {
    return this.currentWorkflow;
  }

  async updateWorkflowPhase(newPhase: WorkflowPhase): Promise<void> {
    if (!this.currentWorkflow) {
      throw new Error('No active workflow to update');
    }

    const oldPhase = this.currentWorkflow.phase;
    this.currentWorkflow.phase = newPhase;
    this.currentWorkflow.metadata.updatedAt = new Date();
    this.currentWorkflow.metadata.version += 1;

    await this.saveWorkflowState();
    
    logger.workflowStateChange(oldPhase, newPhase, this.currentWorkflow.id);
  }

  async setSpecification(spec: SpecificationArtifact): Promise<void> {
    if (!this.currentWorkflow) {
      throw new Error('No active workflow');
    }

    this.currentWorkflow.artifacts.spec = spec;
    this.currentWorkflow.metadata.updatedAt = new Date();
    this.currentWorkflow.metadata.version += 1;

    // Write spec.md file
    const specPath = path.join(this.workspaceDir, 'spec.md');
    await this.writeSpecificationToMarkdown(spec, specPath);

    await this.saveWorkflowState();
    
    logger.info('Specification updated', {
      workflowId: this.currentWorkflow.id,
      specTitle: spec.title
    });
  }

  async setPlan(plan: PlanArtifact): Promise<void> {
    if (!this.currentWorkflow) {
      throw new Error('No active workflow');
    }

    this.currentWorkflow.artifacts.plan = plan;
    this.currentWorkflow.metadata.updatedAt = new Date();
    this.currentWorkflow.metadata.version += 1;

    // Write plan.md file
    const planPath = path.join(this.workspaceDir, 'plan.md');
    await this.writePlanToMarkdown(plan, planPath);

    await this.saveWorkflowState();
    
    logger.info('Plan updated', {
      workflowId: this.currentWorkflow.id,
      architecture: plan.architecture,
      milestones: plan.milestones.length
    });
  }

  async setTasks(tasks: TaskArtifact[]): Promise<void> {
    if (!this.currentWorkflow) {
      throw new Error('No active workflow');
    }

    this.currentWorkflow.artifacts.tasks = tasks;
    this.currentWorkflow.metadata.updatedAt = new Date();
    this.currentWorkflow.metadata.version += 1;

    // Write tasks.md file
    const tasksPath = path.join(this.workspaceDir, 'tasks.md');
    await this.writeTasksToMarkdown(tasks, tasksPath);

    await this.saveWorkflowState();
    
    logger.info('Tasks updated', {
      workflowId: this.currentWorkflow.id,
      taskCount: tasks.length
    });
  }

  async setSandboxInfo(sandboxInfo: SandboxInfo): Promise<void> {
    if (!this.currentWorkflow) {
      throw new Error('No active workflow');
    }

    this.currentWorkflow.sandbox = sandboxInfo;
    this.currentWorkflow.metadata.updatedAt = new Date();
    this.currentWorkflow.metadata.version += 1;

    await this.saveWorkflowState();
    
    logger.sandboxOperation('linked', sandboxInfo.sandboxId, {
      workflowId: this.currentWorkflow.id,
      provider: sandboxInfo.provider,
      url: sandboxInfo.url
    });
  }

  private async writeSpecificationToMarkdown(spec: SpecificationArtifact, filePath: string): Promise<void> {
    const markdown = this.generateSpecMarkdown(spec);
    await fs.writeFile(filePath, markdown, 'utf8');
  }

  private generateSpecMarkdown(spec: SpecificationArtifact): string {
    let markdown = `# ${spec.title}\n\n`;
    
    markdown += `## Project Overview\n\n${spec.description}\n\n`;
    
    if (spec.requirements.length > 0) {
      markdown += `## Requirements\n\n`;
      spec.requirements.forEach((req, index) => {
        markdown += `${index + 1}. ${req}\n`;
      });
      markdown += '\n';
    }
    
    if (spec.constraints.length > 0) {
      markdown += `## Technical Constraints\n\n`;
      spec.constraints.forEach((constraint, index) => {
        markdown += `${index + 1}. ${constraint}\n`;
      });
      markdown += '\n';
    }
    
    if (spec.scrapedContext) {
      markdown += `## Source Context\n\n`;
      markdown += `**Source URL:** ${spec.scrapedContext.url}\n`;
      markdown += `**Scraped:** ${spec.scrapedContext.timestamp.toISOString()}\n\n`;
      markdown += '```\n' + spec.scrapedContext.content + '\n```\n\n';
    }
    
    if (spec.technology) {
      markdown += `## Technology Stack\n\n${spec.technology}\n\n`;
    }
    
    if (spec.style) {
      markdown += `## Design Style\n\n${spec.style}\n\n`;
    }
    
    markdown += `---\n*Generated on ${new Date().toISOString()}*\n`;
    
    return markdown;
  }

  private async writePlanToMarkdown(plan: PlanArtifact, filePath: string): Promise<void> {
    const markdown = this.generatePlanMarkdown(plan);
    await fs.writeFile(filePath, markdown, 'utf8');
  }

  private generatePlanMarkdown(plan: PlanArtifact): string {
    let markdown = `# Technical Implementation Plan\n\n`;
    
    markdown += `## Architecture\n\n${plan.architecture}\n\n`;
    
    markdown += `## Technology Stack\n\n`;
    plan.techStack.forEach(tech => {
      markdown += `- ${tech}\n`;
    });
    markdown += '\n';
    
    if (plan.features.length > 0) {
      markdown += `## Key Features\n\n`;
      plan.features.forEach(feature => {
        markdown += `- ${feature}\n`;
      });
      markdown += '\n';
    }
    
    if (plan.milestones.length > 0) {
      markdown += `## Implementation Milestones\n\n`;
      plan.milestones.forEach((milestone, index) => {
        markdown += `### ${index + 1}. ${milestone.name}\n\n`;
        markdown += `${milestone.description}\n\n`;
        
        if (milestone.dependencies.length > 0) {
          markdown += `**Dependencies:** ${milestone.dependencies.join(', ')}\n`;
        }
        
        markdown += `**Estimated Hours:** ${milestone.estimatedHours}\n\n`;
      });
    }
    
    if (plan.risks.length > 0) {
      markdown += `## Risk Assessment\n\n`;
      plan.risks.forEach((risk, index) => {
        markdown += `${index + 1}. ${risk}\n`;
      });
      markdown += '\n';
    }
    
    markdown += `---\n*Generated on ${new Date().toISOString()}*\n`;
    
    return markdown;
  }

  private async writeTasksToMarkdown(tasks: TaskArtifact[], filePath: string): Promise<void> {
    const markdown = this.generateTasksMarkdown(tasks);
    await fs.writeFile(filePath, markdown, 'utf8');
  }

  private generateTasksMarkdown(tasks: TaskArtifact[]): string {
    let markdown = `# Project Tasks\n\n`;
    
    markdown += `| ID | Title | Status | Priority | Est. Hours | Dependencies |\n`;
    markdown += `|----|-------|--------|----------|------------|-------------|\n`;
    
    tasks.forEach(task => {
      const deps = task.dependencies.length > 0 ? task.dependencies.join(', ') : 'None';
      markdown += `| ${task.id} | ${task.title} | ${task.status} | ${task.priority} | ${task.estimatedHours} | ${deps} |\n`;
    });
    
    markdown += '\n## Task Details\n\n';
    
    tasks.forEach(task => {
      markdown += `### ${task.id}: ${task.title}\n\n`;
      markdown += `**Status:** ${task.status}  \n`;
      markdown += `**Priority:** ${task.priority}  \n`;
      markdown += `**Estimated Hours:** ${task.estimatedHours}  \n`;
      
      if (task.assignee) {
        markdown += `**Assignee:** ${task.assignee}  \n`;
      }
      
      markdown += `\n**Description:**  \n${task.description}\n\n`;
      
      if (task.dependencies.length > 0) {
        markdown += `**Dependencies:**  \n`;
        task.dependencies.forEach(dep => {
          markdown += `- ${dep}\n`;
        });
        markdown += '\n';
      }
      
      if (task.testCriteria.length > 0) {
        markdown += `**Acceptance Criteria:**  \n`;
        task.testCriteria.forEach(criteria => {
          markdown += `- ${criteria}\n`;
        });
        markdown += '\n';
      }
      
      markdown += '---\n\n';
    });
    
    markdown += `*Generated on ${new Date().toISOString()}*\n`;
    
    return markdown;
  }

  private async saveWorkflowState(): Promise<void> {
    if (!this.currentWorkflow) {
      return;
    }

    try {
      const workflowStatePath = path.join(this.workspaceDir, 'workflow-state.json');
      await fs.writeJSON(workflowStatePath, this.currentWorkflow, { spaces: 2 });
    } catch (error) {
      logger.error('Failed to save workflow state', {
        workflowId: this.currentWorkflow.id,
        error
      });
      throw error;
    }
  }

  async getStatus(): Promise<{
    hasActiveWorkflow: boolean;
    currentPhase?: WorkflowPhase;
    workflowId?: string;
    artifactsPresent: {
      spec: boolean;
      plan: boolean;
      tasks: boolean;
    };
    sandboxInfo?: SandboxInfo;
    version?: number;
    lastUpdated?: string;
  }> {
    if (!this.currentWorkflow) {
      return {
        hasActiveWorkflow: false,
        artifactsPresent: {
          spec: false,
          plan: false,
          tasks: false
        }
      };
    }

    return {
      hasActiveWorkflow: true,
      currentPhase: this.currentWorkflow.phase,
      workflowId: this.currentWorkflow.id,
      artifactsPresent: {
        spec: !!this.currentWorkflow.artifacts.spec,
        plan: !!this.currentWorkflow.artifacts.plan,
        tasks: !!this.currentWorkflow.artifacts.tasks
      },
      sandboxInfo: this.currentWorkflow.sandbox,
      version: this.currentWorkflow.metadata.version,
      lastUpdated: this.currentWorkflow.metadata.updatedAt.toISOString()
    };
  }

  async resetWorkflow(): Promise<void> {
    if (this.currentWorkflow) {
      logger.info('Resetting workflow', { workflowId: this.currentWorkflow.id });
    }

    this.currentWorkflow = null;

    // Clean up workflow files
    try {
      const workflowStatePath = path.join(this.workspaceDir, 'workflow-state.json');
      if (await fs.pathExists(workflowStatePath)) {
        await fs.remove(workflowStatePath);
      }

      // Optionally clean up markdown files
      const filesToClean = ['spec.md', 'plan.md', 'tasks.md'];
      for (const file of filesToClean) {
        const filePath = path.join(this.workspaceDir, file);
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
        }
      }
    } catch (error) {
      logger.warn('Failed to clean up workflow files', { error });
    }

    logger.info('Workflow reset complete');
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up workflow manager');
    
    if (this.currentWorkflow) {
      await this.saveWorkflowState();
    }
    
    this.initialized = false;
    logger.info('Workflow manager cleanup complete');
  }

  // Utility methods for tools
  getWorkspaceDir(): string {
    return this.workspaceDir;
  }

  async getFilePath(filename: string): Promise<string> {
    return path.join(this.workspaceDir, filename);
  }

  async fileExists(filename: string): Promise<boolean> {
    const filePath = path.join(this.workspaceDir, filename);
    return fs.pathExists(filePath);
  }

  async readFile(filename: string): Promise<string> {
    const filePath = path.join(this.workspaceDir, filename);
    return fs.readFile(filePath, 'utf8');
  }

  async writeFile(filename: string, content: string): Promise<void> {
    const filePath = path.join(this.workspaceDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
  }
}