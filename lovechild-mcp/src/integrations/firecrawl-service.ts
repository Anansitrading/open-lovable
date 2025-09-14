import FirecrawlApp from '@mendable/firecrawl-js';
import { logger } from '../core/logger.js';
import { configManager } from '../core/config.js';
import { LoveChildError } from '../types/index.js';

export interface FirecrawlOptions {
  includeImages?: boolean;
  maxDepth?: number;
  format?: 'markdown' | 'json';
  timeout?: number;
  extractorOptions?: {
    mode?: 'llm-extraction' | 'llm-extraction-from-markdown';
    extractionPrompt?: string;
    extractionSchema?: Record<string, any>;
  };
  crawlerOptions?: {
    returnOnlyUrls?: boolean;
    includes?: string[];
    excludes?: string[];
    limit?: number;
  };
}

export interface FirecrawlResult {
  success: boolean;
  url: string;
  content: string;
  metadata: {
    title?: string;
    description?: string;
    keywords?: string[];
    author?: string;
    publishedTime?: string;
    images?: string[];
    links?: string[];
    language?: string;
    statusCode?: number;
    error?: string;
  };
  rawData?: any;
}

export class FirecrawlService {
  private app: FirecrawlApp | null = null;
  private correlationId: string;
  private initialized = false;

  constructor(correlationId?: string) {
    this.correlationId = correlationId || 'firecrawl-service';
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const config = configManager.getConfig();
      
      if (!config.integrations.firecrawl?.apiKey) {
        throw new LoveChildError(
          'Firecrawl API key not configured. Please set FIRECRAWL_API_KEY environment variable.',
          'FIRECRAWL_NOT_CONFIGURED'
        );
      }

      this.app = new FirecrawlApp({ 
        apiKey: config.integrations.firecrawl.apiKey 
      });
      
      this.initialized = true;
      
      logger.info('Firecrawl service initialized', {
        correlationId: this.correlationId,
        baseUrl: config.integrations.firecrawl.baseUrl || 'https://api.firecrawl.dev'
      });

    } catch (error) {
      logger.error('Failed to initialize Firecrawl service', {
        correlationId: this.correlationId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async scrapeUrl(url: string, options: FirecrawlOptions = {}): Promise<FirecrawlResult> {
    await this.initialize();

    if (!this.app) {
      throw new LoveChildError('Firecrawl service not properly initialized', 'FIRECRAWL_NOT_INITIALIZED');
    }

    const timer = logger.startTimer('firecrawl-scrape');
    
    logger.info('Starting Firecrawl scrape', {
      correlationId: this.correlationId,
      url,
      options: {
        format: options.format || 'markdown',
        includeImages: options.includeImages || false,
        maxDepth: options.maxDepth || 1
      }
    });

    try {
      // Prepare Firecrawl scrape parameters
      const scrapeParams: any = {
        formats: [options.format || 'markdown'],
        onlyMainContent: true,
        includeTags: options.includeImages ? ['img'] : [],
        timeout: options.timeout || 30000
      };

      // Add extractor options if provided
      if (options.extractorOptions) {
        scrapeParams.extract = {
          schema: options.extractorOptions.extractionSchema,
          prompt: options.extractorOptions.extractionPrompt,
          systemPrompt: "You are a helpful assistant that extracts structured data from web pages."
        };
      }

      const scrapeResponse = await this.app.scrape(url, scrapeParams);
      const executionTime = timer();

      // The scrapeResponse is directly the document, not wrapped in success/data
      if (!scrapeResponse || !scrapeResponse.markdown) {
        throw new LoveChildError(
          `Firecrawl scraping failed: No content returned`,
          'FIRECRAWL_SCRAPE_FAILED',
          { url, response: scrapeResponse }
        );
      }

      const result: FirecrawlResult = {
        success: true,
        url,
        content: scrapeResponse.markdown || '',
        metadata: {
          title: scrapeResponse.metadata?.title as string,
          description: scrapeResponse.metadata?.description as string,
          keywords: Array.isArray(scrapeResponse.metadata?.keywords) 
            ? scrapeResponse.metadata.keywords 
            : typeof scrapeResponse.metadata?.keywords === 'string'
              ? [scrapeResponse.metadata.keywords]
              : undefined,
          author: scrapeResponse.metadata?.author as string,
          publishedTime: scrapeResponse.metadata?.publishedTime as string,
          images: this.extractImages(scrapeResponse),
          links: this.extractLinks(scrapeResponse),
          language: scrapeResponse.metadata?.language as string,
          statusCode: scrapeResponse.metadata?.statusCode as number
        },
        rawData: scrapeResponse
      };

      logger.info('Firecrawl scrape completed successfully', {
        correlationId: this.correlationId,
        url,
        executionTime,
        contentLength: result.content.length,
        title: result.metadata.title,
        imageCount: result.metadata.images?.length || 0,
        linkCount: result.metadata.links?.length || 0
      });

      return result;

    } catch (error) {
      const executionTime = timer();
      
      logger.error('Firecrawl scrape failed', {
        correlationId: this.correlationId,
        url,
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        url,
        content: '',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          statusCode: (error as any)?.statusCode
        }
      };
    }
  }

  async crawlWebsite(url: string, options: FirecrawlOptions = {}): Promise<FirecrawlResult[]> {
    // For now, just do a single page scrape for simplicity
    // Multi-page crawling can be implemented later once we have the API figured out
    logger.info('Multi-page crawling requested, falling back to single page scrape', {
      correlationId: this.correlationId,
      url
    });
    
    const singleResult = await this.scrapeUrl(url, options);
    return singleResult.success ? [singleResult] : [];
  }

  private extractImages(data: any): string[] {
    const images: string[] = [];
    
    if (data?.metadata?.ogImage) {
      images.push(data.metadata.ogImage);
    }
    
    // Extract images from HTML if available
    if (data?.html) {
      const imgRegex = /<img[^>]+src="([^">]+)"/gi;
      let match;
      while ((match = imgRegex.exec(data.html)) !== null) {
        images.push(match[1]);
      }
    }
    
    return [...new Set(images)]; // Remove duplicates
  }

  private extractLinks(data: any): string[] {
    const links: string[] = [];
    
    // Extract links from HTML if available
    if (data?.html) {
      const linkRegex = /<a[^>]+href="([^">]+)"/gi;
      let match;
      while ((match = linkRegex.exec(data.html)) !== null) {
        const href = match[1];
        if (href.startsWith('http') || href.startsWith('/')) {
          links.push(href);
        }
      }
    }
    
    return [...new Set(links)].slice(0, 50); // Limit and remove duplicates
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.initialize();
      return this.initialized && this.app !== null;
    } catch (error) {
      return false;
    }
  }

  // Health check method
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy', details: any }> {
    const details: any = {
      initialized: this.initialized,
      hasApiKey: !!configManager.getConfig().integrations.firecrawl?.apiKey,
      timestamp: new Date().toISOString()
    };

    try {
      await this.initialize();
      
      // Test with a simple scrape
      const testUrl = 'https://example.com';
      const testResult = await this.scrapeUrl(testUrl, { format: 'markdown', timeout: 5000 });
      
      details.testScrape = {
        success: testResult.success,
        contentLength: testResult.content.length
      };

      logger.info('Firecrawl health check passed', {
        correlationId: this.correlationId,
        details
      });

      return { status: 'healthy', details };

    } catch (error) {
      details.error = error instanceof Error ? error.message : String(error);
      
      logger.warn('Firecrawl health check failed', {
        correlationId: this.correlationId,
        details
      });

      return { status: 'unhealthy', details };
    }
  }

  // Cleanup method
  cleanup(): void {
    logger.info('Cleaning up Firecrawl service', {
      correlationId: this.correlationId
    });
    
    this.app = null;
    this.initialized = false;
  }
}

// Factory function for creating service instances
export function createFirecrawlService(correlationId?: string): FirecrawlService {
  return new FirecrawlService(correlationId);
}