import { config } from 'dotenv';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { LoveChildConfig, LoveChildConfigSchema, ConfigurationError } from '../types/index.js';

// Load environment variables
config();

export class ConfigManager {
  private static instance: ConfigManager;
  private _config: LoveChildConfig | null = null;

  private constructor() {}

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  async loadConfig(configPath?: string): Promise<LoveChildConfig> {
    try {
      // First try to load from file if specified
      if (configPath && await fs.pathExists(configPath)) {
        const configData = await fs.readJSON(configPath);
        const merged = this.mergeWithEnvironment(configData);
        this._config = LoveChildConfigSchema.parse(merged);
        return this._config;
      }

      // Otherwise build config from environment
      this._config = this.buildConfigFromEnvironment();
      return this._config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        throw new ConfigurationError(`Invalid configuration: ${details}`, error.errors);
      }
      throw new ConfigurationError(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
    }
  }

  getConfig(): LoveChildConfig {
    if (!this._config) {
      throw new ConfigurationError('Configuration not loaded. Call loadConfig() first.');
    }
    return this._config;
  }

  private buildConfigFromEnvironment(): LoveChildConfig {
    // Build AI providers config
    const providers: any = {};
    if (process.env.ANTHROPIC_API_KEY) {
      providers.anthropic = { apiKey: process.env.ANTHROPIC_API_KEY };
    }
    if (process.env.OPENAI_API_KEY) {
      providers.openai = { apiKey: process.env.OPENAI_API_KEY };
    }
    if (process.env.GROQ_API_KEY) {
      providers.groq = { apiKey: process.env.GROQ_API_KEY };
    }

    // Validate at least one AI provider is configured
    if (Object.keys(providers).length === 0) {
      throw new ConfigurationError('At least one AI provider must be configured (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY)');
    }

    // Build sandbox config
    const sandboxProvider = (process.env.SANDBOX_PROVIDER as 'e2b' | 'vercel') || 'vercel';
    const sandboxConfig: any = {};
    
    if (sandboxProvider === 'e2b') {
      if (!process.env.E2B_API_KEY) {
        throw new ConfigurationError('E2B_API_KEY is required when using E2B sandbox provider');
      }
      sandboxConfig.e2b = {
        apiKey: process.env.E2B_API_KEY,
        timeoutMs: parseInt(process.env.E2B_TIMEOUT || '300000'),
        template: process.env.E2B_TEMPLATE || 'nodejs',
      };
    } else {
      // Vercel sandbox config
      const vercelConfig: any = {
        authMethod: process.env.VERCEL_AUTH_METHOD || 'oidc',
      };
      
      if (process.env.VERCEL_OIDC_TOKEN) {
        // OIDC method - preferred
        vercelConfig.oidcToken = process.env.VERCEL_OIDC_TOKEN;
      } else if (process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID && process.env.VERCEL_PROJECT_ID) {
        // PAT method
        vercelConfig.token = process.env.VERCEL_TOKEN;
        vercelConfig.teamId = process.env.VERCEL_TEAM_ID;
        vercelConfig.projectId = process.env.VERCEL_PROJECT_ID;
      } else {
        throw new ConfigurationError('Vercel sandbox requires either VERCEL_OIDC_TOKEN or (VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID)');
      }
      
      sandboxConfig.vercel = vercelConfig;
    }

    // Validate Firecrawl API key
    if (!process.env.FIRECRAWL_API_KEY) {
      throw new ConfigurationError('FIRECRAWL_API_KEY is required for web scraping functionality');
    }

    // Validate E2B API key (optional for now, will be required when E2B tools are used)
    const hasE2B = !!process.env.E2B_API_KEY;
    if (!hasE2B) {
      // Log warning but don't fail - E2B is optional until user tries to use sandbox features
      console.warn('Warning: E2B_API_KEY not configured. Sandbox features will not be available.');
    }

    return {
      ai: {
        defaultProvider: (process.env.DEFAULT_AI_PROVIDER as 'anthropic' | 'openai' | 'groq') || 'anthropic',
        providers,
      },
      sandbox: {
        provider: sandboxProvider,
        config: sandboxConfig,
      },
      integrations: {
        firecrawl: {
          apiKey: process.env.FIRECRAWL_API_KEY,
          baseUrl: process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev',
        },
        e2b: {
          apiKey: process.env.E2B_API_KEY || '',
          defaultTemplate: process.env.E2B_TEMPLATE || 'nodejs',
          timeoutMs: parseInt(process.env.E2B_TIMEOUT || '300000'),
          maxSessions: parseInt(process.env.E2B_MAX_SESSIONS || '5'),
          keepAliveMs: parseInt(process.env.E2B_KEEP_ALIVE || '600000'),
        },
      },
      workspace: {
        directory: process.env.WORKSPACE_DIR || './workspace',
        autoSave: process.env.AUTO_SAVE !== 'false',
      },
      logging: {
        level: (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info',
        file: process.env.LOG_FILE,
      },
    };
  }

  private mergeWithEnvironment(fileConfig: any): any {
    // Merge file config with environment variables
    // Environment variables take precedence
    const envConfig = this.buildConfigFromEnvironment();
    return this.deepMerge(fileConfig, envConfig);
  }

  private deepMerge(target: any, source: any): any {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  }

  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  async saveConfig(configPath: string, config?: LoveChildConfig): Promise<void> {
    const configToSave = config || this._config;
    if (!configToSave) {
      throw new ConfigurationError('No configuration to save');
    }

    try {
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJSON(configPath, configToSave, { spaces: 2 });
    } catch (error) {
      throw new ConfigurationError(`Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
    }
  }

  validateConfiguration(): void {
    const config = this.getConfig();
    
    // Validate AI providers
    const availableProviders = Object.keys(config.ai.providers);
    if (!availableProviders.includes(config.ai.defaultProvider)) {
      throw new ConfigurationError(`Default AI provider '${config.ai.defaultProvider}' is not configured`);
    }

    // Validate sandbox provider
    if (config.sandbox.provider === 'e2b' && !config.sandbox.config.e2b) {
      throw new ConfigurationError('E2B configuration is missing');
    }
    if (config.sandbox.provider === 'vercel' && !config.sandbox.config.vercel) {
      throw new ConfigurationError('Vercel configuration is missing');
    }

    // Validate workspace directory exists or can be created
    try {
      fs.ensureDirSync(config.workspace.directory);
    } catch (error) {
      throw new ConfigurationError(`Cannot access or create workspace directory: ${config.workspace.directory}`);
    }
  }

  getAIProviderConfig(provider?: string) {
    const config = this.getConfig();
    const selectedProvider = provider || config.ai.defaultProvider;
    
    const providerConfig = config.ai.providers[selectedProvider as keyof typeof config.ai.providers];
    if (!providerConfig) {
      throw new ConfigurationError(`AI provider '${selectedProvider}' is not configured`);
    }
    
    return { provider: selectedProvider, ...providerConfig };
  }

  getSandboxConfig() {
    const config = this.getConfig();
    const providerConfig = config.sandbox.config[config.sandbox.provider];
    
    if (!providerConfig) {
      throw new ConfigurationError(`Sandbox provider '${config.sandbox.provider}' is not configured`);
    }
    
    return { provider: config.sandbox.provider, ...providerConfig };
  }

  getWorkspaceDir(): string {
    return this.getConfig().workspace.directory;
  }

  isDebugEnabled(): boolean {
    return process.env.DEBUG === 'true' || this.getConfig().logging?.level === 'debug';
  }

  isVerboseEnabled(): boolean {
    return process.env.VERBOSE === 'true';
  }
}

// Export singleton instance
export const configManager = ConfigManager.getInstance();