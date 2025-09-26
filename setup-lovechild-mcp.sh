#!/bin/bash

# Setup script for LoveChild MCP Server
echo "🚀 Setting up LoveChild MCP Server for Warp..."
echo ""

# Get the absolute path to the script's directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_DIR="$SCRIPT_DIR/lovechild-mcp"

# Check if lovechild-mcp directory exists
if [ ! -d "$MCP_DIR" ]; then
    echo "❌ Error: lovechild-mcp directory not found at $MCP_DIR"
    exit 1
fi

# Navigate to MCP directory
cd "$MCP_DIR" || exit

echo "📦 Installing dependencies..."
npm install

echo ""
echo "🔨 Building the MCP server..."
npm run build

echo ""
echo "✅ Build complete!"
echo ""
echo "📋 Add this configuration to Warp MCP settings:"
echo "   (Settings → AI → Manage MCP servers)"
echo ""
echo "{"
echo "  \"LoveChild-Warp-Native\": {"
echo "    \"command\": \"node\","
echo "    \"args\": [\"start-warp-native.js\"],"
echo "    \"working_directory\": \"$MCP_DIR\""
echo "  }"
echo "}"
echo ""
echo "🎉 Setup complete! Copy the JSON above to your Warp MCP configuration."