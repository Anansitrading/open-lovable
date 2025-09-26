# LoveChild MCP Suite 🚀

**Advanced AI Development Tools for Warp Terminal**

A comprehensive suite of Model Context Protocol (MCP) servers and tools that brings spec-driven development and multi-MCP orchestration directly to your Warp terminal - **no API keys required**.

## 🎯 What is LoveChild?

LoveChild is a Warp-native development ecosystem that:
- **Orchestrates Multiple MCPs**: Intelligently coordinates Perplexity, Linear, Context7, Vercel, and more
- **Zero Configuration**: Leverages Warp's infrastructure - no API keys or environment variables
- **Spec-Driven Development**: Structured workflows from specification to deployment
- **Complete Automation**: Multi-step workflows that handle entire development cycles

## 📦 Repository Contents

### 1. LoveChild MCP Server (`/lovechild-mcp`)
The core MCP server that provides:
- **SpecKit Tools**: `specify`, `plan`, `tasks`, `status` for structured development
- **Orchestration Engine**: Routes tasks to the best MCP automatically
- **Workflow Automation**: Complete bug fixes, feature development, and deployments
- **Warp Native**: Uses `warp agent run` for all LLM operations

[Full Documentation →](./lovechild-mcp/README.md)

### 2. Open Lovable Legacy (`/app`, `/components`, etc.)
The original Firecrawl-based React app builder that we've enhanced and integrated.

## 🚀 Quick Start

### Install LoveChild MCP in Warp

1. **Clone the Repository**
   ```bash
   git clone https://github.com/Anansitrading/lovechild-mcp.git
   cd lovechild-mcp/lovechild-mcp
   npm install && npm run build
   ```
   
   Or if already cloned:
   ```bash
   cd /home/david/projects/open-lovable/lovechild-mcp
   npm install && npm run build
   ```

2. **Add to Warp MCP Settings**
   
   Open Warp Settings → AI → Manage MCP servers and add:
   ```json
   {
     "LoveChild-Warp-Native": {
       "command": "node",
       "args": ["start-warp-native.js"],
       "working_directory": "/home/david/projects/open-lovable/lovechild-mcp"
     }
   }
   ```
   
   **Note:** Replace the working_directory path with your actual path to the lovechild-mcp subdirectory.

3. **Start Using** (No API Keys Needed!)
   ```bash
   # Create a specification
   specify "Build a task management app"
   
   # Fix a bug with full automation
   execute_workflow bug_fix_workflow "Login fails on mobile"
   
   # Research and implement
   route_task research "Best practices for React performance"
   ```

## 💫 Example Workflows

### Automated Bug Fix
```javascript
execute_workflow({
  workflow_name: "bug_fix_workflow",
  description: "Users can't upload images"
})
```
**Automatically:**
1. Analyzes the bug (POE/Claude)
2. Creates Linear issue (Team: Kijko, assigns to David)
3. Gets relevant docs (Context7)
4. Generates fix (POE/GPT-5)
5. Deploys preview (Vercel)
6. Marks complete (Linear)

### Feature Development
```javascript
execute_workflow({
  workflow_name: "complete_feature_development",
  description: "Add dark mode toggle"
})
```

## 🎮 Available Tools

### SpecKit Tools (Warp-Powered)
- `specify` - Generate comprehensive specifications
- `plan` - Create technical implementation plans
- `tasks` - Break down into actionable tasks
- `status` - Track workflow progress

### Orchestration Tools
- `route_task` - Intelligent MCP routing
- `execute_workflow` - Multi-step automation
- `list_available_mcps` - Discover capabilities
- `list_workflows` - See available workflows

## 🔌 Integrated MCPs

| MCP | Purpose | Example Usage |
|-----|---------|---------------|
| **Perplexity** | Research & Analysis | Best practices, documentation |
| **Linear** | Issue Tracking | Bug reports, feature tracking |
| **Context7** | Library Docs | API references, examples |
| **Vercel** | Deployment | Preview URLs, production deploys |
| **POE/Dart** | Code Generation | Implementation, fixes |

## 🏗️ Architecture

```
Warp Terminal
      ↓
LoveChild MCP Server
      ├── SpecKit Tools → Warp CLI (warp agent run)
      └── Orchestration → call_mcp_tool → Other MCPs
```

## 🤝 Contributing

We welcome contributions! Key areas:
- Additional MCP integrations
- New workflow templates
- Enhanced routing logic
- Documentation improvements

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🙏 Credits

- Built on the [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- Inspired by [Open Lovable](https://github.com/firecrawl/open-lovable) from Firecrawl
- Powered by [Warp Terminal](https://www.warp.dev/)'s native AI infrastructure

---

**LoveChild MCP** - Where specification meets automation in your terminal.
