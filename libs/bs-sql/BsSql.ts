import { ITable } from "@lark-base-open/js-sdk";
import { BsSdk } from "../bs-sdk/BsSdk";
import { Emitter } from "../bs-sdk/Emitter";
import alasql from "alasql";
import { transFieldsMap } from "../bs-sdk/shared";
import { mapToObj, replaceFieldNames } from "./shared";
import logger from "../../utils/logger";
import { TableInfo, QueryAnalysis, FieldValueAnalysis } from "../ai-service/types";

export type TableListCtx = {
  tableMap: Map<string, ITable>;
  tableIdMapName: Map<string, string>;
  tableNameMapId: Map<string, string>;
  tableList: ITable[];
};

export class BsSql {
  public emFetchTableList = new Emitter<(data: TableListCtx) => any>();
  public emFetchTableListFields = new Emitter<(data: any) => any>();

  constructor(private sdk: BsSdk) {
    this.fetchTables();
  }

  /**
   * 获取所有表格信息，包括字段类型
   * @returns 表格信息数组
   */
  async getTableInfo() {
    const [tableListCtx] = await this.emFetchTableList.wait();
    const tableInfoList = [];

    for (const table of tableListCtx.tableList) {
      const fields = await table.getFieldMetaList();
      const tableName = await table.getName();
      
      const tableInfo = {
        id: table.id,
        tableName: tableName,
        fields: fields.map(field => ({
          id: field.id,
          name: field.name,
          type: String(field.type), // Convert enum to string
          description: String(field.description || '') // Convert to string
        }))
      };
      
      tableInfoList.push(tableInfo);
    }

    return tableInfoList;
  }

  /**
   * 获取指定表格的样本数据
   * @param tableId 表格ID
   * @param limit 样本数量限制
   * @returns 样本数据数组
   */
  async getSampleData(tableId: string, limit: number = 5): Promise<any[]> {
    try {
      const [tableListCtx] = await this.emFetchTableList.wait();
      const table = tableListCtx.tableMap.get(tableId);
      
      if (!table) {
        logger.log('table_data', { tableId, error: '表格不存在' }, '获取样本数据失败');
        return [];
      }

      const fields = await table.getFieldMetaList();
      const records = await this.sdk.getRecordList(table);
      const displayData = await this.sdk.getDisplayRecordList(table, fields);
      
      // 限制样本数量
      const sampleData = displayData.slice(0, limit);
      
      logger.log('table_data', {
        tableId,
        tableName: await table.getName(),
        totalRecords: displayData.length,
        sampleCount: sampleData.length,
        fields: fields.map(f => ({ id: f.id, name: f.name, type: f.type }))
      }, '获取样本数据成功');
      
      return sampleData;
    } catch (error) {
      logger.log('table_data', {
        tableId,
        error: error instanceof Error ? error.message : String(error)
      }, '获取样本数据失败');
      
      return [];
    }
  }

  /**
   * 分析查询涉及的字段并提取文本字段的唯一值
   * @param query 用户的自然语言查询
   * @param tableInfo 表格信息
   * @returns 字段值分析结果
   */
  async analyzeQueryFields(query: string, tableInfo: TableInfo[]): Promise<QueryAnalysis> {
    try {
      const [tableListCtx] = await this.emFetchTableList.wait();
      const involvedFields: string[] = [];
      const textFieldValues: FieldValueAnalysis[] = [];
      
      // 分析查询中可能涉及的字段
      for (const table of tableInfo) {
        for (const field of table.fields) {
          // 检查查询中是否提到了这个字段名
          if (query.includes(field.name) || this.isFieldRelevantToQuery(query, field)) {
            involvedFields.push(field.id);
            
            // 如果是文本字段，提取唯一值
            if (this.isTextField(field.type)) {
              const uniqueValues = await this.getFieldUniqueValues(table.id, field.id);
              
              textFieldValues.push({
                fieldId: field.id,
                fieldName: field.name,
                fieldType: field.type,
                uniqueValues,
                isTextField: true
              });
              
              logger.log('field_analysis', {
                tableId: table.id,
                fieldId: field.id,
                fieldName: field.name,
                uniqueValueCount: uniqueValues.length,
                sampleValues: uniqueValues.slice(0, 5)
              }, '提取字段唯一值');
            }
          }
        }
      }
      
      logger.log('field_analysis', {
        query,
        involvedFieldCount: involvedFields.length,
        textFieldCount: textFieldValues.length
      }, '查询字段分析完成');
      
      return {
        involvedFields,
        textFieldValues
      };
    } catch (error) {
      logger.log('field_analysis', {
        query,
        error: error instanceof Error ? error.message : String(error)
      }, '查询字段分析失败');
      
      return {
        involvedFields: [],
        textFieldValues: []
      };
    }
  }

  /**
   * 判断字段是否与查询相关
   */
  private isFieldRelevantToQuery(query: string, field: any): boolean {
    const queryLower = query.toLowerCase();
    const fieldNameLower = field.name.toLowerCase();
    
    // 检查字段名的相关性
    if (queryLower.includes(fieldNameLower)) {
      return true;
    }
    
    // 检查常见的字段关键词
    const fieldKeywords = {
      '品牌': ['品牌', '厂商', '制造商', 'brand'],
      '型号': ['型号', '模型', 'model', '产品'],
      '名称': ['名称', '标题', 'name', 'title'],
      '类型': ['类型', '分类', 'type', 'category'],
      '状态': ['状态', 'status', '情况'],
      '地区': ['地区', '区域', '地方', 'region', 'area'],
      '部门': ['部门', '科室', 'department'],
      '项目': ['项目', 'project']
    };
    
    for (const [key, keywords] of Object.entries(fieldKeywords)) {
      if (fieldNameLower.includes(key)) {
        return keywords.some(keyword => queryLower.includes(keyword));
      }
    }
    
    return false;
  }

  /**
   * 判断是否为文本字段
   */
  private isTextField(fieldType: string): boolean {
    // 根据Lark Base字段类型判断
    const textFieldTypes = ['1', 'Text', 'SingleSelect', 'MultiSelect', '3', '4'];
    return textFieldTypes.includes(fieldType) || fieldType.toString().includes('Text');
  }

  /**
   * 获取指定字段的唯一值
   */
  private async getFieldUniqueValues(tableId: string, fieldId: string, limit: number = 50): Promise<string[]> {
    try {
      const [tableListCtx] = await this.emFetchTableList.wait();
      const table = tableListCtx.tableMap.get(tableId);
      
      if (!table) {
        return [];
      }

      const fields = await table.getFieldMetaList();
      const displayData = await this.sdk.getDisplayRecordList(table, fields);
      
      // 提取指定字段的所有值
      const values = displayData
        .map(record => record[fieldId])
        .filter(value => value != null && value !== '')
        .map(value => String(value).trim());
      
      // 去重并限制数量
      const uniqueSet = new Set(values);
      const uniqueValues = Array.from(uniqueSet).slice(0, limit);
      
      return uniqueValues;
    } catch (error) {
      logger.log('field_analysis', {
        tableId,
        fieldId,
        error: error instanceof Error ? error.message : String(error)
      }, '获取字段唯一值失败');
      
      return [];
    }
  }

  async fetchTables() {
    const tableMap = new Map<string, ITable>();
    const tableNameMapId = new Map<string, string>();
    const tableIdMapName = new Map<string, string>();
    const tableList = await this.sdk.getTableList();

    tableList.map((item) => tableMap.set(item.id, item));

    const nameMapIds: { name: string; id: string }[] = [];
    await Promise.all(
      tableList.map(async (item) => {
        const name = await item.getName();
        nameMapIds.push({
          name,
          id: item.id,
        });
      })
    );

    // 按名字从长到短排序
    nameMapIds
      .sort((a, b) => b.name.length - a.name.length)
      .forEach((item) => {
        tableNameMapId.set(item.name, item.id);
        tableIdMapName.set(item.id, item.name);
      });

    this.emFetchTableList.emitLifeCycle({
      tableMap,
      tableIdMapName,
      tableNameMapId,
      tableList,
    });
  }

  extractName(sql: string, ids: string[]) {
    const selectTablesId: string[] = [];
    
    // 遍历所有表格ID，检查SQL中是否包含该ID
    ids.forEach((id) => {
      if (sql.includes(id)) {
        selectTablesId.push(id);
      }
    });
    
    // 去重处理 - 使用兼容的方式
    const uniqueTablesId: string[] = [];
    for (const id of selectTablesId) {
      if (!uniqueTablesId.includes(id)) {
        uniqueTablesId.push(id);
      }
    }
    
    logger.log('sql_execution', {
      originalSql: sql,
      availableIds: ids,
      extractedIds: uniqueTablesId
    }, '表格ID提取结果');
    
    return uniqueTablesId;
  }
  async query(sql: string) {
    // 记录SQL执行开始
    logger.log('sql_execution', { originalSql: sql }, 'SQL执行开始');
    
    const activeId = (await this.sdk.getActiveTable()).id;
    const [tableListCtx] = await this.emFetchTableList.wait();
    
    // 替换占位符
    sql = sql.replace(/FROM\s+(\?)\s?/gim, `FROM ${activeId} `);
    logger.log('sql_execution', { processedSql: sql }, '替换占位符后的SQL');

    // 替换表格名称
    sql = replaceFieldNames(sql, {}, mapToObj(tableListCtx.tableNameMapId)) + "";
    logger.log('sql_execution', { processedSql: sql }, '替换表格名称后的SQL');
    
    // 提取SQL中涉及的所有表格ID，检查所有表格ID，包括直接使用的表格ID
    const allTableIds = Array.from(tableListCtx.tableMap.keys());
    let selectTablesId: string[] = this.extractName(sql, allTableIds);
    
    // 容错机制：如果没有提取到表格ID，使用当前激活表格
    if (selectTablesId.length === 0) {
      logger.log('sql_execution', {
        activeId,
        message: '未提取到表格ID，使用当前激活表格'
      }, '表格ID提取容错');
      selectTablesId = [activeId];
    }
    
    logger.log('sql_execution', { selectTablesId }, '最终使用的表格ID');

    const transFields: any = {};
    const tableMapFields = new Map<
      string,
      {
        fieldsMapName: any;
        fieldsMapId: any;
      }
    >();
    const tables = (alasql as any).tables;
    
    // 加载表格数据
    await Promise.all(
      selectTablesId.map(async (id) => {
        const table = tableListCtx.tableMap.get(id) as ITable;
        const records = await this.sdk.getRecordList(table);
        const fields = await table.getFieldMetaList();
        const data = await this.sdk.getDisplayRecordList(table, fields);
        
        // 记录表格数据
        logger.log('table_data', {
          tableId: id,
          tableName: await table.getName(),
          recordCount: data.length,
          fields: fields.map(f => ({ id: f.id, name: f.name, type: f.type }))
        }, '加载表格数据');
        
        const t = transFieldsMap(fields);
        transFields[id] = t.fieldsMapName;
        tableMapFields.set(id, t);
        
        // 将表格数据加载到alasql内存数据库
        tables[id] = { data };
      })
    );

    this.emFetchTableListFields.emitLifeCycle(tableMapFields);

    // 替换字段名称
    sql = replaceFieldNames(sql, transFields, {}, ["_id"]) + "";
    logger.log('sql_execution', { finalSql: sql, transFields }, '替换字段名称后的最终SQL');

    // 执行SQL
    const result = alasql(sql);
    logger.log('sql_execution', { result }, 'SQL执行结果');
    
    return result;
  }
}
