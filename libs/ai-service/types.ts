export interface AIServiceConfig {
  apiKey: string;
  endpoint: string;
  model?: string;
  maxRetries?: number;
  sampleSize?: number;
}

export interface TableInfo {
  id: string;
  tableName: string;
  fields: FieldInfo[];
}

export interface FieldInfo {
  id: string;
  name: string;
  type: any; // Allow any type to accommodate Lark SDK FieldType enum
  description?: string;
}

export interface SampleData {
  [tableId: string]: any[];
}

export interface FieldValueAnalysis {
  fieldId: string;
  fieldName: string;
  fieldType: string;
  uniqueValues: string[];
  isTextField: boolean;
}

export interface QueryAnalysis {
  involvedFields: string[];
  textFieldValues: FieldValueAnalysis[];
}

export interface GenerateSQLRequest {
  text: string;
  tableInfo: TableInfo[];
  sampleData?: SampleData;
  previousSQL?: string;
  previousError?: string;
}

export interface EnhancedGenerateSQLRequest extends GenerateSQLRequest {
  queryAnalysis?: QueryAnalysis;
}

export interface GenerateSQLResponse {
  sql: string;
  confidence?: number;
  explanation?: string;
}

export interface SQLAttempt {
  attemptNumber: number;
  sql: string;
  result?: any[];
  resultCount: number;
  hasResult: boolean;
  error?: string;
  timestamp: number;
  description?: string;
  reasoning?: string;
  recommendation?: string;
  strategy?: string;
}

export interface SQLAlternative {
  sql: string;
  description: string;
  reasoning: string;
  recommendation: string;
  strategy: string;
}

export interface QueryProgress {
  step: number;
  stepName: string;
  description: string;
  status: 'running' | 'completed' | 'failed';
  timestamp?: number;
  data?: any;
}

export interface SQLGenerationResult {
  sql: string;
  result: any[];
  attempts: number;
  success: boolean;
  error?: string;
  history: SQLAttempt[];
  usedFieldAnalysis?: boolean;
  progress?: QueryProgress[];
  alternatives?: SQLAlternative[];
  recommendedIndex?: number;
}

export interface MCPRequest {
  method: string;
  params: any;
  id?: string;
}

export interface MCPResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
  };
  id?: string;
  jsonrpc?: string;
}

export interface MCPErrorResponse {
  jsonrpc: string;
  id: string;
  error: {
    code: string;
    message: string;
  };
}
