import { AIServiceConfig, TableInfo, SampleData, SQLGenerationResult, SQLAttempt, QueryProgress, SQLAlternative } from './types';
import logger from '../../utils/logger';

/**
 * AI智能多表联查服务
 * 采用全AI驱动的三步流程：AI字段分析 + AI样例数据分析 + AI生成多方案
 */
export class AISmartMultiTableService {
  private apiKey: string;
  private endpoint: string;
  private model?: string;
  private maxRetries: number;

  constructor(config: AIServiceConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint;
    this.model = config.model;
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * 智能多表联查主流程 - 全AI驱动（增强版）
   */
  async generateSmartMultiTableSQL(
    text: string,
    tableInfo: TableInfo[],
    getSampleData: (tableId: string, limit: number) => Promise<any[]>,
    executeSQL: (sql: string) => Promise<any[]>,
    onProgress?: (progress: QueryProgress) => void
  ): Promise<SQLGenerationResult> {
    logger.log('ai_request', { text, mode: 'smart-multi-table-enhanced' }, '开始AI智能多表联查（增强版）');
    
    const history: SQLAttempt[] = [];
    const analysisHistory: Array<{
      step: string;
      result: any;
      timestamp: number;
      issues?: string[];
    }> = [];
    
    try {
      // 第一步：AI字段分析
      if (onProgress) {
        onProgress({
          step: 1,
          stepName: '第一步：AI字段分析',
          description: '正在使用AI分析查询相关的字段...',
          status: 'running'
        });
      }
      
      const fieldAnalysis = await this.aiFieldAnalysis(text, tableInfo);
      analysisHistory.push({
        step: 'field_analysis',
        result: fieldAnalysis,
        timestamp: Date.now(),
        issues: this.identifyFieldAnalysisIssues(fieldAnalysis)
      });
      
      if (onProgress) {
        onProgress({
          step: 1,
          stepName: '第一步：AI字段分析',
          description: `AI字段分析完成 - 发现 ${fieldAnalysis.relevantTables.length} 个相关表格`,
          status: 'completed',
          data: {
            relevantTableCount: fieldAnalysis.relevantTables.length,
            keyFields: fieldAnalysis.keyFields,
            issues: analysisHistory[analysisHistory.length - 1].issues
          }
        });
      }
      
      // 第二步：AI样例数据分析
      if (onProgress) {
        onProgress({
          step: 2,
          stepName: '第二步：AI样例数据分析',
          description: '正在使用AI分析样例数据模式...',
          status: 'running'
        });
      }
      
      const dataAnalysis = await this.aiSampleDataAnalysis(
        text, 
        fieldAnalysis.relevantTables, 
        getSampleData
      );
      analysisHistory.push({
        step: 'data_analysis',
        result: dataAnalysis,
        timestamp: Date.now(),
        issues: this.identifyDataAnalysisIssues(dataAnalysis)
      });
      
      if (onProgress) {
        onProgress({
          step: 2,
          stepName: '第二步：AI样例数据分析',
          description: `AI数据分析完成 - 识别 ${dataAnalysis.dataPatterns.length} 种数据模式`,
          status: 'completed',
          data: {
            patternCount: dataAnalysis.dataPatterns.length,
            relationships: dataAnalysis.tableRelationships,
            issues: analysisHistory[analysisHistory.length - 1].issues
          }
        });
      }
      
      // 第三步：AI生成5个备选方案（增强版）
      if (onProgress) {
        onProgress({
          step: 3,
          stepName: '第三步：AI生成5个备选方案',
          description: '正在基于历史分析结果生成5个备选SQL方案...',
          status: 'running'
        });
      }
      
      const alternatives = await this.aiGenerateEnhancedStrategies(
        text,
        fieldAnalysis,
        dataAnalysis,
        analysisHistory,
        [] // 初次生成时没有执行历史
      );
      
      if (!alternatives || alternatives.length === 0) {
        throw new Error('AI未能生成任何备选方案');
      }
      
      if (onProgress) {
        onProgress({
          step: 3,
          stepName: '第三步：AI生成5个备选方案',
          description: `成功生成 ${alternatives.length} 个备选方案`,
          status: 'completed',
          data: {
            alternativeCount: alternatives.length
          }
        });
        
        onProgress({
          step: 4,
          stepName: '第四步：迭代测试执行',
          description: '正在测试每个备选方案并基于错误结果进行迭代优化...',
          status: 'running'
        });
      }
      
      // 第四步：迭代测试执行（增强版）
      let bestAlternative: SQLAlternative | null = null;
      let bestResult: any[] = [];
      const executionErrors: Array<{
        sql: string;
        error: string;
        attemptNumber: number;
      }> = [];
      
      // 第一轮：测试初始5个方案
      for (let i = 0; i < alternatives.length; i++) {
        const alternative = alternatives[i];
        const attemptNumber = i + 1;
        
        try {
          const result = await executeSQL(alternative.sql);
          const resultCount = result.length;
          
          const attempt: SQLAttempt = {
            attemptNumber,
            sql: alternative.sql,
            timestamp: Date.now(),
            hasResult: resultCount > 0,
            resultCount,
            error: undefined,
            description: alternative.description,
            reasoning: alternative.reasoning,
            recommendation: alternative.recommendation,
            strategy: alternative.strategy
          };
          
          history.push(attempt);
          
          logger.log('sql_execution', {
            alternativeIndex: i + 1,
            sql: alternative.sql,
            resultCount,
            strategy: alternative.strategy
          }, `备选方案${attemptNumber}执行成功`);
          
          // 选择第一个有结果的方案作为最佳方案
          if (resultCount > 0 && !bestAlternative) {
            bestAlternative = alternative;
            bestResult = result;
          }
          
        } catch (sqlError) {
          const errorMessage = sqlError instanceof Error ? sqlError.message : String(sqlError);
          
          // 记录执行错误
          executionErrors.push({
            sql: alternative.sql,
            error: errorMessage,
            attemptNumber
          });
          
          const attempt: SQLAttempt = {
            attemptNumber,
            sql: alternative.sql,
            timestamp: Date.now(),
            hasResult: false,
            resultCount: 0,
            error: errorMessage,
            description: alternative.description,
            reasoning: alternative.reasoning,
            recommendation: alternative.recommendation,
            strategy: alternative.strategy
          };
          
          history.push(attempt);
          
          logger.log('sql_execution', {
            alternativeIndex: i + 1,
            sql: alternative.sql,
            error: errorMessage,
            strategy: alternative.strategy
          }, `备选方案${attemptNumber}执行失败`);
        }
      }
      
      // 如果所有方案都失败，基于错误结果生成改进方案
      if (!bestAlternative && executionErrors.length > 0) {
        if (onProgress) {
          onProgress({
            step: 4,
            stepName: '第四步：错误分析与改进',
            description: `初始方案全部失败，正在基于 ${executionErrors.length} 个错误结果生成改进方案...`,
            status: 'running'
          });
        }
        
        // 生成基于错误反馈的改进方案
        const improvedAlternatives = await this.aiGenerateImprovedStrategies(
          text,
          fieldAnalysis,
          dataAnalysis,
          analysisHistory,
          executionErrors
        );
        
        // 测试改进方案
        for (let i = 0; i < improvedAlternatives.length; i++) {
          const alternative = improvedAlternatives[i];
          const attemptNumber = alternatives.length + i + 1;
          
          try {
            const result = await executeSQL(alternative.sql);
            const resultCount = result.length;
            
            const attempt: SQLAttempt = {
              attemptNumber,
              sql: alternative.sql,
              timestamp: Date.now(),
              hasResult: resultCount > 0,
              resultCount,
              error: undefined,
              description: alternative.description + ' (改进版)',
              reasoning: alternative.reasoning,
              recommendation: alternative.recommendation,
              strategy: alternative.strategy + ' (错误修正)'
            };
            
            history.push(attempt);
            
            logger.log('sql_execution', {
              alternativeIndex: attemptNumber,
              sql: alternative.sql,
              resultCount,
              strategy: alternative.strategy,
              isImproved: true
            }, `改进方案${i + 1}执行成功`);
            
            if (resultCount > 0 && !bestAlternative) {
              bestAlternative = alternative;
              bestResult = result;
              break; // 找到成功的改进方案就停止
            }
            
          } catch (sqlError) {
            const errorMessage = sqlError instanceof Error ? sqlError.message : String(sqlError);
            
            const attempt: SQLAttempt = {
              attemptNumber,
              sql: alternative.sql,
              timestamp: Date.now(),
              hasResult: false,
              resultCount: 0,
              error: errorMessage,
              description: alternative.description + ' (改进版)',
              reasoning: alternative.reasoning,
              recommendation: alternative.recommendation,
              strategy: alternative.strategy + ' (错误修正)'
            };
            
            history.push(attempt);
            
            logger.log('sql_execution', {
              alternativeIndex: attemptNumber,
              sql: alternative.sql,
              error: errorMessage,
              strategy: alternative.strategy,
              isImproved: true
            }, `改进方案${i + 1}执行失败`);
          }
        }
      }
      
      if (onProgress) {
        const successCount = history.filter(h => h.hasResult).length;
        onProgress({
          step: 4,
          stepName: '第四步：迭代测试完成',
          description: `测试完成 - ${successCount}/${history.length} 个方案成功执行`,
          status: successCount > 0 ? 'completed' : 'failed'
        });
      }
      
      // 返回结果
      if (bestAlternative && bestResult.length > 0) {
        return {
          success: true,
          sql: bestAlternative.sql,
          result: bestResult,
          attempts: history.length,
          history: history,
          alternatives: alternatives,
          recommendedIndex: 0,
          error: undefined
        };
      } else {
        return {
          success: false,
          sql: history[history.length - 1]?.sql || '',
          result: [],
          attempts: history.length,
          history: history,
          alternatives: alternatives,
          error: `所有 ${history.length} 个方案都未能返回数据。错误分析：${executionErrors.map(e => e.error).join('; ')}`
        };
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.log('ai_response', { error: errorMessage }, 'AI智能多表联查失败');
      
      return {
        success: false,
        sql: '',
        result: [],
        attempts: 0,
        history: history,
        error: `AI智能多表联查失败: ${errorMessage}`
      };
    }
  }

  /**
   * 第一步：AI字段分析
   */
  private async aiFieldAnalysis(
    text: string,
    tableInfo: TableInfo[]
  ): Promise<{
    relevantTables: TableInfo[];
    keyFields: string[];
    queryIntent: string;
    fieldMappings: Array<{
      queryTerm: string;
      matchedFields: Array<{
        tableId: string;
        tableName: string;
        fieldId: string;
        fieldName: string;
        confidence: number;
      }>;
    }>;
  }> {
    const systemPrompt = `你是一个专业的数据库字段分析专家。请分析用户查询，识别相关的表格和字段。

## 可用表格信息
${tableInfo.map(table => `
表格: ${table.tableName} (ID: ${table.id})
字段: ${table.fields.map(f => `${f.name}(${f.id})`).join(', ')}
`).join('\n')}

## 分析任务
1. 识别查询意图和关键词
2. 匹配相关的表格和字段
3. 分析字段间的关联关系
4. 评估每个匹配的置信度

## 输出格式
请严格按照以下JSON格式输出：

\`\`\`json
{
  "queryIntent": "查询意图描述",
  "keyFields": ["关键字段1", "关键字段2"],
  "relevantTables": [
    {
      "id": "表格ID",
      "tableName": "表格名称", 
      "fields": [{"id": "字段ID", "name": "字段名称", "type": "字段类型"}],
      "relevanceScore": 0.95
    }
  ],
  "fieldMappings": [
    {
      "queryTerm": "查询词汇",
      "matchedFields": [
        {
          "tableId": "表格ID",
          "tableName": "表格名称",
          "fieldId": "字段ID", 
          "fieldName": "字段名称",
          "confidence": 0.9
        }
      ]
    }
  ]
}
\`\`\``;

    const userPrompt = `请分析以下查询："${text}"

要求：
1. 识别查询中的关键词汇
2. 匹配最相关的表格和字段
3. 分析可能的关联关系
4. 给出置信度评分`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt);
      const analysis = this.parseJSONResponse(response);
      
      logger.log('ai_response', {
        queryIntent: analysis.queryIntent,
        relevantTableCount: analysis.relevantTables?.length || 0,
        keyFieldCount: analysis.keyFields?.length || 0
      }, 'AI字段分析完成');
      
      return analysis;
    } catch (error) {
      logger.log('ai_response', { error: error instanceof Error ? error.message : String(error) }, 'AI字段分析失败');
      throw new Error(`AI字段分析失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 第二步：AI样例数据分析
   */
  private async aiSampleDataAnalysis(
    text: string,
    relevantTables: TableInfo[],
    getSampleData: (tableId: string, limit: number) => Promise<any[]>
  ): Promise<{
    dataPatterns: Array<{
      tableId: string;
      pattern: string;
      description: string;
      sampleCount: number;
    }>;
    tableRelationships: Array<{
      table1: string;
      table2: string;
      relationshipType: string;
      confidence: number;
      joinFields: Array<{
        field1: string;
        field2: string;
      }>;
    }>;
    dataQuality: {
      completeness: number;
      consistency: number;
      recommendations: string[];
    };
  }> {
    // 收集样例数据并进行数据质量预检
    const sampleDataMap: { [tableId: string]: any[] } = {};
    const dataQualityIssues: string[] = [];
    
    for (const table of relevantTables) {
      try {
        const samples = await getSampleData(table.id, 5);
        sampleDataMap[table.id] = samples;
        
        // 数据质量预检
        if (samples.length === 0) {
          dataQualityIssues.push(`表格 ${table.tableName}(${table.id}) 无数据，可能影响查询结果`);
        } else {
          // 检查费用相关字段是否有有效数据
          const feeFields = table.fields.filter(f => 
            f.name.includes('费用') || f.name.includes('总') || f.name.includes('金额') || 
            f.name.includes('cost') || f.name.includes('fee') || f.name.includes('amount')
          );
          
          if (feeFields.length > 0) {
            const hasValidFeeData = samples.some(sample => 
              feeFields.some(field => sample[field.id] && sample[field.id] !== 0)
            );
            
            if (!hasValidFeeData) {
              dataQualityIssues.push(`表格 ${table.tableName} 的费用字段可能缺少有效数据`);
            }
          }
        }
      } catch (error) {
        sampleDataMap[table.id] = [];
        dataQualityIssues.push(`表格 ${table.tableName}(${table.id}) 数据获取失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const systemPrompt = `你是一个专业的数据模式分析专家。请分析样例数据，识别数据模式和表格关联关系。

## 相关表格信息
${relevantTables.map(table => `
表格: ${table.tableName} (ID: ${table.id})
字段: ${table.fields.map(f => `${f.name}(${f.id})`).join(', ')}
`).join('\n')}

## 样例数据
${Object.entries(sampleDataMap).map(([tableId, samples]) => {
  if (samples.length > 0) {
    return `表格 ${tableId} 样例数据：
${JSON.stringify(samples.slice(0, 3), null, 2)}`;
  }
  return `表格 ${tableId}: 无样例数据`;
}).join('\n\n')}

## 数据质量预检发现的问题
${dataQualityIssues.length > 0 ? dataQualityIssues.map(issue => `- ${issue}`).join('\n') : '无明显数据质量问题'}

## 分析任务
1. 识别每个表格的数据模式
2. 分析表格间的关联关系
3. 评估数据质量
4. 提供优化建议
5. 特别关注费用相关字段的数据有效性

## 输出格式
请严格按照以下JSON格式输出：

\`\`\`json
{
  "dataPatterns": [
    {
      "tableId": "表格ID",
      "pattern": "数据模式类型",
      "description": "模式描述",
      "sampleCount": 样例数量
    }
  ],
  "tableRelationships": [
    {
      "table1": "表格1ID",
      "table2": "表格2ID", 
      "relationshipType": "关联类型(一对一/一对多/多对多)",
      "confidence": 0.85,
      "joinFields": [
        {
          "field1": "表格1字段ID",
          "field2": "表格2字段ID"
        }
      ]
    }
  ],
  "dataQuality": {
    "completeness": 0.9,
    "consistency": 0.85,
    "recommendations": ["建议1", "建议2"]
  }
}
\`\`\``;

    const userPrompt = `基于用户查询："${text}"

请分析样例数据，重点关注：
1. 与查询相关的数据模式
2. 可能的表格关联方式
3. 数据完整性和一致性
4. 查询执行的最佳策略建议
5. 费用相关字段的数据质量
6. 空表或无效数据的影响

${dataQualityIssues.length > 0 ? `
特别注意以下数据质量问题：
${dataQualityIssues.map(issue => `- ${issue}`).join('\n')}
` : ''}

请提供详细的分析结果和改进建议。`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt);
      const analysis = this.parseJSONResponse(response);
      
      // 将数据质量预检问题添加到建议中
      if (analysis.dataQuality && dataQualityIssues.length > 0) {
        analysis.dataQuality.recommendations = [
          ...(analysis.dataQuality.recommendations || []),
          ...dataQualityIssues
        ];
      }
      
      logger.log('ai_response', {
        patternCount: analysis.dataPatterns?.length || 0,
        relationshipCount: analysis.tableRelationships?.length || 0,
        dataQuality: analysis.dataQuality,
        qualityIssuesFound: dataQualityIssues.length
      }, 'AI样例数据分析完成');
      
      return analysis;
    } catch (error) {
      logger.log('ai_response', { error: error instanceof Error ? error.message : String(error) }, 'AI样例数据分析失败');
      throw new Error(`AI样例数据分析失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 第三步：AI生成5个策略方案（增强版）
   */
  private async aiGenerateEnhancedStrategies(
    text: string,
    fieldAnalysis: any,
    dataAnalysis: any,
    analysisHistory: Array<{
      step: string;
      result: any;
      timestamp: number;
      issues?: string[];
    }>,
    executionHistory: Array<{
      sql: string;
      error: string;
      attemptNumber: number;
    }>
  ): Promise<SQLAlternative[]> {
    const systemPrompt = `你是一个专业的多表联查SQL专家。基于前面的字段分析和数据分析结果，以及历史分析问题，生成5个不同的备选SQL方案。

## 历史分析总结
${analysisHistory.map(analysis => `
### ${analysis.step}阶段分析结果
时间: ${new Date(analysis.timestamp).toLocaleString()}
结果: ${JSON.stringify(analysis.result, null, 2)}
${analysis.issues && analysis.issues.length > 0 ? `
发现的问题:
${analysis.issues.map(issue => `- ${issue}`).join('\n')}
` : ''}
`).join('\n')}

## 字段分析结果
查询意图: ${fieldAnalysis.queryIntent}
关键字段: ${fieldAnalysis.keyFields?.join(', ')}
相关表格: ${fieldAnalysis.relevantTables?.map((t: any) => `${t.tableName}(${t.id})`).join(', ')}

字段映射:
${fieldAnalysis.fieldMappings?.map((mapping: any) => `
- 查询词汇"${mapping.queryTerm}": ${mapping.matchedFields?.map((f: any) => `${f.tableName}.${f.fieldName}(置信度:${f.confidence})`).join(', ')}
`).join('')}

## 数据分析结果
数据模式:
${dataAnalysis.dataPatterns?.map((pattern: any) => `
- ${pattern.tableId}: ${pattern.pattern} - ${pattern.description}
`).join('')}

表格关联关系:
${dataAnalysis.tableRelationships?.map((rel: any) => `
- ${rel.table1} ↔ ${rel.table2}: ${rel.relationshipType} (置信度:${rel.confidence})
  关联字段: ${rel.joinFields?.map((jf: any) => `${jf.field1}=${jf.field2}`).join(', ')}
`).join('')}

数据质量: 完整性${dataAnalysis.dataQuality?.completeness}, 一致性${dataAnalysis.dataQuality?.consistency}

${executionHistory.length > 0 ? `
## 执行错误历史（重要参考）
${executionHistory.map((exec, index) => `
### 错误${index + 1}
SQL: ${exec.sql}
错误: ${exec.error}
分析: 需要根据此错误调整SQL策略
`).join('\n')}

**重要提示**: 请仔细分析上述执行错误，在生成新的SQL时避免相同的错误模式。
` : ''}

## 5种不同策略
1. **UNION策略**: 合并相同结构的表格数据
2. **JOIN策略**: 通过关联字段连接表格
3. **子查询策略**: 使用子查询处理复杂逻辑
4. **聚合策略**: 重点使用GROUP BY和聚合函数
5. **筛选策略**: 重点使用WHERE条件精确筛选

## 输出格式
请严格按照以下JSON格式输出：

\`\`\`json
{
  "alternatives": [
    {
      "sql": "纯SQL语句，使用字段ID和表格ID，所有别名必须使用英文",
      "description": "方案特点描述",
      "reasoning": "详细的AI推理过程，解释为什么选择这种方案，如何避免历史错误",
      "recommendation": "推荐指数(1-5星)和推荐理由",
      "strategy": "主要策略名称",
      "errorAvoidance": "如何避免历史执行错误的说明"
    }
  ]
}
\`\`\`

## 重要要求
1. 使用字段ID而不是字段名
2. 使用表格ID作为表名
3. 确保SQL语法正确
4. 每个方案要有明显差异
5. 基于历史分析问题进行优化
6. 如果有执行错误历史，必须分析错误原因并在新SQL中避免
7. 生成5个不同的方案
8. 只返回纯SQL语句，不要包含Markdown格式
9. **重要：所有AS别名必须使用英文，禁止使用中文别名**
10. **别名示例：AS building, AS total_cost, AS room_name等**`;

    const userPrompt = `用户查询: "${text}"

基于以上完整的分析历史和问题总结，请生成5个不同的多表联查备选方案。每个方案要：
1. 使用不同的查询策略
2. 充分利用字段分析和数据分析的结果
3. 考虑历史分析中发现的问题
4. ${executionHistory.length > 0 ? '特别注意避免之前执行失败的错误模式' : '确保SQL语法正确和逻辑合理'}
5. 提供详细的推理过程和错误避免策略

请严格按照JSON格式输出结果。`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt);
      const result = this.parseJSONResponse(response);
      const alternatives = result.alternatives || [];

      // 处理每个备选方案的SQL
      const processedAlternatives = alternatives.map((alt: any) => ({
        sql: this.extractSQL(alt.sql),
        description: alt.description || '未提供描述',
        reasoning: alt.reasoning || '未提供推理',
        recommendation: alt.recommendation || '未提供推荐',
        strategy: alt.strategy || '未知策略'
      }));

      logger.log('ai_response', {
        alternativeCount: processedAlternatives.length,
        strategies: processedAlternatives.map((alt: any) => alt.strategy),
        hasExecutionHistory: executionHistory.length > 0
      }, 'AI生成增强策略方案完成');

      return processedAlternatives.slice(0, 5); // 确保最多返回5个

    } catch (error) {
      logger.log('ai_response', { error: error instanceof Error ? error.message : String(error) }, 'AI生成增强策略方案失败');
      throw new Error(`AI生成增强策略方案失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 基于错误反馈生成改进方案
   */
  private async aiGenerateImprovedStrategies(
    text: string,
    fieldAnalysis: any,
    dataAnalysis: any,
    analysisHistory: Array<{
      step: string;
      result: any;
      timestamp: number;
      issues?: string[];
    }>,
    executionErrors: Array<{
      sql: string;
      error: string;
      attemptNumber: number;
    }>
  ): Promise<SQLAlternative[]> {
    const systemPrompt = `你是一个专业的SQL错误诊断和修复专家。基于执行错误结果，生成改进的SQL方案。

## 执行错误分析
${executionErrors.map((error, index) => `
### 错误${index + 1}
SQL: ${error.sql}
错误信息: ${error.error}
尝试次数: ${error.attemptNumber}

错误类型分析:
${this.analyzeErrorType(error.error)}
`).join('\n')}

## 原始分析结果参考
### 字段分析
查询意图: ${fieldAnalysis.queryIntent}
关键字段: ${fieldAnalysis.keyFields?.join(', ')}

### 数据分析  
数据质量: 完整性${dataAnalysis.dataQuality?.completeness}, 一致性${dataAnalysis.dataQuality?.consistency}
表格关联: ${dataAnalysis.tableRelationships?.length || 0}个关联关系

## 错误修复策略
基于上述错误分析，请采用以下修复策略：
1. **中文字符编码错误**: 将所有中文别名替换为英文别名，如 AS building, AS total_cost
2. **语法错误**: 检查SQL语法，确保括号、引号、分号正确
3. **字段不存在**: 使用正确的字段ID，检查表格结构
4. **表格不存在**: 使用正确的表格ID
5. **JOIN错误**: 检查关联字段是否存在，使用正确的JOIN语法
6. **聚合错误**: 确保GROUP BY包含所有非聚合字段
7. **数据类型错误**: 注意字段数据类型匹配
8. **CTE错误**: 确保WITH子句中的表名使用英文
9. **UNION错误**: 确保UNION的各部分字段数量和类型匹配

## 输出格式
请严格按照以下JSON格式输出：

\`\`\`json
{
  "alternatives": [
    {
      "sql": "修复后的纯SQL语句，所有别名必须使用英文",
      "description": "修复方案描述",
      "reasoning": "详细说明如何修复原始错误，采用了什么策略",
      "recommendation": "推荐指数和理由",
      "strategy": "修复策略名称",
      "fixedErrors": "修复了哪些具体错误"
    }
  ]
}
\`\`\`

## 重要要求
1. 针对每个错误类型生成对应的修复方案
2. 确保修复后的SQL语法完全正确
3. 使用字段ID和表格ID
4. 提供详细的修复说明
5. 生成2-3个不同的修复方案
6. **重要：所有AS别名必须使用英文，禁止使用中文别名**
7. **别名示例：AS building, AS total_cost, AS room_name等**`;

    const userPrompt = `用户查询: "${text}"

所有初始方案都执行失败了，请基于上述错误分析生成改进的SQL方案。重点关注：
1. 分析每个错误的根本原因
2. 提供针对性的修复策略
3. 确保修复后的SQL能够成功执行
4. 生成2-3个不同角度的修复方案

请严格按照JSON格式输出结果。`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt);
      const result = this.parseJSONResponse(response);
      const alternatives = result.alternatives || [];

      const processedAlternatives = alternatives.map((alt: any) => ({
        sql: this.extractSQL(alt.sql),
        description: alt.description || '未提供描述',
        reasoning: alt.reasoning || '未提供推理',
        recommendation: alt.recommendation || '未提供推荐',
        strategy: alt.strategy || '错误修复'
      }));

      logger.log('ai_response', {
        alternativeCount: processedAlternatives.length,
        originalErrorCount: executionErrors.length
      }, 'AI生成错误修复方案完成');

      return processedAlternatives.slice(0, 3); // 最多返回3个修复方案

    } catch (error) {
      logger.log('ai_response', { error: error instanceof Error ? error.message : String(error) }, 'AI生成错误修复方案失败');
      throw new Error(`AI生成错误修复方案失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 识别字段分析中的问题
   */
  private identifyFieldAnalysisIssues(fieldAnalysis: any): string[] {
    const issues: string[] = [];
    
    if (!fieldAnalysis.relevantTables || fieldAnalysis.relevantTables.length === 0) {
      issues.push('未找到相关表格');
    }
    
    if (!fieldAnalysis.keyFields || fieldAnalysis.keyFields.length === 0) {
      issues.push('未识别到关键字段');
    }
    
    if (!fieldAnalysis.fieldMappings || fieldAnalysis.fieldMappings.length === 0) {
      issues.push('字段映射为空');
    }
    
    // 检查置信度
    if (fieldAnalysis.fieldMappings) {
      const lowConfidenceFields = fieldAnalysis.fieldMappings.filter((mapping: any) => 
        mapping.matchedFields && mapping.matchedFields.some((field: any) => field.confidence < 0.7)
      );
      if (lowConfidenceFields.length > 0) {
        issues.push(`${lowConfidenceFields.length}个字段映射置信度较低`);
      }
    }
    
    return issues;
  }

  /**
   * 识别数据分析中的问题
   */
  private identifyDataAnalysisIssues(dataAnalysis: any): string[] {
    const issues: string[] = [];
    
    if (!dataAnalysis.dataPatterns || dataAnalysis.dataPatterns.length === 0) {
      issues.push('未识别到数据模式');
    }
    
    if (!dataAnalysis.tableRelationships || dataAnalysis.tableRelationships.length === 0) {
      issues.push('未发现表格关联关系');
    }
    
    // 检查数据质量
    if (dataAnalysis.dataQuality) {
      if (dataAnalysis.dataQuality.completeness < 0.7) {
        issues.push('数据完整性较低');
      }
      if (dataAnalysis.dataQuality.consistency < 0.7) {
        issues.push('数据一致性较低');
      }
    }
    
    return issues;
  }

  /**
   * 分析错误类型
   */
  private analyzeErrorType(errorMessage: string): string {
    if (errorMessage.includes('Parse error') || errorMessage.includes('syntax')) {
      if (errorMessage.includes('INVALID') || errorMessage.includes('got \'INVALID\'')) {
        return '中文字符编码错误 - SQL中包含中文别名导致解析失败，需要使用英文别名';
      }
      return '语法错误 - SQL语法不正确，需要检查括号、引号、关键字等';
    }
    
    if (errorMessage.includes('field') || errorMessage.includes('column')) {
      return '字段错误 - 字段不存在或字段名不正确';
    }
    
    if (errorMessage.includes('table') || errorMessage.includes('relation')) {
      return '表格错误 - 表格不存在或表格名不正确';
    }
    
    if (errorMessage.includes('JOIN') || errorMessage.includes('join')) {
      return 'JOIN错误 - 关联条件不正确或关联字段不存在';
    }
    
    if (errorMessage.includes('GROUP BY') || errorMessage.includes('aggregate')) {
      return '聚合错误 - GROUP BY语句不正确或聚合函数使用错误';
    }
    
    if (errorMessage.includes('type') || errorMessage.includes('convert')) {
      return '数据类型错误 - 字段数据类型不匹配';
    }
    
    if (errorMessage.includes('WITH') || errorMessage.includes('CTE')) {
      return 'CTE错误 - WITH子句语法不正确或CTE名称包含特殊字符';
    }
    
    if (errorMessage.includes('UNION')) {
      return 'UNION错误 - UNION语句语法不正确或字段数量不匹配';
    }
    
    return '未知错误 - 需要进一步分析错误原因';
  }

  /**
   * 调用AI接口的通用方法
   */
  private async callAI(systemPrompt: string, userPrompt: string): Promise<string> {
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
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.2,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`AI API request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  /**
   * 解析JSON响应
   */
  private parseJSONResponse(content: string): any {
    // 尝试提取JSON代码块
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    let jsonContent = jsonMatch ? jsonMatch[1] : content;
    
    // 如果没有找到JSON代码块，尝试直接解析
    if (!jsonMatch) {
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonContent = objectMatch[0];
      }
    }

    try {
      return JSON.parse(jsonContent);
    } catch (error) {
      throw new Error(`JSON解析失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从AI响应中提取SQL语句并处理中文别名
   */
  private extractSQL(content: string): string {
    // 尝试多种SQL代码块格式
    const patterns = [
      /```sql\s*([\s\S]*?)\s*```/gi,
      /```\s*(SELECT[\s\S]*?)\s*```/gi,
      /sql\s*:\s*(SELECT[\s\S]*?)(?:\n|$)/gi,
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        let sql = match[1] || match[0];
        sql = sql.replace(/```sql\s*/gi, '').replace(/```\s*/gi, '');
        sql = sql.trim();
        
        // 处理中文别名问题
        sql = this.fixChineseAliases(sql);
        
        if (!sql.endsWith(';')) {
          sql += ';';
        }
        
        return sql;
      }
    }
    
    // 如果没有找到代码块，检查是否直接是SQL语句
    let sql = content.trim();
    sql = sql.replace(/^(sql\s*:?\s*)/gi, '');
    
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\s+/i.test(sql)) {
      // 处理中文别名问题
      sql = this.fixChineseAliases(sql);
      
      if (!sql.endsWith(';')) {
        sql += ';';
      }
      return sql;
    }
    
    return sql;
  }

  /**
   * 修复中文别名问题，将中文别名替换为英文别名
   */
  private fixChineseAliases(sql: string): string {
    // 中文到英文的映射
    const aliasMap: { [key: string]: string } = {
      '楼栋': 'building',
      '项目工程费用汇总': 'total_cost',
      '费用汇总': 'cost_summary',
      '总费用': 'total_fee',
      '机房': 'room',
      '服务项总': 'service_total',
      '数量总': 'quantity_total',
      '年月': 'year_month',
      '月份': 'month',
      '年份': 'year',
      '区域': 'region',
      '城市': 'city',
      '省份': 'province',
      '部门': 'department',
      '记录条数': 'record_count',
      '平均费用': 'avg_cost',
      '楼栋分组': 'building_group',
      '包含楼栋数量': 'building_count',
      '楼栋费用': 'building_cost'
    };

    // 替换 AS 后面的中文别名
    let fixedSql = sql;
    
    // 匹配 AS 中文别名的模式
    const asPattern = /\s+AS\s+([^\s,\)]+)/gi;
    fixedSql = fixedSql.replace(asPattern, (match, alias) => {
      // 移除引号
      const cleanAlias = alias.replace(/['"]/g, '');
      
      // 如果是中文别名，替换为英文
      if (aliasMap[cleanAlias]) {
        return ` AS ${aliasMap[cleanAlias]}`;
      }
      
      // 如果包含中文字符，生成英文别名
      if (/[\u4e00-\u9fff]/.test(cleanAlias)) {
        // 生成简单的英文别名
        const englishAlias = this.generateEnglishAlias(cleanAlias);
        return ` AS ${englishAlias}`;
      }
      
      return match;
    });

    // 处理 CTE (WITH 子句) 中的中文表名
    const withPattern = /WITH\s+([^\s]+)\s+AS/gi;
    fixedSql = fixedSql.replace(withPattern, (match, tableName) => {
      if (/[\u4e00-\u9fff]/.test(tableName)) {
        const englishName = aliasMap[tableName] || this.generateEnglishAlias(tableName);
        return `WITH ${englishName} AS`;
      }
      return match;
    });

    // 处理 FROM 子句中的中文表别名引用
    const fromPattern = /FROM\s+([^\s]+)/gi;
    fixedSql = fixedSql.replace(fromPattern, (match, tableName) => {
      if (aliasMap[tableName]) {
        return `FROM ${aliasMap[tableName]}`;
      }
      return match;
    });

    // 处理 GROUP BY 和 ORDER BY 中的中文字段引用
    const groupOrderPattern = /(GROUP\s+BY|ORDER\s+BY)\s+([^,\s]+)/gi;
    fixedSql = fixedSql.replace(groupOrderPattern, (match, clause, fieldName) => {
      if (aliasMap[fieldName]) {
        return `${clause} ${aliasMap[fieldName]}`;
      }
      return match;
    });

    return fixedSql;
  }

  /**
   * 生成英文别名
   */
  private generateEnglishAlias(chineseName: string): string {
    // 简单的中文到英文映射规则
    const commonMappings: { [key: string]: string } = {
      '费用': 'cost',
      '汇总': 'summary',
      '总计': 'total',
      '数量': 'quantity',
      '楼栋': 'building',
      '机房': 'room',
      '区域': 'region',
      '城市': 'city',
      '月份': 'month',
      '年份': 'year',
      '部门': 'department',
      '项目': 'project',
      '工程': 'engineering',
      '服务': 'service'
    };

    let englishAlias = '';
    
    // 尝试匹配常见词汇
    for (const [chinese, english] of Object.entries(commonMappings)) {
      if (chineseName.includes(chinese)) {
        englishAlias += english + '_';
      }
    }

    // 如果没有匹配到，使用默认别名
    if (!englishAlias) {
      englishAlias = 'field_';
    }

    // 移除末尾的下划线并添加随机数字
    englishAlias = englishAlias.replace(/_$/, '');
    englishAlias += Math.floor(Math.random() * 1000);

    return englishAlias;
  }
}