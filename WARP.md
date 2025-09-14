# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Open Lovable is an AI-powered website builder that can scrape existing websites and recreate them using React, Vite, and Tailwind CSS. It combines web scraping (Firecrawl), AI code generation (multiple LLM providers), and isolated sandbox execution (E2B or Vercel) to build React applications in real-time.

## Essential Commands

### Development
```bash
# Start development server with Turbopack
pnpm dev

# Build production version
pnpm build

# Run production build
pnpm start

# Lint code
pnpm lint
```

### Testing
```bash
# Test API endpoints
pnpm test:api

# Test code execution
pnpm test:code

# Run all tests
pnpm test:all
```

## Architecture Overview

### Core Components
- **Frontend**: Next.js 15 with React 19, TypeScript, Tailwind CSS
- **AI Integration**: Multi-provider AI SDK supporting Anthropic, OpenAI, Gemini, and Groq
- **Sandbox Providers**: E2B or Vercel for isolated code execution
- **Web Scraping**: Firecrawl for website content extraction

### Directory Structure
```
app/
├── api/                  # Next.js API routes (20+ endpoints)
├── generation/          # Main code generation interface
├── builder/            # Alternative builder interface
└── landing.tsx         # Landing page components

lib/
├── sandbox/            # Sandbox abstraction layer
│   ├── factory.ts      # Provider factory
│   ├── sandbox-manager.ts  # Singleton manager
│   ├── providers/      # E2B and Vercel implementations
│   └── types.ts        # Common interfaces
├── context-selector.ts # File selection for edits
├── edit-intent-analyzer.ts # AI-powered edit analysis
└── file-search-executor.ts # Code search functionality

components/
├── ui/                 # Shadcn/ui components
└── shared/            # Reusable app components

types/
├── conversation.ts     # Chat and edit tracking
├── sandbox.ts         # Sandbox type definitions
└── file-manifest.ts   # File system representation
```

### Key API Endpoints
- `/api/generate-ai-code-stream` - Streaming AI code generation
- `/api/apply-ai-code-stream` - Apply generated code to sandbox
- `/api/create-ai-sandbox-v2` - Create isolated sandboxes
- `/api/analyze-edit-intent` - AI-powered edit analysis
- `/api/detect-and-install-packages` - Automatic package detection

## Development Workflow

### Code Generation Process
1. **Web Scraping**: Firecrawl extracts website content and structure
2. **AI Planning**: LLM analyzes requirements and creates implementation plan
3. **Sandbox Creation**: Isolated environment with Vite + React + Tailwind
4. **Streaming Generation**: Real-time code generation with progress updates
5. **Package Detection**: Automatic npm package installation via XML tags
6. **File Application**: Generated files written to sandbox filesystem
7. **Live Preview**: Instant preview via sandbox URL

### Edit Workflow (Advanced)
1. **Intent Analysis**: AI determines edit type and scope
2. **File Search**: Agentic search to find exact code locations
3. **Context Selection**: Surgical selection of relevant files
4. **Targeted Edits**: Precise modifications preserving existing code

## Environment Configuration

### Required Variables
```bash
FIRECRAWL_API_KEY=          # Web scraping (required)
SANDBOX_PROVIDER=vercel     # or 'e2b'

# AI Provider (need at least one)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=

# Vercel Sandbox (if using vercel provider)
VERCEL_OIDC_TOKEN=          # Recommended method
# OR
VERCEL_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_ID=

# E2B Sandbox (if using e2b provider)
E2B_API_KEY=
```

## Sandbox Provider Architecture

The codebase uses a factory pattern with two sandbox providers:

### Provider Abstraction
- `SandboxProvider` - Abstract base class
- `SandboxFactory.create()` - Provider instantiation
- `sandboxManager` - Singleton for lifecycle management

### E2B Provider
- Full-featured Python/Node.js sandboxes
- Longer session duration (up to hours)
- Rich development environment
- File system access via Python API

### Vercel Provider  
- Lightweight ephemeral VMs
- Node.js 22 runtime
- 5-minute default timeout
- Direct file system operations

## AI Integration Architecture

### Model Configuration
- Default model configurable via `appConfig.ai.defaultModel`
- Multi-provider support through Vercel AI SDK
- Optional AI Gateway integration for unified access
- Streaming responses for real-time feedback

### Code Generation Flow
- System prompts with architectural context
- XML-based structured responses for files/packages
- Real-time streaming with SSE (Server-Sent Events)
- Conversation state tracking across edits

## Package Management

### XML-Based Detection
```xml
<packages>
react-router-dom
@heroicons/react
axios
</packages>

<file path="src/App.jsx">
// Component code here
</file>

<command>npm run dev</command>
```

### Automatic Import Analysis
- Scans generated code for import statements
- Excludes built-in modules and relative imports
- Handles scoped packages (@org/package)
- Prevents duplicate installations

## State Management

### Global State
- `global.sandboxState` - File cache and manifest
- `global.conversationState` - Chat history and edits
- `global.activeSandboxProvider` - Legacy provider reference

### Conversation Context
- Message history with 20-message rolling window
- Edit history for targeted modifications
- User preference analysis for edit patterns
- Project evolution tracking

## File System Architecture

### File Manifest
- Complete project file tree representation
- Content caching for search operations
- Metadata tracking (size, modification time)
- Search indexing for edit operations

### Search System
- Agentic file search with AI-powered queries
- Multi-term search with relevance scoring
- Exact code location identification
- Context-aware file selection

## Tailwind Configuration

### Custom Design System
- Extensive font-size scale with line-height/letter-spacing
- 1000-step spacing system (0-999px)
- Custom utility classes (center, flex-center, text-gradient)
- Advanced layout utilities (cw, ch, cs, cmw, mw)

### Custom CSS Variables
- Color system via `colors.json` 
- CSS custom properties integration
- Dark mode support via class strategy

## Development Best Practices

### API Development
- Use streaming responses for long operations
- Implement progress feedback via Server-Sent Events
- Handle provider-specific error cases gracefully
- Maintain backward compatibility with global state

### Component Architecture
- Use TypeScript for type safety
- Leverage Tailwind for consistent styling
- Implement proper error boundaries
- Use React 19 features appropriately

### Testing Strategy
- API endpoint testing via Node.js scripts
- Code execution validation in sandboxes
- Integration testing across providers
- No formal test framework - manual testing approach

## Common Issues and Solutions

### Sandbox Connection Issues
- Provider timeout handling via sandbox manager
- Automatic reconnection attempts
- Graceful fallback to new sandbox creation
- Clear error messaging for expired sessions

### Package Installation Failures
- ERESOLVE warnings are normal with dependency conflicts
- Automatic retry logic for transient failures
- Legacy peer deps flag available via config
- Post-installation Vite server restart

### Streaming Response Handling
- Proper chunk buffering for incomplete messages
- Error state management in streams
- Progress update debouncing
- Client-side reconnection logic

## Performance Considerations

### Sandbox Optimization
- 10-minute sandbox keep-alive for active sessions
- File cache management to prevent memory leaks
- Automatic cleanup of expired sandbox sessions
- Provider-specific timeout handling

### AI Request Optimization
- Conversation history trimming (15 messages max)
- Context-aware file selection for edits
- Surgical editing to minimize token usage
- Intelligent model selection based on task complexity

This architecture enables rapid prototyping and iteration while maintaining production-grade reliability and performance.