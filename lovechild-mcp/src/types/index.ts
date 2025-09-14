import { z } from 'zod';

// ===== Core Configuration Types =====

export const LoveChildConfigSchema = z.object({
  ai: z.object({
    defaultProvider: z.enum(['anthropic', 'openai', 'groq']).default('anthropic'),
    providers: z.object({
      anthropic: z.object({ apiKey: z.string() }).optional(),
      openai: z.object({ apiKey: z.string() }).optional(),
      groq: z.object({ apiKey: z.string() }).optional(),
    }),
  }),
  sandbox: z.object({
    provider: z.enum(['e2b', 'vercel']).default('vercel'),
    config: z.object({
      e2b: z.object({
        apiKey: z.string(),
        timeoutMs: z.number().default(300000),
        template: z.string().default('nodejs'),
      }).optional(),
      vercel: z.object({
        teamId: z.string().optional(),
        projectId: z.string().optional(),
        token: z.string().optional(),
        authMethod: z.enum(['oidc', 'pat']).default('oidc'),
      }).optional(),
    }),
  }),
  integrations: z.object({
    firecrawl: z.object({
      apiKey: z.string(),
      baseUrl: z.string().optional().default('https://api.firecrawl.dev'),
    }),
    e2b: z.object({
      apiKey: z.string(),
      defaultTemplate: z.string().optional().default('nodejs'),
      timeoutMs: z.number().optional().default(300000),
      maxSessions: z.number().optional().default(5),
      keepAliveMs: z.number().optional().default(600000),
    }),
  }),
  workspace: z.object({
    directory: z.string().default('./workspace'),
    autoSave: z.boolean().default(true),
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    file: z.string().optional(),
  }).optional(),
});

export type LoveChildConfig = z.infer<typeof LoveChildConfigSchema>;

// ===== Workflow State Types =====

export type WorkflowPhase = 'specification' | 'planning' | 'tasks' | 'implementation' | 'complete';

export interface SpecificationArtifact {
  title: string;
  description: string;
  requirements: string[];
  constraints: string[];
  scrapedContext?: {
    url: string;
    content: string;
    timestamp: Date;
  };
  style?: string;
  technology: string;
}

export interface PlanArtifact {
  architecture: string;
  techStack: string[];
  features: string[];
  milestones: Array<{
    name: string;
    description: string;
    dependencies: string[];
    estimatedHours: number;
  }>;
  risks: string[];
}

export interface TaskArtifact {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'complete';
  priority: 'low' | 'medium' | 'high';
  dependencies: string[];
  testCriteria: string[];
  estimatedHours: number;
  assignee?: string;
}

export interface WorkflowState {
  id: string;
  phase: WorkflowPhase;
  artifacts: {
    spec?: SpecificationArtifact;
    plan?: PlanArtifact;
    tasks?: TaskArtifact[];
  };
  sandbox?: SandboxInfo;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    version: number;
    lastCommand?: string;
  };
  // Additional fields for E2B sandbox integration
  currentStep?: string;
  projectType?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
}

// ===== Sandbox Types =====

export interface SandboxFile {
  path: string;
  content: string;
  lastModified?: number;
}

export interface SandboxInfo {
  sandboxId: string;
  url: string;
  provider: 'e2b' | 'vercel';
  createdAt: Date;
  status: 'initializing' | 'running' | 'stopped' | 'error';
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

// E2B-specific types
export interface E2BSandboxSession {
  id: string;
  sessionId: string;
  status: 'active' | 'idle' | 'error' | 'terminated';
  createdAt: Date;
  lastActivity: Date;
  files: string[];
  previewUrl?: string;
  previewPort?: number;
  workflowId?: string;
  metadata: {
    projectType: 'react' | 'vite' | 'node' | 'python';
    template?: string;
    environment: Record<string, string>;
    currentStep?: string;
    workflowStatus?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  };
}

export interface E2BFileOperation {
  type: 'write' | 'read' | 'delete' | 'mkdir';
  path: string;
  content?: string;
  timestamp: Date;
}

export interface E2BCommandExecution {
  command: string;
  workingDir?: string;
  environment?: Record<string, string>;
  timeout?: number;
  background?: boolean;
}

export interface E2BExecutionResult {
  command: string;
  exitCode: number;
  stdout: string[];
  stderr: string[];
  duration: number;
  timestamp: Date;
  success: boolean;
  error?: string;
}

export interface E2BSandboxOptions {
  template?: string;
  timeout?: number;
  environment?: Record<string, string>;
  keepAlive?: boolean;
  workflowId?: string;
}

export interface E2BPreviewInfo {
  url: string;
  port: number;
  protocol: 'http' | 'https';
  status: 'starting' | 'running' | 'error';
  lastCheck: Date;
}

// ===== Tool Schema Definitions =====

export const SpecifyToolSchema = z.object({
  description: z.string().describe("Project description or requirements"),
  fromUrl: z.string().url().optional().describe("URL to scrape for context"),
  style: z.enum(['minimal', 'modern', 'glassmorphism', 'brutalism']).optional(),
  technology: z.enum(['react', 'nextjs', 'vite']).default('react'),
  refine: z.boolean().default(false).describe("Refine existing specification"),
});

export const PlanToolSchema = z.object({
  techStack: z.array(z.string()).describe("Technology stack choices"),
  architecture: z.enum(['spa', 'ssr', 'static']).default('spa'),
  features: z.array(z.string()).optional().describe("Additional features to include"),
  constraints: z.array(z.string()).optional().describe("Technical constraints"),
});

export const TasksToolSchema = z.object({
  granularity: z.enum(['high', 'medium', 'detailed']).default('medium'),
  includeTests: z.boolean().default(true),
  priority: z.enum(['feature', 'performance', 'polish']).default('feature'),
});

export const ScrapeToolSchema = z.object({
  url: z.string().url().describe("URL to scrape"),
  includeImages: z.boolean().default(false).describe("Include image analysis"),
  maxDepth: z.number().min(1).max(3).default(1).describe("Maximum crawl depth"),
  format: z.enum(['markdown', 'json']).default('markdown'),
});

export const GenerateToolSchema = z.object({
  prompt: z.string().describe("Generation prompt or requirements"),
  type: z.enum(['component', 'page', 'feature', 'full-app']).default('component'),
  style: z.string().optional().describe("Visual style preferences"),
  streaming: z.boolean().default(true).describe("Enable streaming response"),
});

export const PreviewToolSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })).optional().describe("Files to include in preview"),
  packages: z.array(z.string()).optional().describe("NPM packages to install"),
  command: z.string().default('npm run dev').describe("Development server command"),
});

export const StatusToolSchema = z.object({
  verbose: z.boolean().default(false).describe("Include detailed status information"),
});

// Additional stub tool schemas
export const IterateToolSchema = z.object({
  prompt: z.string().describe("Iteration request or refinement description"),
  focus: z.enum(['functionality', 'ui', 'performance', 'all']).optional().default('all')
});

export const DeployToolSchema = z.object({
  environment: z.enum(['staging', 'production']).optional().default('staging'),
  platform: z.string().optional().describe("Target deployment platform")
});

export const AnalyzeToolSchema = z.object({
  type: z.enum(['quality', 'performance', 'security', 'all']).optional().default('all'),
  files: z.array(z.string()).optional().describe("Specific files to analyze")
});

export const OptimizeToolSchema = z.object({
  target: z.enum(['bundle-size', 'performance', 'memory', 'all']).optional().default('performance'),
  aggressive: z.boolean().optional().default(false)
});

export const CollaborateToolSchema = z.object({
  action: z.enum(['invite', 'share', 'sync']).describe("Collaboration action"),
  workspace: z.string().optional().describe("Workspace identifier")
});

// ===== Tool Input/Output Types =====

export type SpecifyInput = z.infer<typeof SpecifyToolSchema>;
export type PlanInput = z.infer<typeof PlanToolSchema>;
export type TasksInput = z.infer<typeof TasksToolSchema>;
export type ScrapeInput = z.infer<typeof ScrapeToolSchema>;
export type GenerateInput = z.infer<typeof GenerateToolSchema>;
export type PreviewInput = z.infer<typeof PreviewToolSchema>;
export type StatusInput = z.infer<typeof StatusToolSchema>;
export type IterateInput = z.infer<typeof IterateToolSchema>;
export type DeployInput = z.infer<typeof DeployToolSchema>;
export type AnalyzeInput = z.infer<typeof AnalyzeToolSchema>;
export type OptimizeInput = z.infer<typeof OptimizeToolSchema>;
export type CollaborateInput = z.infer<typeof CollaborateToolSchema>;

// ===== Tool Response Types =====

export interface ToolResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    executionTime: number;
    timestamp: Date;
    version: string;
  };
}

export interface SpecifyResponse extends ToolResponse<SpecificationArtifact> {
  filePath: string;
}

export interface PlanResponse extends ToolResponse<PlanArtifact> {
  filePath: string;
}

export interface TasksResponse extends ToolResponse<TaskArtifact[]> {
  filePath: string;
}

export interface ScrapeResponse extends ToolResponse<{
  url: string;
  content: string;
  metadata: {
    title?: string;
    description?: string;
    images?: string[];
    links?: string[];
    keywords?: string[];
    author?: string;
    publishedTime?: string;
    language?: string;
    statusCode?: number;
    pagesCrawled?: number;
  };
}> {}

export interface GenerateResponse extends ToolResponse<{
  files: SandboxFile[];
  packages: string[];
  commands: string[];
}> {}

export interface PreviewResponse extends ToolResponse<{
  sandboxInfo: SandboxInfo;
  previewUrl: string;
}> {}

export interface StatusResponse extends ToolResponse<{
  workflowState: WorkflowState;
  sandboxStatus?: SandboxInfo;
  recentActivity: Array<{
    timestamp: Date;
    action: string;
    details: string;
  }>;
  progress: {
    percentage: number;
    phase: string;
    phasesCompleted: number;
    totalPhases: number;
    artifactsPresent: number;
    totalArtifacts: number;
  };
  fileHealth: {
    totalFiles: number;
    existingFiles: number;
    missingFiles: string[];
  };
  nextSteps: string[];
  verbose?: any;
}> {}

// Stub tool response types
export interface IterateResponse extends ToolResponse<{
  changes: Array<{
    file: string;
    type: 'modified' | 'created' | 'deleted';
    description: string;
  }>;
  summary: string;
}> {}

export interface DeployResponse extends ToolResponse<{
  deploymentUrl: string;
  environment: string;
  status: 'pending' | 'building' | 'success' | 'error';
}> {}

export interface AnalyzeResponse extends ToolResponse<{
  analysis: {
    quality: number;
    performance: number;
    security: number;
  };
  issues: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    file: string;
    description: string;
  }>;
  recommendations: string[];
}> {}

export interface OptimizeResponse extends ToolResponse<{
  optimizations: Array<{
    type: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
  }>;
  metrics: {
    bundleSizeReduction: number;
    performanceGain: number;
  };
}> {}

export interface CollaborateResponse extends ToolResponse<{
  workspace: {
    id: string;
    url: string;
    members: string[];
  };
  action: string;
  status: string;
}> {}

// ===== Error Types =====

export class LoveChildError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'LoveChildError';
  }
}

export class ValidationError extends LoveChildError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class ConfigurationError extends LoveChildError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIGURATION_ERROR', details);
    this.name = 'ConfigurationError';
  }
}

export class SandboxError extends LoveChildError {
  constructor(message: string, details?: any) {
    super(message, 'SANDBOX_ERROR', details);
    this.name = 'SandboxError';
  }
}

export class AIProviderError extends LoveChildError {
  constructor(message: string, details?: any) {
    super(message, 'AI_PROVIDER_ERROR', details);
    this.name = 'AIProviderError';
  }
}

// ===== Utility Types =====

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

export interface Logger {
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}