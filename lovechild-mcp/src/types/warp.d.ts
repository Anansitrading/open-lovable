/**
 * Global type declarations for Warp MCP environment
 * These functions are available when running within Warp's MCP context
 */

declare global {
  /**
   * Call another MCP server's tool through Warp's infrastructure
   * @param name - The name of the MCP server to call
   * @param input - JSON string containing the tool parameters
   * @returns Promise with the result from the MCP tool
   */
  function call_mcp_tool(name: string, input: string): Promise<any>;
}

export {};