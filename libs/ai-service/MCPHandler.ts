import { MCPRequest, MCPResponse } from './types';
import { AIService } from './AIService';

export class MCPHandler {
  constructor(private aiService: AIService) {}

  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { method, params, id } = request;

    try {
      switch (method) {
        case 'generate_sql':
          const { text, tableInfo } = params;
          const sql = await this.aiService.generateSQL(text, tableInfo);
          return {
            result: { sql },
            id
          };
        
        case 'health_check':
          const isHealthy = await this.aiService.healthCheck();
          return {
            result: { healthy: isHealthy },
            id
          };
        
        default:
          return {
            error: {
              code: 400,
              message: `Unknown method: ${method}`
            },
            id
          };
      }
    } catch (error: any) {
      return {
        error: {
          code: 500,
          message: error.message || 'Internal server error'
        },
        id
      };
    }
  }
}
