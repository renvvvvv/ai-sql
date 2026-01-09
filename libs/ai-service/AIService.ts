import { AIServiceConfig, GenerateSQLRequest, GenerateSQLResponse, TableInfo, SampleData, SQLGenerationResult, SQLAttempt, QueryAnalysis, FieldValueAnalysis, EnhancedGenerateSQLRequest, QueryProgress } from './types';
import { AISmartMultiTableService } from './AISmartMultiTableService';
import logger from '../../utils/logger';

export class AIService {
  private apiKey: string;
  private endpoint: string;
  private model?: string;
  private maxRetries: number;
  private sampleSize: number;
  private smartMultiTableService: AISmartMultiTableService;

  constructor(config: AIServiceConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint;
    this.model = config.model;
    this.maxRetries = config.maxRetries || 3;
    this.sampleSize = config.sampleSize || 5;
    
    // 初始化智能多表服务
    this.smartMultiTableService = new AISmartMultiTableService(config);
  }

  /**
   * 智能多表联查SQL生成 - 采用全AI驱动的三步流程
   * 第一步：AI字段分析
   * 第二步：AI样例数据分析  
   * 第三步：AI生成多方案
   */
  async generateMultiTableSQL(
    text: string, 
    tableInfo: TableInfo[], 
    getSampleData: (tableId: string, limit: number) => Promise<any[]>,
    executeSQL: (sql: string) => Promise<any[]>,
    analyzeQueryFields?: (query: string, tableInfo: TableInfo[]) => Promise<QueryAnalysis>,
    onProgress?: (progress: QueryProgress) => void
  ): Promise<SQLGenerationResult> {
    logger.log('ai_request', { text, mode: 'smart-multi-table-ai-driven' }, '开始AI驱动的智能多表联查');
    
    // 使用新的智能多表服务
    return await this.smartMultiTableService.generateSmartMultiTableSQL(
      text,
      tableInfo,
      getSampleData,
      executeSQL,
      onProgress
    );
  }

  /**
   * 分析表格间的关联关系
   */
  private analyzeTableRelations(tableInfo: TableInfo[]): string {
    const relations: string[] = [];
    
    // 分析相同字段名的表格
    const fieldGroups = new Map<string, string[]>();
    
    tableInfo.forEach(table => {
      table.fields.forEach(field => {
        if (!fieldGroups.has(field.name)) {
          fieldGroups.set(field.name, []);
        }
        fieldGroups.get(field.name)!.push(`${table.tableName}(${table.id})`);
      });
    });
    
    // 找出共同字段
    fieldGroups.forEach((tables, fieldName) => {
      if (tables.length > 1) {
        relations.push(`字段"${fieldName}"存在于: ${tables.join(', ')}`);
      }
    });
    
    // 分析可能的关联字段
    const commonFields = ['ID', 'id', '编号', '名称', '区域', '部门', '项目', '客户', '订单'];
    commonFields.forEach(commonField => {
      const matchingTables = tableInfo.filter(table => 
        table.fields.some(field => 
          field.name.includes(commonField) || 
          field.name.toLowerCase().includes(commonField.toLowerCase())
        )
      );
      
      if (matchingTables.length > 1) {
        relations.push(`潜在关联字段"${commonField}": ${matchingTables.map(t => t.tableName).join(', ')}`);
      }
    });
    
    return relations.length > 0 
      ? relations.join('\n') 
      : '未发现明显的表格关联关系，建议使用UNION合并相似数据';
  }
  async generateSQLWithSamples(
    text: string, 
    tableInfo: TableInfo[], 
    getSampleData: (tableId: string, limit: number) => Promise<any[]>,
    executeSQL: (sql: string) => Promise<any[]>,
    analyzeQueryFields?: (query: string, tableInfo: TableInfo[]) => Promise<QueryAnalysis>
  ): Promise<SQLGenerationResult> {
    logger.log('ai_request', { text, maxRetries: this.maxRetries }, '开始智能SQL生成');
    
    let attempts = 0;
    let lastSQL = '';
    let lastError = '';
    const history: SQLAttempt[] = [];
    let queryAnalysis: QueryAnalysis | undefined;
    
    // 第一步：分析查询涉及的字段
    if (analyzeQueryFields) {
      try {
        queryAnalysis = await analyzeQueryFields(text, tableInfo);
        logger.log('field_analysis', {
          involvedFieldCount: queryAnalysis.involvedFields.length,
          textFieldCount: queryAnalysis.textFieldValues.length,
          textFields: queryAnalysis.textFieldValues.map(f => ({
            name: f.fieldName,
            uniqueValueCount: f.uniqueValues.length
          }))
        }, '字段分析完成');
      } catch (error) {
        logger.log('field_analysis', {
          error: error instanceof Error ? error.message : String(error)
        }, '字段分析失败，继续使用基础方法');
      }
    }
    
    while (attempts < this.maxRetries) {
      attempts++;
      const attemptStartTime = Date.now();
      
      try {
        let sql: string;
        
        // 第一次尝试：使用字段值归一化的基础SQL生成
        if (attempts === 1) {
          sql = await this.generateSQLWithFieldAnalysis(text, tableInfo, queryAnalysis);
        } 
        // 后续尝试：结合样本数据和字段值分析
        else {
          const sampleData = await this.collectSampleData(tableInfo, getSampleData);
          sql = await this.generateSQLWithGuidance(text, tableInfo, sampleData, lastSQL, lastError, queryAnalysis);
        }
        
        const result = await executeSQL(sql);
        const resultCount = result.length;
        const hasResult = resultCount > 0;
        
        // 记录本次尝试的历史
        const attempt: SQLAttempt = {
          attemptNumber: attempts,
          sql,
          resultCount,
          hasResult,
          timestamp: attemptStartTime
        };
        
        if (!hasResult) {
          attempt.error = '查询结果为空';
        }
        
        history.push(attempt);
        
        if (hasResult) {
          logger.log('ai_response', { 
            sql, 
            resultCount, 
            attempts,
            usedFieldAnalysis: !!queryAnalysis
          }, `SQL生成成功（第${attempts}次尝试）`);
          
          return {
            sql,
            result,
            attempts,
            success: true,
            history
          };
        }
        
        lastSQL = sql;
        lastError = '查询结果为空';
        logger.log('ai_response', { sql, attempts, error: lastError }, 'SQL生成失败，准备重试');
        
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        
        // 记录失败的尝试
        const attempt: SQLAttempt = {
          attemptNumber: attempts,
          sql: lastSQL,
          result: [],
          resultCount: 0,
          hasResult: false,
          error: lastError,
          timestamp: attemptStartTime
        };
        
        history.push(attempt);
        logger.log('ai_response', { attempts, error: lastError }, 'SQL执行出错');
      }
    }
    
    // 所有尝试都失败
    logger.log('ai_response', { 
      attempts, 
      finalError: lastError,
      success: false 
    }, 'SQL生成最终失败');
    
    return {
      sql: lastSQL,
      result: [],
      attempts,
      success: false,
      error: lastError,
      history
    };
  }

  /**
   * 基于字段值分析生成SQL
   */
  private async generateSQLWithFieldAnalysis(
    text: string,
    tableInfo: TableInfo[],
    queryAnalysis?: QueryAnalysis
  ): Promise<string> {
    const request: EnhancedGenerateSQLRequest = {
      text,
      tableInfo,
      queryAnalysis
    };

    const enhancedPrompt = this.buildFieldAnalysisPrompt(request);
    
    logger.log('ai_request', {
      endpoint: this.endpoint,
      model: this.model,
      hasFieldAnalysis: !!queryAnalysis,
      textFieldCount: queryAnalysis?.textFieldValues.length || 0
    }, 'AI模型请求（字段值分析）');

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: enhancedPrompt
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.1,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        throw new Error(`AI API request failed with status ${response.status}`);
      }

      const data: any = await response.json();
      const sql = this.extractSQL(data.choices[0].message.content);
      
      logger.log('ai_response', {
        status: response.status,
        statusText: response.statusText
      }, 'AI模型响应状态');
      
      logger.log('ai_response', {
        sql
      }, '生成的SQL语句（字段值分析）');

      return sql;
    } catch (error) {
      logger.log('ai_response', {
        error: error instanceof Error ? error.message : String(error)
      }, 'AI模型请求失败');
      
      throw new Error('Failed to generate SQL with field analysis. Please check your API configuration and try again.');
    }
  }

  /**
   * 构建字段值分析的提示词
   */
  private buildFieldAnalysisPrompt(request: EnhancedGenerateSQLRequest): string {
    let prompt = `你是一个SQL生成专家，请根据以下表格信息和用户的自然语言查询生成准确的SQL语句。

表格信息：
${JSON.stringify(request.tableInfo, null, 2)}`;

    // 添加字段值分析信息
    if (request.queryAnalysis && request.queryAnalysis.textFieldValues.length > 0) {
      prompt += `\n\n字段值归一化信息（用于精确匹配）：`;
      for (const fieldAnalysis of request.queryAnalysis.textFieldValues) {
        prompt += `\n字段 "${fieldAnalysis.fieldName}" (${fieldAnalysis.fieldId}) 的所有可能值：
${JSON.stringify(fieldAnalysis.uniqueValues, null, 2)}

请根据用户查询中的关键词，从上述值中选择最匹配的进行精确匹配或模糊匹配。`;
      }
      
      prompt += `\n\n重要提示：
1. 优先使用字段的实际值进行匹配，而不是用户输入的原始词汇
2. 如果用户查询的词汇与字段值不完全匹配，选择最相似的字段值
3. 可以使用 IN 操作符来匹配多个相似的值
4. 对于品牌、型号等字段，注意中英文、大小写、格式差异`;
    }

    prompt += `\n\n请严格按照以下要求生成SQL：
1. 只生成SQL语句，不要添加任何解释或说明
2. 表名使用表格的id字段
3. 字段名使用字段的id字段
4. SQL语句要符合SQL标准语法
5. 确保生成的SQL能正确执行
6. 优先使用提供的字段实际值进行精确匹配`;

    return prompt;
  }

  /**
   * 智能SQL生成 - 仅使用字段值归一化（不使用样本数据）
   */
  async generateSQLWithFieldAnalysisOnly(
    text: string, 
    tableInfo: TableInfo[], 
    executeSQL: (sql: string) => Promise<any[]>,
    analyzeQueryFields?: (query: string, tableInfo: TableInfo[]) => Promise<QueryAnalysis>,
    onProgress?: (progress: QueryProgress) => void
  ): Promise<SQLGenerationResult> {
    logger.log('ai_request', { text, maxRetries: this.maxRetries }, '开始智能SQL生成（仅字段值归一化）');
    
    const progressHistory: QueryProgress[] = [];
    const addProgress = (step: number, stepName: string, description: string, data?: any) => {
      const progress: QueryProgress = {
        step,
        stepName,
        description,
        status: 'running',
        timestamp: Date.now(),
        data
      };
      progressHistory.push(progress);
      if (onProgress) {
        onProgress(progress);
      }
    };

    let attempts = 0;
    let lastSQL = '';
    let lastError = '';
    const history: SQLAttempt[] = [];
    let queryAnalysis: QueryAnalysis | undefined;
    
    // 第一步：分析查询涉及的字段
    addProgress(1, '字段分析', '正在分析查询涉及的字段...');
    
    if (analyzeQueryFields) {
      try {
        queryAnalysis = await analyzeQueryFields(text, tableInfo);
        
        addProgress(1, '字段分析', '字段分析完成', {
          involvedFieldCount: queryAnalysis.involvedFields.length,
          textFieldCount: queryAnalysis.textFieldValues.length,
          textFields: queryAnalysis.textFieldValues.map(f => ({
            name: f.fieldName,
            uniqueValueCount: f.uniqueValues.length
          }))
        });
        
        logger.log('field_analysis', {
          involvedFieldCount: queryAnalysis.involvedFields.length,
          textFieldCount: queryAnalysis.textFieldValues.length,
          textFields: queryAnalysis.textFieldValues.map(f => ({
            name: f.fieldName,
            uniqueValueCount: f.uniqueValues.length
          }))
        }, '字段分析完成');
      } catch (error) {
        addProgress(1, '字段分析', '字段分析失败，使用基础方法', {
          error: error instanceof Error ? error.message : String(error)
        });
        
        logger.log('field_analysis', {
          error: error instanceof Error ? error.message : String(error)
        }, '字段分析失败，继续使用基础方法');
      }
    } else {
      addProgress(1, '字段分析', '跳过字段分析');
    }
    
    while (attempts < this.maxRetries) {
      attempts++;
      const attemptStartTime = Date.now();
      
      // 添加生成进度
      const generateMessage = attempts === 1 
        ? (queryAnalysis ? '基于字段值归一化生成SQL...' : '使用基础方法生成SQL...')
        : `第${attempts}次重试：使用基础方法生成SQL...`;
      
      addProgress(2, `第${attempts}次尝试`, generateMessage);
      
      try {
        let sql: string;
        
        // 第一次尝试：使用字段值归一化的SQL生成
        if (attempts === 1) {
          sql = await this.generateSQLWithFieldValues(text, tableInfo, queryAnalysis);
        } 
        // 后续尝试：使用基础方法重试
        else {
          sql = await this.generateSQL(text, tableInfo);
        }
        
        addProgress(2, `第${attempts}次尝试`, 'SQL生成完成', { sql });
        
        // 添加执行进度
        addProgress(3, `第${attempts}次尝试`, '正在执行SQL查询...');
        
        const result = await executeSQL(sql);
        const resultCount = result.length;
        const hasResult = resultCount > 0;
        
        // 记录本次尝试的历史
        const attempt: SQLAttempt = {
          attemptNumber: attempts,
          sql,
          resultCount,
          hasResult: hasResult,
          timestamp: attemptStartTime
        };
        
        if (!hasResult) {
          attempt.error = '查询结果为空';
          addProgress(3, `第${attempts}次尝试`, `查询执行完成，但结果为空`, { resultCount: 0 });
        } else {
          addProgress(3, `第${attempts}次尝试`, `查询执行成功`, { resultCount });
        }
        
        history.push(attempt);
        
        if (hasResult) {
          addProgress(4, '查询完成', `SQL生成成功，共尝试${attempts}次，返回${resultCount}条记录`);
          
          logger.log('ai_response', { 
            sql, 
            resultCount, 
            attempts,
            usedFieldAnalysis: attempts === 1 && !!queryAnalysis
          }, `SQL生成成功（第${attempts}次尝试）`);
          
          return {
            sql,
            result,
            attempts,
            success: true,
            history,
            progress: progressHistory
          };
        }
        
        lastSQL = sql;
        lastError = '查询结果为空';
        logger.log('ai_response', { sql, attempts, error: lastError }, 'SQL生成失败，准备重试');
        
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        
        addProgress(3, `第${attempts}次尝试`, `查询执行失败: ${lastError}`);
        
        // 记录失败的尝试
        const attempt: SQLAttempt = {
          attemptNumber: attempts,
          sql: lastSQL,
          result: [],
          resultCount: 0,
          hasResult: false,
          error: lastError,
          timestamp: attemptStartTime
        };
        
        history.push(attempt);
        logger.log('ai_response', { attempts, error: lastError }, 'SQL执行出错');
      }
    }
    
    // 所有尝试都失败
    addProgress(4, '查询失败', `所有尝试都失败，共尝试${attempts}次`);
    
    logger.log('ai_response', { 
      attempts, 
      finalError: lastError,
      success: false 
    }, 'SQL生成最终失败');
    
    return {
      sql: lastSQL,
      result: [],
      attempts,
      success: false,
      error: lastError,
      history,
      progress: progressHistory
    };
  }

  /**
   * 仅基于字段值分析生成SQL（不使用样本数据）
   */
  private async generateSQLWithFieldValues(
    text: string,
    tableInfo: TableInfo[],
    queryAnalysis?: QueryAnalysis
  ): Promise<string> {
    const request: EnhancedGenerateSQLRequest = {
      text,
      tableInfo,
      queryAnalysis
    };

    const enhancedPrompt = this.buildFieldOnlyPrompt(request);
    
    logger.log('ai_request', {
      endpoint: this.endpoint,
      model: this.model,
      hasFieldAnalysis: !!queryAnalysis,
      textFieldCount: queryAnalysis?.textFieldValues.length || 0
    }, 'AI模型请求（仅字段值分析）');

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: enhancedPrompt
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.1,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        throw new Error(`AI API request failed with status ${response.status}`);
      }

      const data: any = await response.json();
      const sql = this.extractSQL(data.choices[0].message.content);
      
      logger.log('ai_response', {
        status: response.status,
        statusText: response.statusText
      }, 'AI模型响应状态');
      
      logger.log('ai_response', {
        sql
      }, '生成的SQL语句（仅字段值分析）');

      return sql;
    } catch (error) {
      logger.log('ai_response', {
        error: error instanceof Error ? error.message : String(error)
      }, 'AI模型请求失败');
      
      throw new Error('Failed to generate SQL with field analysis. Please check your API configuration and try again.');
    }
  }

  /**
   * 构建仅字段值分析的提示词（不包含样本数据）
   */
  private buildFieldOnlyPrompt(request: EnhancedGenerateSQLRequest): string {
    let prompt = `你是一个SQL生成专家，请根据以下表格信息和用户的自然语言查询生成准确的SQL语句。

表格信息：
${JSON.stringify(request.tableInfo, null, 2)}`;

    // 添加字段值分析信息
    if (request.queryAnalysis && request.queryAnalysis.textFieldValues.length > 0) {
      prompt += `\n\n字段值归一化信息（用于精确匹配）：`;
      for (const fieldAnalysis of request.queryAnalysis.textFieldValues) {
        prompt += `\n字段 "${fieldAnalysis.fieldName}" (${fieldAnalysis.fieldId}) 的所有可能值：
${JSON.stringify(fieldAnalysis.uniqueValues, null, 2)}

请根据用户查询中的关键词，从上述值中选择最匹配的进行精确匹配。`;
      }
      
      prompt += `\n\n重要提示：
1. 优先使用字段的实际值进行匹配，而不是用户输入的原始词汇
2. 如果用户查询的词汇与字段值不完全匹配，选择最相似的字段值
3. 可以使用 IN 操作符来匹配多个相似的值
4. 对于品牌、型号等字段，注意中英文、大小写、格式差异
5. 确保选择的值在提供的字段值列表中存在`;
    }

    prompt += `\n\n请严格按照以下要求生成SQL：
1. 只生成SQL语句，不要添加任何解释或说明
2. 表名使用表格的id字段
3. 字段名使用字段的id字段
4. SQL语句要符合SQL标准语法
5. 确保生成的SQL能正确执行`;

    // 根据是否有字段分析信息调整策略
    if (request.queryAnalysis && request.queryAnalysis.textFieldValues.length > 0) {
      prompt += `
6. 优先使用提供的字段实际值进行精确匹配
7. 如果用户查询词汇与字段值不完全匹配，选择最相似的字段值
8. 可以使用 IN 操作符来匹配多个相似的值`;
    } else {
      prompt += `
6. 使用LIKE进行模糊匹配，提高查询成功率`;
    }

    return prompt;
  }
  private async collectSampleData(
    tableInfo: TableInfo[], 
    getSampleData: (tableId: string, limit: number) => Promise<any[]>
  ): Promise<SampleData> {
    const sampleData: SampleData = {};
    
    for (const table of tableInfo) {
      try {
        const samples = await getSampleData(table.id, this.sampleSize);
        sampleData[table.id] = samples;
        
        logger.log('ai_request', {
          tableId: table.id,
          tableName: table.tableName,
          sampleCount: samples.length
        }, '收集样本数据');
        
      } catch (error) {
        logger.log('ai_request', {
          tableId: table.id,
          error: error instanceof Error ? error.message : String(error)
        }, '收集样本数据失败');
        
        sampleData[table.id] = [];
      }
    }
    
    return sampleData;
  }

  /**
   * 基于样本数据生成SQL
   */
  private async generateSQLWithGuidance(
    text: string,
    tableInfo: TableInfo[],
    sampleData: SampleData,
    previousSQL?: string,
    previousError?: string,
    queryAnalysis?: QueryAnalysis
  ): Promise<string> {
    const request: EnhancedGenerateSQLRequest = {
      text,
      tableInfo,
      sampleData,
      previousSQL,
      previousError,
      queryAnalysis
    };

    const enhancedPrompt = this.buildEnhancedPrompt(request);
    
    logger.log('ai_request', {
      endpoint: this.endpoint,
      model: this.model,
      hasSampleData: Object.keys(sampleData).length > 0,
      hasPreviousSQL: !!previousSQL,
      hasFieldAnalysis: !!queryAnalysis
    }, 'AI模型请求（样本数据指导）');

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: enhancedPrompt
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.1,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        throw new Error(`AI API request failed with status ${response.status}`);
      }

      const data: any = await response.json();
      const sql = this.extractSQL(data.choices[0].message.content);
      
      logger.log('ai_response', {
        status: response.status,
        statusText: response.statusText
      }, 'AI模型响应状态');
      
      logger.log('ai_response', {
        sql
      }, '生成的SQL语句');

      return sql;
    } catch (error) {
      logger.log('ai_response', {
        error: error instanceof Error ? error.message : String(error)
      }, 'AI模型请求失败');
      
      throw new Error('Failed to generate SQL with sample guidance. Please check your API configuration and try again.');
    }
  }

  /**
   * 构建增强的提示词
   */
  private buildEnhancedPrompt(request: EnhancedGenerateSQLRequest): string {
    let prompt = `你是一个SQL生成专家，请根据以下表格信息和用户的自然语言查询生成准确的SQL语句。

表格信息：
${JSON.stringify(request.tableInfo, null, 2)}`;

    // 添加字段值分析信息
    if (request.queryAnalysis && request.queryAnalysis.textFieldValues.length > 0) {
      prompt += `\n\n字段值归一化信息（用于精确匹配）：`;
      for (const fieldAnalysis of request.queryAnalysis.textFieldValues) {
        prompt += `\n字段 "${fieldAnalysis.fieldName}" (${fieldAnalysis.fieldId}) 的所有可能值：
${JSON.stringify(fieldAnalysis.uniqueValues, null, 2)}`;
      }
    }

    // 添加样本数据
    if (request.sampleData && Object.keys(request.sampleData).length > 0) {
      prompt += `\n\n样本数据（用于参考实际数据格式）：`;
      for (const [tableId, samples] of Object.entries(request.sampleData)) {
        if (samples.length > 0) {
          prompt += `\n表格 ${tableId} 的样本数据：
${JSON.stringify(samples.slice(0, 3), null, 2)}`;
        }
      }
    }

    // 添加上次失败的信息
    if (request.previousSQL && request.previousError) {
      prompt += `\n\n上次生成的SQL查询失败：
SQL: ${request.previousSQL}
错误: ${request.previousError}

请根据样本数据的实际格式和字段值归一化信息，生成更准确的SQL语句。特别注意：
1. 字段值的实际格式（如品牌名称可能是"HUAWEI"而不是"华为"）
2. 使用LIKE进行模糊匹配而不是精确匹配
3. 注意数值字段的数据类型和范围
4. 优先使用提供的字段实际值进行匹配`;
    }

    prompt += `\n\n请严格按照以下要求生成SQL：
1. 只生成SQL语句，不要添加任何解释或说明
2. 表名使用表格的id字段
3. 字段名使用字段的id字段
4. SQL语句要符合SQL标准语法
5. 确保生成的SQL能正确执行`;

    // 根据是否有字段分析信息调整策略
    if (request.queryAnalysis && request.queryAnalysis.textFieldValues.length > 0) {
      prompt += `
6. 优先使用提供的字段实际值进行精确匹配
7. 如果用户查询词汇与字段值不完全匹配，选择最相似的字段值
8. 可以使用 IN 操作符来匹配多个相似的值`;
    } else {
      prompt += `
6. 优先使用LIKE进行模糊匹配，提高查询成功率`;
    }

    return prompt;
  }

  /**
   * 从AI响应中提取SQL语句
   */
  private extractSQL(content: string): string {
    // 尝试多种SQL代码块格式
    const patterns = [
      /```sql\s*([\s\S]*?)\s*```/gi,  // 标准格式
      /```\s*(SELECT[\s\S]*?)\s*```/gi,  // 没有sql标记的代码块
      /sql\s*:\s*(SELECT[\s\S]*?)(?:\n|$)/gi,  // sql: 格式
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        let sql = match[1] || match[0];
        sql = sql.replace(/```sql\s*/gi, '').replace(/```\s*/gi, '');
        sql = sql.trim();
        
        // 确保SQL以分号结尾
        if (!sql.endsWith(';')) {
          sql += ';';
        }
        
        return sql;
      }
    }
    
    // 如果没有找到代码块，检查是否直接是SQL语句
    let sql = content.trim();
    
    // 移除可能的前缀
    sql = sql.replace(/^(sql\s*:?\s*)/gi, '');
    
    // 如果内容看起来像SQL（以SELECT, INSERT, UPDATE, DELETE开头）
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\s+/i.test(sql)) {
      if (!sql.endsWith(';')) {
        sql += ';';
      }
      return sql;
    }
    
    // 最后的备选方案：直接返回清理后的内容
    return sql;
  }

  /**
   * 原有的简单SQL生成方法（保持向后兼容）
   */
  async generateSQL(text: string, tableInfo: TableInfo[]): Promise<string> {
    const request: GenerateSQLRequest = {
      text,
      tableInfo
    };

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: this.buildBasicPrompt(tableInfo)
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.1,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        throw new Error(`AI API request failed with status ${response.status}`);
      }

      const data: any = await response.json();
      return this.extractSQL(data.choices[0].message.content);
    } catch (error) {
      console.error('Failed to generate SQL:', error);
      throw new Error('Failed to generate SQL. Please check your API configuration and try again.');
    }
  }

  /**
   * 构建基础提示词
   */
  private buildBasicPrompt(tableInfo: TableInfo[]): string {
    return `你是一个SQL生成专家，请根据以下表格信息和用户的自然语言查询生成准确的SQL语句。

表格信息：
${JSON.stringify(tableInfo, null, 2)}

请严格按照以下要求生成SQL：
1. 只生成SQL语句，不要添加任何解释或说明
2. 表名使用表格的id字段
3. 字段名使用字段的id字段
4. SQL语句要符合SQL标准语法
5. 确保生成的SQL能正确执行`;
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}
