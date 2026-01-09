import { useCallback, useState } from "react";
import { BsSdk } from "../libs/bs-sdk/BsSdk";
import { BsSql } from "../libs/bs-sql";
import logger from "./logger";

const bsSdk = new BsSdk({});
const bsSQL = new BsSql(bsSdk);

export function useQuery() {
  const [result, setResult] = useState<any>();
  const [error, setError] = useState<any>();
  const [columns, setColumns] = useState<any>();
  const [pageSize, setPageSize] = useState<any>();
  const [total, setTotal] = useState<any>();

  const exec = useCallback(
    async (sql: string, pageIndex: number, reset?: boolean) => {
      // 记录结果处理开始
      logger.log('result_processing', { sql }, '结果处理开始');
      
      const result: any[] = await bsSQL.query(sql) as any[];
      
      // 记录原始查询结果
      logger.log('result_processing', {
        resultCount: result.length,
        sampleResult: result.slice(0, 2) // 只记录前两条结果作为示例
      }, '原始查询结果');
      
      const [tableListCtx] = await bsSQL.emFetchTableList.wait();
      const [tableFields] = await bsSQL.emFetchTableListFields.wait();
      
      // 构建字段映射
      const fieldIdMapName = new Map<string, string>();
      tableFields.forEach((t: any) => {
        Object.keys(t.fieldsMapId).forEach((id) => {
          fieldIdMapName.set(id, t.fieldsMapId[id]);
        });
      });
      
      logger.log('result_processing', { fieldIdMapName: Object.fromEntries(fieldIdMapName) }, '字段映射');
      
      // 构建列信息
      const columns = Object.keys(result[0] || {})
        .filter((item) => !["_id", "_raw_"].includes(item))
        .map((id) => {
          return {
            title: fieldIdMapName.get(id) || id,
            width: 100,
            dataIndex: id,
            key: id,
          };
        });
      
      logger.log('result_processing', { columns }, '生成的列信息');
      
      const tableName = await tableListCtx.tableList[0].getName();
      
      // 记录最终返回结果
      logger.log('result_processing', {
        tableName,
        columnCount: columns.length,
        resultCount: result.length
      }, '最终结果信息');
      
      return {
        tableName,
        columns,
        result,
        total,
        pageSize,
      };
    },
    []
  );

  const onExec = useCallback(
    async (sql: string, pageIndex: number, reset?: boolean) => {
      logger.log('ui_state', { sql, pageIndex, reset }, '开始执行查询');
      setError("");
      try {
        const { columns, result, total, pageSize } = await exec(
          sql,
          pageIndex,
          reset
        );
        setTotal(total);
        setPageSize(pageSize);
        setColumns(columns);
        setResult(result);
        
        logger.log('ui_state', {
          total,
          pageSize,
          columnCount: columns.length,
          resultCount: result.length
        }, '查询结果更新到UI');
      } catch (error) {
        console.error(error);
        setError(String(error));
        
        logger.log('ui_state', { error: String(error) }, '查询失败');
      }
    },
    [exec]
  );

  /**
   * 获取表格信息，包括字段类型
   * @returns 表格信息数组
   */
  const getTableInfo = useCallback(async () => {
    return await bsSQL.getTableInfo();
  }, []);

  /**
   * 获取指定表格的样本数据
   * @param tableId 表格ID
   * @param limit 样本数量限制
   * @returns 样本数据数组
   */
  const getSampleData = useCallback(async (tableId: string, limit: number = 5) => {
    return await bsSQL.getSampleData(tableId, limit);
  }, []);

  /**
   * 执行SQL查询（用于AI服务）
   * @param sql SQL语句
   * @returns 查询结果
   */
  const executeSQL = useCallback(async (sql: string): Promise<any[]> => {
    const result = await bsSQL.query(sql);
    return Array.isArray(result) ? result : [];
  }, []);

  /**
   * 分析查询涉及的字段并提取文本字段的唯一值
   * @param query 用户的自然语言查询
   * @param tableInfo 表格信息
   * @returns 字段值分析结果
   */
  const analyzeQueryFields = useCallback(async (query: string, tableInfo: any[]) => {
    return await bsSQL.analyzeQueryFields(query, tableInfo);
  }, []);

  return {
    result,
    error,
    columns,
    exec,
    onExec,
    pageSize,
    setPageSize,
    total,
    getTableInfo,
    getSampleData,
    executeSQL,
    analyzeQueryFields,
  };
}
