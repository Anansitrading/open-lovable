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

### Install LoveChild MCP in Warp (Linux)

1. **Clone and Build**
   ```bash
   git clone https://github.com/Anansitrading/lovechild-mcp.git
   cd lovechild-mcp/lovechild-mcp
   npm install && npm run build
   ```
   
   **Or use the automated setup script:**
   ```bash
   cd lovechild-mcp
   ./setup-lovechild-mcp.sh
   # This will build and output the exact config for your system
   ```

2. **Configure in Warp**
   
   Open Warp Settings → AI → Manage MCP servers → Add New Server
   
   **Linux Configuration (paste exactly):**
   ```json
   {
     "LoveChild-Warp-Native": {
       "command": "node",
       "args": ["start-warp-native.js"],
       "working_directory": "/absolute/path/to/lovechild-mcp/lovechild-mcp"
     }
   }
   ```
   
   **Important Linux Notes:**
   - Use absolute paths (starting with `/`)
   - The `lovechild-mcp` subdirectory contains the MCP server
   - No environment variables or API keys needed
   - Warp handles the server lifecycle automatically

3. **Verify Installation**
   
   After adding to Warp, restart Warp or reload MCP servers, then test:
   ```bash
   # In Warp, these commands should now work:
   list_available_mcps      # Shows integrated MCPs
   list_workflows           # Shows available workflows
   specify "Build an app"   # Generate specification
   ```

4. **Troubleshooting Linux Issues**
   
   If the server doesn't connect:
   - Check logs: `tail -f ~/.local/state/warp-terminal/mcp/*.log`
   - Ensure Node.js 18+ is installed: `node --version`
   - Verify build: `cd lovechild-mcp && npm run build`
   - Test manually: `cd lovechild-mcp && node start-warp-native.js`

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

## 🔧 Linux Setup & Troubleshooting

### System Requirements
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Warp Terminal**: Latest version with MCP support
- **OS**: Ubuntu 20.04+, Debian 11+, Fedora 35+, or compatible (tested on Zorin OS)

### Common Linux Issues & Solutions

**1. Server fails with "Cannot read properties of undefined"**
- **Cause**: Old MCP SDK API usage
- **Fix**: Ensure you have the latest code with proper schema imports

**2. "Permission denied" when running setup script**
```bash
chmod +x setup-lovechild-mcp.sh
./setup-lovechild-mcp.sh
```

**3. Server starts but Warp doesn't connect**
- Restart Warp completely: `pkill warp && warp`
- Check logs: `tail -f ~/.local/state/warp-terminal/mcp/*.log`
- Remove and re-add the MCP server configuration

**4. "Module not found" errors**
```bash
cd lovechild-mcp
rm -rf node_modules package-lock.json
npm install
npm run build
```

**5. Finding the correct log file**
```bash
# List all MCP logs
ls -la ~/.local/state/warp-terminal/mcp/
# Watch the most recent log
tail -f ~/.local/state/warp-terminal/mcp/$(ls -t ~/.local/state/warp-terminal/mcp/ | head -1)
```

### Verified Working On
- ✅ Zorin OS 17
- ✅ Ubuntu 22.04 LTS
- ✅ Pop!_OS 22.04
- ✅ Fedora 39

## 🤝 Contributing

We welcome contributions! Key areas:
- Additional MCP integrations
- New workflow templates
- Enhanced routing logic
- Documentation improvements
- Linux distribution testing

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🙏 Credits

- Built on the [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- Inspired by [Open Lovable](https://github.com/firecrawl/open-lovable) from Firecrawl
- Powered by [Warp Terminal](https://www.warp.dev/)'s native AI infrastructure

---

**LoveChild MCP** - Where specification meets automation in your terminal.
