# LoveChild1.0 MCP Server - Warp Native Architecture

A Model Context Protocol (MCP) server that combines spec-driven development workflows with multi-MCP orchestration, powered entirely by Warp's native infrastructure - **no external API keys required**.

## 🚀 Overview

LoveChild1.0 is a Warp-native MCP server that leverages Warp's built-in capabilities:

- **Warp CLI Integration**: All LLM operations use `warp agent run` - no API keys needed
- **Multi-MCP Orchestration**: Intelligently routes tasks to other MCPs (Perplexity, Linear, Context7, Vercel) through Warp's `call_mcp_tool`
- **SpecKit Workflows**: Structured `specify`, `plan`, `tasks` commands for disciplined development
- **Zero External Dependencies**: Everything runs through Warp's infrastructure

## 🏗️ Architecture

### Warp-Native Design

```
┌─────────────────────────────────────┐
│     User Commands in Warp           │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│    LoveChild1.0 MCP Server          │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────────┬────────────────┐ │
│  │   SpecKit    │  Orchestration │ │
│  │    Tools     │     Tools      │ │
│  └──────┬───────┴────────┬───────┘ │
│         ↓                 ↓         │
│  ┌──────────────┐  ┌─────────────┐ │
│  │ WarpLLMService│  │call_mcp_tool│ │
│  │(warp agent   │  │  (routes to) │ │
│  │    run)      │  │             │ │
│  └──────────────┘  └──────┬──────┘ │
└────────────────────────────┼────────┘
                            ↓
        ┌───────────────────────────────────┐
        │ Other MCPs in Warp Environment:   │
        │ • Perplexity (research)           │
        │ • Linear (issue tracking)         │
        │ • Context7 (documentation)        │
        │ • Vercel (deployment)             │
        │ • Supabase, GitHub, etc.          │
        └───────────────────────────────────┘
```

### Implementation Status

✅ **Completed Components:**
- **Warp LLM Service**: Complete integration with `warp agent run` for all AI operations
- **MCP Orchestration System**: Intelligent routing to 5+ configured MCPs
- **SpecKit Tools**: All 4 core tools (specify, plan, tasks, status) implemented
- **Multi-MCP Workflows**: 5 complete workflows for complex development tasks
- **Tool Registry**: Dynamic tool loading and registration
- **Workflow State Management**: Complete state tracking across operations
- **Structured Logging**: Correlation IDs and performance metrics
- **Type Safety**: Full TypeScript implementation with Zod validation

## 🛠️ Installation & Setup

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Warp terminal with MCP support
- **NO API keys required** - uses Warp's native infrastructure

### Quick Start (Linux/Unix)

1. **Clone and Install**
   ```bash
   git clone https://github.com/Anansitrading/lovechild-mcp.git
   cd lovechild-mcp/lovechild-mcp
   npm install
   ```

2. **Build the Server**
   ```bash
   npm run build
   ```
   
   **Or use the automated setup script from the root:**
   ```bash
   cd ..
   ./setup-lovechild-mcp.sh
   ```

3. **Configure in Warp**
   
   Open Warp Settings → AI → Manage MCP servers → Add New Server
   
   **Paste this configuration (adjust path to your location):**
   ```json
   {
     "LoveChild-Warp-Native": {
       "command": "node",
       "args": ["start-warp-native.js"],
       "working_directory": "/absolute/path/to/lovechild-mcp/lovechild-mcp"
     }
   }
   ```
   
   **Linux-Specific Notes:**
   - Use absolute paths starting with `/`
   - The MCP server runs in the `lovechild-mcp` subdirectory
   - Logs are stored in `~/.local/state/warp-terminal/mcp/`
   - No environment variables or API keys required

4. **Verify Setup**
   ```bash
   # Test server manually:
   node start-warp-native.js
   # Should see "LoveChild MCP Server ready!"
   # Press Ctrl+C to stop
   
   # Check Warp logs if issues:
   tail -f ~/.local/state/warp-terminal/mcp/*.log
   ```

## 🔧 How It Works

### Warp CLI Integration

All LLM operations use Warp's native `warp agent run` command:

```javascript
// WarpLLMService automatically handles:
const warpLLM = new WarpLLMService();
await warpLLM.generateResponse(prompt, { 
  model: 'claude-3.5-sonnet' // Uses Warp's configured models
});
```

### MCP Orchestration

The orchestration system (`src/config/mcp-orchestration.yaml`) defines:

- **5 MCP Servers**: Perplexity, Linear, Context7, Vercel, POE/Dart
- **12 Routing Rules**: Automatic MCP selection based on task type
- **5 Complete Workflows**: Multi-step processes across MCPs
- **Fallback Strategies**: Automatic recovery and retries

### No Configuration Required

Unlike traditional MCP servers, LoveChild requires **zero configuration**:
- ✅ No API keys to manage
- ✅ No environment variables to set
- ✅ No credentials to store
- ✅ Everything runs through Warp's authenticated environment

## 🎯 Available Tools

### SpecKit Workflow Tools (Powered by Warp CLI)

#### `specify` - Generate project specifications
Uses `warp agent run` to generate comprehensive specifications:
```javascript
specify({
  description: "Build a personal blog",
  fromUrl: "https://example.com", // Optional: scrape for context
  technology: "react",
  style: "modern"
})
```

#### `plan` - Create technical implementation plans
```javascript
plan({
  techStack: ["react", "nextjs", "tailwind"],
  architecture: "ssr",
  scalability: "high"
})
```

#### `tasks` - Break down plans into executable tasks
```javascript
tasks({
  granularity: "detailed",
  includeTesting: true,
  includeDocumentation: true
})
```

#### `status` - Track workflow progress
```javascript
status() // Returns current workflow state
```

### Orchestration Tools (Multi-MCP Coordination)

#### `route_task` - Intelligent task routing
Automatically routes tasks to the best MCP:
```javascript
route_task({
  task_type: "research",
  description: "Research React authentication best practices",
  complexity: "medium"
})
// → Automatically routes to Perplexity MCP
```

#### `execute_workflow` - Complete multi-step workflows
Runs predefined workflows across multiple MCPs:
```javascript
execute_workflow({
  workflow_name: "bug_fix_workflow",
  description: "Login system returning 500 errors",
  codebase: "my-app"
})
// Executes: Analyze → Create Linear issue → Get context → Generate fix → Deploy → Complete
```

#### `list_available_mcps` - Discover MCPs
```javascript
list_available_mcps({ capability_filter: "research" })
// Returns MCPs with research capabilities
```

#### `list_workflows` - Available workflows
- `complete_feature_development` - End-to-end feature development
- `bug_fix_workflow` - Complete bug resolution process
- `research_and_implement` - Research-driven development
- `iterative_development` - Preview-deploy-improve cycles
- `deployment_pipeline` - Production deployment with validation

## 📁 Project Structure

```
lovechild-mcp/
├── src/
│   ├── core/                    # Core MCP infrastructure
│   │   ├── server.ts           # Main MCP server
│   │   ├── tool-registry.ts    # Dynamic tool loading
│   │   └── workflow-manager.ts # Workflow state management
│   ├── tools/
│   │   ├── speckit/            # SpecKit tools (use WarpLLMService)
│   │   │   ├── specify-tool.ts
│   │   │   ├── plan-tool.ts
│   │   │   ├── tasks-tool.ts
│   │   │   └── status-tool.ts
│   │   └── orchestration-tools.ts # Multi-MCP coordination
│   ├── integrations/
│   │   ├── warp-llm-service.ts # Warp CLI integration (warp agent run)
│   │   └── mcp-orchestrator.ts # MCP routing and workflow engine
│   ├── config/
│   │   └── mcp-orchestration.yaml # MCP registry and routing rules
│   └── types/
│       └── warp.d.ts           # Warp global type definitions
├── start-warp-native.js       # Warp-native server launcher
├── test-orchestration.js      # Orchestration system validator
├── dist/                      # Compiled TypeScript output
└── workspace/                 # Working directory
```

## 🔬 Development

### Development Commands

```bash
# Development with hot reload
npm run dev

# Build for production  
npm run build

# Run tests
npm run test
npm run test:watch

# Linting
npm run lint
npm run lint:fix
```

### Logging and Debugging

The server includes comprehensive logging with:

- **Structured JSON logs** with correlation IDs
- **Performance metrics** for tool execution
- **MCP request/response tracking**
- **Workflow state change monitoring**
- **AI and sandbox operation logging**

Enable debug logging:
```bash
DEBUG=true LOG_LEVEL=debug npm run dev
```

## 🧪 Testing Strategy

- **Unit Tests**: Individual tool and utility testing
- **Integration Tests**: MCP server and external service integration
- **Mock Services**: For AI providers and external APIs during testing
- **Warp Integration**: End-to-end testing within Warp terminal

## 💫 Example Workflows

### Bug Fix Workflow
Automatically coordinates 6 steps across multiple MCPs:

```javascript
execute_workflow({
  workflow_name: "bug_fix_workflow",
  description: "Login returns 500 on invalid credentials"
})
```

**Automated Steps:**
1. **Analyze** (POE/Claude Opus) - Deep analysis of the bug
2. **Create Issue** (Linear) - Creates bug in Team: Kijko, assigns to David
3. **Get Context** (Context7) - Fetches relevant documentation
4. **Generate Fix** (POE/GPT-5 Codex) - Creates solution code
5. **Deploy** (Vercel) - Creates preview deployment
6. **Complete** (Linear) - Marks issue as complete

### Feature Development Workflow

```javascript
execute_workflow({
  workflow_name: "complete_feature_development",
  description: "Add user profile editing",
  library: "react-hook-form"
})
```

**Automated Steps:**
1. **Research** (Perplexity) - Best practices and requirements
2. **Create Feature Issue** (Linear) - Tracked in your project
3. **Get Library Docs** (Context7) - API documentation
4. **Generate Code** (POE/GPT-5 Codex) - Implementation
5. **Deploy Preview** (Vercel) - Live preview URL
6. **Mark Complete** (Linear) - Updates issue status

### Research and Implementation

```javascript
execute_workflow({
  workflow_name: "research_and_implement",
  description: "Implement WebSocket real-time updates"
})
```

**Automated Steps:**
1. **Deep Research** (Perplexity) - Comprehensive analysis
2. **Strategic Analysis** (POE/o3-deep-research) - Architecture decisions
3. **Technical Context** (Context7) - Library documentation
4. **Implementation Plan** (POE/Claude Opus) - Detailed plan with code

## 📊 Routing Rules

The orchestrator automatically selects the right MCP based on task type:

| Task Type | Primary MCP | Tool | Fallback |
|-----------|-------------|------|----------|
| Research | Perplexity | perplexity_ask | POE (Claude) |
| Bug Report | Linear | create_issue | - |
| Code Generation | POE | ask_poe (GPT-5 Codex) | - |
| Library Docs | Context7 | get_library_docs | - |
| Deployment | Vercel | deploy_to_vercel | - |
| Complex Reasoning | POE | ask_poe (Claude Opus) | POE (GPT-5) |

## 🎮 Usage Examples

### In Warp Terminal

```bash
# Specify a new project
specify "Build a task management app with drag-and-drop"

# Route a research task (automatically goes to Perplexity)
route_task research "Best practices for React performance"

# Execute a complete bug fix workflow
execute_workflow bug_fix_workflow "Users can't log out properly"

# Check available MCPs
list_available_mcps

# See all workflows
list_workflows
```

### Task Routing Examples

```javascript
// Research task → Perplexity
route_task({
  task_type: "research",
  description: "OAuth 2.0 best practices",
  complexity: "high"
})

// Bug report → Linear (with your defaults)
route_task({
  task_type: "bug_report",
  description: "Memory leak in dashboard"
})
// Creates issue: Team: Kijko, Assignee: David, Label: Bug

// Deployment → Vercel
route_task({
  task_type: "deploy",
  target: "vercel",
  description: "Deploy feature branch"
})
```

## 🚦 Current Status & Next Steps

### Phase 1: Core Infrastructure ✅ Complete
- [x] Project structure and configuration
- [x] MCP server foundation
- [x] Configuration management
- [x] Structured logging system
- [x] Type definitions and schemas
- [x] Warp CLI integration service
- [x] Tool registry system
- [x] Workflow state management
- [x] Specify tool implementation

### Phase 2: Tool Implementation ✅ Complete
- [x] **Specify Tool** - Generates specifications using Warp CLI
- [x] **Plan Tool** - Creates implementation plans using Warp CLI
- [x] **Tasks Tool** - Breaks down into actionable tasks using Warp CLI
- [x] **Status Tool** - Workflow progress tracking
- [x] **Orchestration Tools** - Complete multi-MCP coordination system
- [x] **Route Task** - Intelligent routing to best MCP
- [x] **Execute Workflow** - Multi-step workflow execution

### Phase 3: MCP Orchestration ✅ Complete
- [x] **5 MCP Servers** - Perplexity, Linear, Context7, Vercel, POE
- [x] **12 Routing Rules** - Automatic MCP selection
- [x] **5 Complete Workflows** - Bug fixes, features, research, deployment
- [x] **Fallback Strategies** - Automatic recovery and retries
- [x] **Caching System** - Intelligent result caching
- [x] **Warp Integration** - Full `call_mcp_tool` support

### Phase 4: Production Ready ✅
- [x] **Warp Native Server** - `start-warp-native.js` launcher
- [x] **Zero Configuration** - No API keys or environment variables
- [x] **Full Documentation** - Complete README and examples
- [x] **GitHub Repository** - Published and maintained

**Status**: 🚀 **PRODUCTION READY**
**Architecture**: Warp-native with zero external dependencies
**Capabilities**: Spec-driven development + Multi-MCP orchestration

## 📚 Technical Details

### Key Technologies

- **Warp CLI**: `warp agent run` for all LLM operations
- **MCP SDK**: `@modelcontextprotocol/sdk` for server implementation
- **TypeScript**: Full type safety and modern language features
- **Zod**: Runtime schema validation for all tool inputs
- **YAML**: Declarative configuration for MCP orchestration
- **No External APIs**: Everything through Warp's infrastructure

### Performance Targets

- **Tool Response Time**: < 2s for non-generative operations
- **AI Generation Time**: < 30s for complete specifications
- **Sandbox Startup**: < 10s for new sandbox creation  
- **Memory Usage**: < 500MB peak for typical workflows

### Security Features

- **Input Sanitization**: All inputs validated and sanitized
- **Credential Protection**: API keys automatically redacted from logs
- **Sandbox Isolation**: All code execution in isolated environments
- **File System Protection**: Restricted access within workspace boundaries

## 🤝 Contributing

This MCP server follows established patterns from both SpecKit and Open Lovable. Key principles:

- **Type Safety**: Use TypeScript and Zod for all interfaces
- **Structured Logging**: Include correlation IDs and performance metrics
- **Error Handling**: Comprehensive error types with detailed context
- **Testing**: Write tests for all tools and integrations
- **Documentation**: Keep README and tool descriptions up to date

## 📄 License

MIT License - see LICENSE file for details.

---

**LoveChild1.0** - Where SpecKit discipline meets Open Lovable creativity, perfectly integrated with Warp's agentic development environment.