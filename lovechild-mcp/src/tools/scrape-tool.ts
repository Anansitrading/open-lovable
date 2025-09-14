import { ToolDefinition, ToolContext } from '../core/tool-registry.js';
import { ScrapeToolSchema, ScrapeInput, ScrapeResponse } from '../types/index.js';
import { createFirecrawlService, FirecrawlOptions } from '../integrations/firecrawl-service.js';

export const ScrapeTool: ToolDefinition = {
  name: 'scrape',
  description: 'Scrape website content using Firecrawl for context extraction and analysis. Supports both single page scraping and multi-page crawling.',
  schema: ScrapeToolSchema,
  handler: async (args: ScrapeInput, context: ToolContext): Promise<ScrapeResponse> => {
    const { url, includeImages, maxDepth, format } = args;
    const { correlationId, logger: contextLogger } = context;
    
    contextLogger.info('Starting scrape tool execution', {
      correlationId,
      url,
      format,
      includeImages,
      maxDepth
    });

    try {
      // Create Firecrawl service instance
      const firecrawl = createFirecrawlService(correlationId);
      
      // Prepare scraping options
      const options: FirecrawlOptions = {
        format: format || 'markdown',
        includeImages: includeImages || false,
        maxDepth: maxDepth || 1,
        timeout: 30000 // 30 second timeout
      };

      let result;
      
      if (maxDepth && maxDepth > 1) {
        // Multi-page crawling
        contextLogger.info('Starting multi-page crawl', {
          correlationId,
          url,
          maxDepth
        });
        
        const crawlResults = await firecrawl.crawlWebsite(url, {
          ...options,
          crawlerOptions: {
            limit: 10, // Limit to prevent excessive crawling
            excludes: [
              '.*\\.pdf$',
              '.*\\.jpg$',
              '.*\\.png$',
              '.*\\.gif$',
              '.*\\.css$',
              '.*\\.js$'
            ]
          }
        });

        if (crawlResults.length === 0) {
          throw new Error('No pages could be crawled from the provided URL');
        }

        // Combine results from multiple pages
        const combinedContent = crawlResults
          .map((page, index) => {
            const header = `# Page ${index + 1}: ${page.metadata.title || page.url}\n\n`;
            return header + page.content;
          })
          .join('\n\n---\n\n');

        // Combine metadata
        const combinedImages = crawlResults.flatMap(page => page.metadata.images || []);
        const combinedLinks = crawlResults.flatMap(page => page.metadata.links || []);

        result = {
          url,
          content: combinedContent,
          metadata: {
            title: crawlResults[0]?.metadata.title,
            description: crawlResults[0]?.metadata.description,
            images: [...new Set(combinedImages)].slice(0, 20), // Limit and deduplicate
            links: [...new Set(combinedLinks)].slice(0, 50), // Limit and deduplicate
            pagesCrawled: crawlResults.length,
            keywords: crawlResults[0]?.metadata.keywords,
            language: crawlResults[0]?.metadata.language
          }
        };

        contextLogger.info('Multi-page crawl completed', {
          correlationId,
          url,
          pagesCrawled: crawlResults.length,
          totalContentLength: combinedContent.length
        });

      } else {
        // Single page scraping
        contextLogger.info('Starting single page scrape', {
          correlationId,
          url
        });
        
        const scrapeResult = await firecrawl.scrapeUrl(url, options);
        
        if (!scrapeResult.success) {
          throw new Error(scrapeResult.metadata.error || 'Failed to scrape the URL');
        }

        result = {
          url: scrapeResult.url,
          content: scrapeResult.content,
          metadata: {
            title: scrapeResult.metadata.title,
            description: scrapeResult.metadata.description,
            images: scrapeResult.metadata.images,
            links: scrapeResult.metadata.links,
            keywords: scrapeResult.metadata.keywords,
            author: scrapeResult.metadata.author,
            publishedTime: scrapeResult.metadata.publishedTime,
            language: scrapeResult.metadata.language,
            statusCode: scrapeResult.metadata.statusCode
          }
        };

        contextLogger.info('Single page scrape completed', {
          correlationId,
          url,
          contentLength: result.content.length,
          title: result.metadata.title
        });
      }

      // Validate content
      if (!result.content || result.content.trim().length === 0) {
        contextLogger.warn('Scraped content is empty', {
          correlationId,
          url,
          metadata: result.metadata
        });
        
        throw new Error('No content could be extracted from the URL. The page may be JavaScript-heavy or protected.');
      }

      // Truncate content if too long (keep first 50KB for context)
      if (result.content.length > 50000) {
        const truncatedContent = result.content.substring(0, 50000) + '\n\n... [Content truncated due to length]';
        
        contextLogger.info('Content truncated for context size', {
          correlationId,
          originalLength: result.content.length,
          truncatedLength: truncatedContent.length
        });
        
        result.content = truncatedContent;
      }

      return {
        success: true,
        data: result,
        metadata: {
          executionTime: 0, // Will be filled by server
          timestamp: new Date(),
          version: '1.0.0'
        }
      };

    } catch (error) {
      contextLogger.error('Scrape tool execution failed', {
        correlationId,
        url,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: `Failed to scrape URL: ${error instanceof Error ? error.message : String(error)}`,
        metadata: {
          executionTime: 0,
          timestamp: new Date(),
          version: '1.0.0'
        }
      };
    }
  }
};