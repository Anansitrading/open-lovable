# LoveChild1.0 MCP Server Architecture

## Overview

LoveChild1.0 is a Model Context Protocol (MCP) server that combines GitHub SpecKit's spec-driven development workflow with Open Lovable's AI-powered website cloning capabilities. It enables developers to create high-quality React applications through conversational commands in Warp terminal.

## Core Philosophy

- **Spec-Driven Development**: Every project starts with a clear specification, plan, and task breakdown
- **AI-Augmented**: Leverage multiple AI providers for intelligent code generation and planning
- **Sandboxed Execution**: Isolated environments for safe code execution and live previews  
- **Conversational Interface**: Natural language commands integrated seamlessly with Warp
- **Iterative Refinement**: All artifacts can be refined and evolved through conversation

## System Architecture

### 1. MCP Server Core

```
LoveChild1.0 MCP Server
├── Core Infrastructure
│   ├── Server Instance (@modelcontextprotocol/sdk)
│   ├── Transport Layer (stdio)
│   ├── Tool Registry & Routing
│   ├── State Management
│   └── Configuration
├── SpecKit Integration
│   ├── Specification Generator
│   ├── Plan Generator  
│   ├── Task Generator
│   └── Workflow State Tracker
├── Open Lovable Integration
│   ├── Web Scraper (Firecrawl)
│   ├── Sandbox Manager
│   ├── AI Code Generator
│   └── Package Manager
└── Utilities
    ├── File System Manager
    ├── Template Engine
    ├── Validation Engine
    └── Logging System
```

### 2. Tool Interface Design

#### Core SpecKit Tools
- `specify` - Generate project specifications
- `plan` - Create technical implementation plans  
- `tasks` - Break down plans into executable tasks
- `status` - Check workflow progress and state

#### Open Lovable Tools  
- `scrape` - Extract website structure and content
- `generate` - AI-powered code generation with streaming
- `preview` - Create live sandbox previews
- `refine` - Iterative code improvements

#### Hybrid Tools
- `reimagine` - Scrape + specify + generate workflow
- `clone` - Complete website cloning pipeline
- `iterate` - Conversational refinement cycle

### 3. Data Models

#### Workflow State
```typescript
interface WorkflowState {
  id: string;
  phase: 'specification' | 'planning' | 'tasks' | 'implementation' | 'complete';
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
  };
}
```

#### Tool Schemas
```typescript
// Specify Tool Schema
const SpecifySchema = z.object({
  description: z.string().describe("Project description or requirements"),
  fromUrl: z.string().url().optional().describe("URL to scrape for context"),
  style: z.enum(['minimal', 'modern', 'glassmorphism', 'brutalism']).optional(),
  technology: z.enum(['react', 'nextjs', 'vite']).default('react'),
  refine: z.boolean().default(false).describe("Refine existing spec")
});

// Plan Tool Schema  
const PlanSchema = z.object({
  techStack: z.array(z.string()).describe("Technology stack choices"),
  architecture: z.enum(['spa', 'ssr', 'static']).default('spa'),
  features: z.array(z.string()).optional().describe("Additional features to include"),
  constraints: z.array(z.string()).optional().describe("Technical constraints")
});

// Tasks Tool Schema
const TasksSchema = z.object({
  granularity: z.enum(['high', 'medium', 'detailed']).default('medium'),
  includeTests: z.boolean().default(true),
  priority: z.enum(['feature', 'performance', 'polish']).default('feature')
});
```

### 4. State Management Architecture

#### Persistent State
- **Workspace Files**: spec.md, plan.md, tasks.md stored in project directory
- **Workflow State**: JSON state file tracking progress and metadata
- **Sandbox Sessions**: Temporary sandbox configurations and URLs
- **AI Context**: Conversation history and refinement iterations

#### State Transitions
```
[Empty] → specify → [Specification Created]
[Specification Created] → plan → [Plan Created]  
[Plan Created] → tasks → [Tasks Created]
[Tasks Created] → generate → [Implementation Started]
[Implementation Started] → preview → [Live Preview]
[Live Preview] → refine → [Iterative Improvements]
```

### 5. Integration Patterns

#### Open Lovable Integration Points
```typescript
// Reuse existing sandbox infrastructure
import { SandboxFactory } from '../lib/sandbox/factory';
import { sandboxManager } from '../lib/sandbox/sandbox-manager';

// Reuse AI integration patterns
import { generateAICode } from '../app/api/generate-ai-code-stream/route';
import { analyzeEditIntent } from '../lib/edit-intent-analyzer';

// Reuse package management
import { detectAndInstallPackages } from '../app/api/detect-and-install-packages/route';
```

#### SpecKit Workflow Adaptation
```typescript
// Adapt SpecKit patterns for MCP
class SpecKitWorkflow {
  async specify(input: SpecifyInput): Promise<SpecificationArtifact> {
    // 1. Scrape URL if provided
    // 2. Generate spec using AI with context
    // 3. Save to spec.md
    // 4. Update workflow state
  }
  
  async plan(input: PlanInput): Promise<PlanArtifact> {
    // 1. Read existing spec.md
    // 2. Generate technical plan with AI
    // 3. Save to plan.md  
    // 4. Update workflow state
  }
  
  async tasks(input: TaskInput): Promise<TaskArtifact[]> {
    // 1. Read existing plan.md
    // 2. Break down into executable tasks
    // 3. Save to tasks.md
    // 4. Update workflow state
  }
}
```

## Implementation Strategy

### Phase 1: Core Infrastructure
1. Set up MCP server boilerplate with TypeScript
2. Implement basic tool registration and routing
3. Create state management system
4. Add logging and error handling

### Phase 2: SpecKit Tools
1. Implement `specify` tool with AI integration
2. Implement `plan` tool with technical planning
3. Implement `tasks` tool with task breakdown
4. Add workflow state tracking

### Phase 3: Open Lovable Integration
1. Integrate Firecrawl web scraping
2. Adapt sandbox management for MCP context
3. Implement AI code generation tools
4. Add live preview capabilities  

### Phase 4: Hybrid Workflows
1. Create `reimagine` workflow combining scraping + spec generation
2. Implement iterative refinement tools
3. Add conversational improvement capabilities
4. Optimize performance and error handling

## Technical Specifications

### Dependencies
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "@mendable/firecrawl-js": "^4.3.3", 
    "@ai-sdk/anthropic": "^2.0.1",
    "@ai-sdk/openai": "^2.0.4",
    "@vercel/sandbox": "^0.0.17",
    "@e2b/code-interpreter": "^2.0.0",
    "zod": "^3.25.0",
    "nanoid": "^5.1.5"
  }
}
```

### Configuration Schema
```typescript
interface LoveChildConfig {
  ai: {
    defaultProvider: 'anthropic' | 'openai' | 'groq';
    providers: {
      anthropic?: { apiKey: string };
      openai?: { apiKey: string };
      groq?: { apiKey: string };
    };
  };
  sandbox: {
    provider: 'e2b' | 'vercel';
    config: SandboxProviderConfig;
  };
  firecrawl: {
    apiKey: string;
  };
  workspace: {
    directory: string;
    autoSave: boolean;
  };
}
```

### Error Handling Strategy
- **Input Validation**: Zod schema validation for all tool inputs
- **Graceful Degradation**: Fallback providers for AI and sandbox services
- **State Recovery**: Ability to recover from partial workflow states
- **User Feedback**: Clear error messages with suggested resolutions

### Security Considerations
- **Input Sanitization**: All user inputs sanitized and validated
- **Sandbox Isolation**: Code execution in isolated environments only
- **API Key Management**: Secure storage and handling of API credentials
- **File System Protection**: Restricted file access within workspace boundaries

## Deployment and Operations

### Warp Integration
```json
{
  "LoveChild1.0": {
    "command": "node", 
    "args": ["/path/to/lovechild-mcp/dist/index.js"],
    "working_directory": "/home/david/projects/open-lovable",
    "env": {
      "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
      "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}",
      "SANDBOX_PROVIDER": "vercel"
    }
  }
}
```

### Performance Targets
- **Tool Response Time**: < 2s for non-generative operations
- **AI Generation Time**: < 30s for complete specifications  
- **Sandbox Startup**: < 10s for new sandbox creation
- **Memory Usage**: < 500MB peak for typical workflows

### Monitoring and Debugging
- **Structured Logging**: JSON logs with correlation IDs
- **Performance Metrics**: Tool execution time tracking
- **Error Aggregation**: Centralized error collection and analysis
- **Debug Mode**: Verbose logging for development and troubleshooting

This architecture provides a solid foundation for building LoveChild1.0 as a production-ready MCP server that seamlessly integrates SpecKit workflows with Open Lovable's AI-powered development capabilities.