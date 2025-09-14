# LoveChild1.0 MCP Server

A Model Context Protocol (MCP) server that combines GitHub SpecKit's spec-driven development workflow with Open Lovable's AI-powered website cloning capabilities, designed for seamless integration with Warp terminal.

## 🚀 Overview

LoveChild1.0 enables developers to create high-quality React applications through conversational commands by combining:

- **SpecKit Workflows**: Structured `/specify`, `/plan`, `/tasks` commands for disciplined development
- **Open Lovable Integration**: AI-powered website cloning and code generation
- **Sandbox Execution**: Isolated environments (E2B/Vercel) for safe code execution and live previews
- **Conversational Interface**: Natural language commands integrated seamlessly with Warp

## 🏗️ Architecture

### Core Components

```
LoveChild1.0 MCP Server
├── Core Infrastructure
│   ├── Server Instance (@modelcontextprotocol/sdk)
│   ├── Configuration Manager
│   ├── Structured Logger
│   ├── Tool Registry & Routing
│   └── Workflow State Management
├── SpecKit Integration
│   ├── Specification Generator (/specify)
│   ├── Plan Generator (/plan)
│   ├── Task Generator (/tasks)
│   └── Workflow State Tracker
├── Open Lovable Integration
│   ├── Web Scraper (Firecrawl)
│   ├── Sandbox Manager (E2B/Vercel)
│   ├── AI Code Generator
│   └── Package Manager
└── Tools & Utilities
    ├── File System Manager
    ├── Template Engine
    ├── Validation Engine
    └── Error Handling
```

### Current Implementation Status

✅ **Completed Components:**
- Project structure and configuration
- Core MCP server infrastructure
- Configuration management system
- Structured logging with correlation IDs
- Type definitions and schemas
- Error handling framework

🚧 **In Progress:**
- SpecKit workflow tools implementation
- Open Lovable integration layer
- Sandbox management
- AI-powered code generation

📋 **Remaining Work:**
- Tool registry and handlers
- Workflow state management
- Integration testing
- Documentation completion

## 🛠️ Installation & Setup

### Prerequisites

- Node.js 18+ 
- npm or pnpm
- API keys for:
  - AI providers (Anthropic/OpenAI/Groq)
  - Firecrawl (web scraping)
  - E2B or Vercel (sandboxes)

### Quick Start

1. **Clone and Install**
   ```bash
   cd /home/david/projects/open-lovable/lovechild-mcp
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Build the Server**
   ```bash
   npm run build
   ```

4. **Configure Warp Integration**
   
   Add to your Warp MCP servers configuration:
   ```json
   {
     "LoveChild1.0": {
       "command": "node",
       "args": ["/home/david/projects/open-lovable/lovechild-mcp/dist/index.js"],
       "working_directory": "/home/david/projects/open-lovable",
       "env": {
         "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
         "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}",
         "SANDBOX_PROVIDER": "vercel"
       }
     }
   }
   ```

## 🔧 Configuration

### Environment Variables

```bash
# AI Provider Configuration (at least one required)
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here  
GROQ_API_KEY=your_groq_api_key_here
DEFAULT_AI_PROVIDER=anthropic

# Firecrawl Configuration (required)
FIRECRAWL_API_KEY=your_firecrawl_api_key_here

# Sandbox Configuration
SANDBOX_PROVIDER=vercel

# Vercel Sandbox
VERCEL_OIDC_TOKEN=your_vercel_oidc_token_here
# OR
VERCEL_TOKEN=your_vercel_token_here
VERCEL_TEAM_ID=your_vercel_team_id_here  
VERCEL_PROJECT_ID=your_vercel_project_id_here

# E2B Sandbox (alternative)
E2B_API_KEY=your_e2b_api_key_here

# Workspace Configuration
WORKSPACE_DIR=./workspace
AUTO_SAVE=true

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/lovechild-mcp.log
```

## 🎯 Planned Tools

### SpecKit Workflow Tools

- **`specify`** - Generate project specifications
  ```
  specify "Build a personal blog with homepage and about page"
  specify "Reimagine this landing page as an e-commerce site" --from-url "http://example.com"
  ```

- **`plan`** - Create technical implementation plans
  ```
  plan --tech-stack "react,nextjs,tailwind" --architecture "ssr"
  ```

- **`tasks`** - Break down plans into executable tasks
  ```
  tasks --granularity "detailed" --include-tests true
  ```

### Open Lovable Tools

- **`scrape`** - Extract website structure and content
  ```
  scrape "https://example.com" --format "markdown"
  ```

- **`generate`** - AI-powered code generation
  ```
  generate "Create a hero section component" --style "glassmorphism"
  ```

- **`preview`** - Create live sandbox previews
  ```
  preview --files [...] --packages "react-router-dom"
  ```

### Hybrid Workflows

- **`reimagine`** - Complete scrape → specify → generate pipeline
- **`clone`** - Full website cloning workflow
- **`iterate`** - Conversational refinement cycles

## 📁 Project Structure

```
lovechild-mcp/
├── src/
│   ├── core/                    # Core MCP infrastructure
│   │   ├── config.ts           # Configuration management
│   │   ├── logger.ts           # Structured logging
│   │   ├── server.ts           # Main MCP server
│   │   ├── tool-registry.ts    # Tool registration & routing
│   │   └── workflow-manager.ts # Workflow state management
│   ├── tools/                   # Individual tool implementations
│   │   ├── speckit/            # SpecKit workflow tools
│   │   ├── lovable/            # Open Lovable integration tools
│   │   └── hybrid/             # Hybrid workflow tools
│   ├── integrations/           # External service integrations
│   │   ├── speckit/            # SpecKit pattern implementations
│   │   └── lovable/            # Open Lovable service adapters
│   ├── types/                  # TypeScript type definitions
│   ├── utils/                  # Utility functions
│   ├── templates/              # Template files for generation
│   └── index.ts               # Server entry point
├── tests/                      # Test suites
├── logs/                      # Log files
├── workspace/                 # Working directory for projects
├── dist/                      # Compiled JavaScript output
└── docs/                      # Documentation
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

## 🚦 Current Status & Next Steps

### Phase 1: Core Infrastructure ✅ Complete
- [x] Project structure and configuration
- [x] MCP server foundation
- [x] Configuration management
- [x] Structured logging system
- [x] Type definitions and schemas

### Phase 2: Tool Implementation 🚧 In Progress
- [ ] SpecKit workflow tools (/specify, /plan, /tasks)
- [ ] Open Lovable scraping integration
- [ ] Sandbox management layer
- [ ] AI-powered code generation

### Phase 3: Advanced Features 📋 Planned
- [ ] Hybrid workflow tools
- [ ] State persistence and management
- [ ] Advanced error handling
- [ ] Performance optimization

### Phase 4: Testing & Deployment 📋 Planned
- [ ] Comprehensive testing suite
- [ ] Warp integration testing
- [ ] Documentation completion
- [ ] Production deployment

## 📚 Technical Details

### Key Technologies

- **MCP SDK**: `@modelcontextprotocol/sdk` for server implementation
- **TypeScript**: Full type safety and modern language features
- **Zod**: Runtime schema validation for all tool inputs
- **Winston**: Structured logging with multiple transports
- **Firecrawl**: Web scraping and content extraction
- **Vercel AI SDK**: Multi-provider AI integration

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