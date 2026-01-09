import {
  Banner,
  Button,
  Col,
  Dropdown,
  Form,
  Input,
  Progress,
  Row,
  Spin,
  Table,
  Toast,
  Card,
  Typography,
  Tag,
  Space,
  Modal,
} from "@douyinfe/semi-ui";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  PermissionEntity,
  OperationType,
  bitable,
} from "@lark-base-open/js-sdk";
import styles from "./index.module.css";
import { useQuery } from "../../utils/useQuery";
import { ColumnProps, TablePagination } from "@douyinfe/semi-ui/lib/es/table";
import Icon, {
  IconAscend,
  IconExport,
  IconGithubLogo,
  IconLink,
  IconChevronDown,
  IconChevronUp,
  IconTick,
  IconClose,
} from "@douyinfe/semi-icons";
import { AIService } from "../../libs/ai-service/AIService";
import logger, { LogEntry } from "../../utils/logger";
import { SQLAttempt, QueryProgress, SQLAlternative } from "../../libs/ai-service/types";

const { Text, Title } = Typography;

function downloadBufferAsFile(buffer: ArrayBuffer, fileName: string) {
  // 创建一个新的 Blob 对象，将 buffer 数据放入其中
  const blob = new Blob([buffer]);

  // 创建一个 URL 对象，用于生成下载链接
  const url = URL.createObjectURL(blob);

  // 打开下载链接
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  // 清理资源
  URL.revokeObjectURL(url);
  document.body.removeChild(link);
}

// 下载CSV文件
function downloadCSV(data: any[], filename: string) {
  const csvContent = data.map(row => 
    Object.values(row).map(value => 
      typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
    ).join(',')
  ).join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  
  URL.revokeObjectURL(url);
  document.body.removeChild(link);
}

export default function App() {
  const [sql, setSql] = useState<string>("select * from ?");
  const [naturalLanguage, setNaturalLanguage] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  
  // 多表联查模式
  const [multiTableMode, setMultiTableMode] = useState(false);
  const [showTableStructure, setShowTableStructure] = useState(false);
  const [tableStructureData, setTableStructureData] = useState<any[]>([]);
  
  // 智能生成历史记录
  const [generationHistory, setGenerationHistory] = useState<SQLAttempt[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [currentQuery, setCurrentQuery] = useState<string>("");
  
  // 实时进度状态
  const [currentProgress, setCurrentProgress] = useState<QueryProgress[]>([]);
  const [showProgress, setShowProgress] = useState(false);

  const {
    exec,
    onExec,
    error,
    pageSize = 0,
    total = 0,
    columns,
    result,
    getTableInfo,
    getSampleData,
    executeSQL,
    analyzeQueryFields,
  } = useQuery();
  const [loading, setLoading] = useState(false);
  const [generatingSQL, setGeneratingSQL] = useState(false);
  
  // 日志相关状态
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedLogType, setSelectedLogType] = useState<LogEntry['type'] | 'all'>('all');
  const [logFilterOpen, setLogFilterOpen] = useState(false);
  
  // 刷新日志
  const refreshLogs = useCallback(() => {
    const allLogs = logger.getLogs();
    setLogs(allLogs);
  }, []);
  
  // 筛选日志
  const filteredLogs = selectedLogType === 'all' 
    ? logs 
    : logs.filter(log => log.type === selectedLogType);
  
  // 清空日志
  const clearLogs = useCallback(() => {
    logger.clearLogs();
    setLogs([]);
  }, []);
  
  // 导出日志
  const exportLogs = useCallback(() => {
    const logData = logger.exportLogs();
    const blob = new Blob([logData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sqlbot-logs-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);
  
  // 切换日志显示
  const toggleLogs = useCallback(() => {
    setShowLogs(!showLogs);
    if (!showLogs) {
      refreshLogs();
    }
  }, [showLogs, refreshLogs]);

  // 初始化AI服务实例（从环境变量读取配置）
  const aiService = new AIService({
    apiKey: process.env.NEXT_PUBLIC_AI_API_KEY || "your-api-key-here",
    endpoint: process.env.NEXT_PUBLIC_AI_ENDPOINT || "http://localhost:3001/chat/completions",
    model: process.env.NEXT_PUBLIC_AI_MODEL || "gpt-3.5-turbo"
  });

  const onChange = useCallback((val: string) => setSql(val), []);
  const onNaturalLanguageChange = useCallback((val: string) => setNaturalLanguage(val), []);

  const onQuery = useCallback(async () => {
    if (loading) {
      Toast.warning({
        content: "querying...",
      });
      return;
    }
    setLoading(true);
    setCurrentPage(1);
    await onExec(sql, -1, true);
    setLoading(false);
  }, [loading, onExec, sql]);

  // 多表联查SQL生成方法
  const onGenerateMultiTableSQL = useCallback(async () => {
    if (!naturalLanguage.trim()) {
      Toast.warning({
        content: "请输入自然语言查询",
      });
      return;
    }
    
    if (generatingSQL) {
      Toast.warning({
        content: "正在生成SQL...",
      });
      return;
    }
    
    setGeneratingSQL(true);
    setCurrentQuery(naturalLanguage);
    setGenerationHistory([]);
    setCurrentProgress([]);
    setShowHistory(false);
    setShowProgress(true);
    
    // 进度回调函数
    const handleProgress = (progress: QueryProgress) => {
      setCurrentProgress(prev => [...prev, progress]);
    };
    
    try {
      // 获取表格信息
      const tableInfo = await getTableInfo();
      
      // 使用多表联查SQL生成
      const result = await aiService.generateMultiTableSQL(
        naturalLanguage,
        tableInfo,
        getSampleData,
        executeSQL,
        analyzeQueryFields,
        handleProgress
      );
      
      // 更新历史记录
      setGenerationHistory(result.history);
      
      if (result.success) {
        setSql(result.sql);
        Toast.success({
          content: `多表联查SQL生成成功 (尝试${result.attempts}次)`,
        });
        
        // 如果已经有查询结果，直接显示
        if (result.result && result.result.length > 0) {
          await onExec(result.sql, -1, true);
        }
      } else {
        setSql(result.sql);
        Toast.error({
          content: `多表联查SQL生成失败 (尝试${result.attempts}次): ${result.error}`,
        });
      }
      
      // 查询完成后，可以选择显示历史记录
      if (result.history.length > 1) {
        setShowHistory(true);
      }
      
    } catch (error) {
      console.error("生成多表联查SQL失败:", error);
      Toast.error({
        content: `生成多表联查SQL失败: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setGeneratingSQL(false);
      setTimeout(() => {
        setShowProgress(false);
      }, 3000);
    }
  }, [naturalLanguage, generatingSQL, aiService, getTableInfo, analyzeQueryFields, executeSQL, getSampleData, onExec]);

  // 生成SQL的方法（根据模式选择单表或多表）
  const onGenerateSQL = useCallback(async () => {
    if (!naturalLanguage.trim()) {
      Toast.warning({
        content: "请输入自然语言查询",
      });
      return;
    }
    
    if (generatingSQL) {
      Toast.warning({
        content: "正在生成SQL...",
      });
      return;
    }
    
    // 如果是多表联查模式，直接调用多表联查方法
    if (multiTableMode) {
      return onGenerateMultiTableSQL();
    }
    
    setGeneratingSQL(true);
    setCurrentQuery(naturalLanguage); // 记录当前查询
    setGenerationHistory([]); // 清空历史记录
    setCurrentProgress([]); // 清空进度记录
    setShowHistory(false); // 隐藏历史记录
    setShowProgress(true); // 显示进度
    
    // 进度回调函数
    const handleProgress = (progress: QueryProgress) => {
      setCurrentProgress(prev => [...prev, progress]);
    };
    
    try {
      // 获取表格信息
      const tableInfo = await getTableInfo();
      
      // 使用智能SQL生成（仅字段值归一化，不使用样本数据）
      const result = await aiService.generateSQLWithFieldAnalysisOnly(
        naturalLanguage,
        tableInfo,
        executeSQL,
        analyzeQueryFields,
        handleProgress
      );
      
      // 更新历史记录
      setGenerationHistory(result.history);
      
      if (result.success) {
        setSql(result.sql);
        Toast.success({
          content: `SQL生成成功 (尝试${result.attempts}次)`,
        });
        
        // 如果已经有查询结果，直接显示
        if (result.result && result.result.length > 0) {
          // 手动触发结果显示
          await onExec(result.sql, -1, true);
        }
      } else {
        setSql(result.sql);
        Toast.error({
          content: `SQL生成失败 (尝试${result.attempts}次): ${result.error}`,
        });
      }
      
      // 查询完成后，可以选择显示历史记录
      if (result.history.length > 1) {
        setShowHistory(true);
      }
      
    } catch (error) {
      console.error("生成SQL失败:", error);
      Toast.error({
        content: `生成SQL失败: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setGeneratingSQL(false);
      // 保持进度显示一段时间，然后自动隐藏
      setTimeout(() => {
        setShowProgress(false);
      }, 3000);
    }
  }, [naturalLanguage, generatingSQL, multiTableMode, onGenerateMultiTableSQL, aiService, getTableInfo, analyzeQueryFields, executeSQL, onExec]);

  // 显示表结构信息
  const onShowTableStructure = useCallback(async () => {
    try {
      const tableInfo = await getTableInfo();
      setTableStructureData(tableInfo);
      setShowTableStructure(true);
    } catch (error) {
      Toast.error({
        content: `获取表结构失败: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, [getTableInfo]);

  // 切换多表联查模式
  const toggleMultiTableMode = useCallback(() => {
    setMultiTableMode(!multiTableMode);
    if (!multiTableMode) {
      Toast.info({
        content: "已开启多表联查模式，AI将优先生成跨表查询SQL",
      });
    } else {
      Toast.info({
        content: "已关闭多表联查模式，回到单表查询模式",
      });
    }
  }, [multiTableMode]);

  const pagination: TablePagination =
    pageSize >= total
      ? false
      : {
          currentPage: currentPage,
          size: "small",
          pageSize,
          total,
          position: "top",
          hideOnSinglePage: true,
          formatPageText: (p) =>
            `当前 SQL 查询的是 ${p?.currentStart}条 到 ${p?.currentEnd}条 的数据`,
          onPageChange: async (page: number) => {
            // console.log("onPageChange", page);
            setLoading(true);
            setCurrentPage(page);
            await onExec(sql, page - 1, false);
            setLoading(false);
          },
        };
  const [exportLoading, setExportLoading] = useState(false);
  const onExport = useCallback(async () => {
    const bool = await bitable.base.getPermission({
      entity: PermissionEntity.Base,
      type: OperationType.Printable,
    });
    if (!bool) {
      Toast.warning({
        content: "no permission",
      });
      return;
    }
    if (exportLoading) {
      Toast.warning({
        content: "exporting...",
      });
      return;
    }
    setExportLoading(true);
    try {
      const res = await exec(sql, -1);
      // 导出为CSV格式
      downloadCSV(res.result, res.tableName + ".csv");
    } catch (error) {
      console.error(error);
      Toast.error({
        content: `export error: ${error}`,
      });
    }
    setExportLoading(false);
  }, [exec, exportLoading, sql]);
  const onHelp = useCallback(() => {
    window.open("http://sqlmother.yupi.icu/#/learn");
  }, []);
  const onGithub = useCallback(() => {
    // 更新为你的GitHub仓库地址
    window.open("https://github.com/your-username/your-repository");
  }, []);
  return (
    <main className={styles.main}>
      {/* 多表联查模式控制行 */}
      <Row style={{ padding: "0.5rem", backgroundColor: "#f8f9fa", borderRadius: "4px", marginBottom: "0.5rem" }}>
        <Col span={6}>
          <Button 
            type={multiTableMode ? "primary" : "tertiary"}
            theme="solid"
            onClick={toggleMultiTableMode}
            icon={multiTableMode ? <IconTick /> : <IconClose />}
          >
            {multiTableMode ? "多表联查模式" : "单表查询模式"}
          </Button>
        </Col>
        <Col span={6} style={{ paddingLeft: "5px" }}>
          <Button 
            type="secondary"
            onClick={onShowTableStructure}
          >
            查看表结构
          </Button>
        </Col>
        <Col span={12} style={{ paddingLeft: "10px", display: "flex", alignItems: "center" }}>
          <Text type="secondary" size="small">
            {multiTableMode 
              ? "🔗 多表联查模式：AI将优先生成跨表查询SQL，整合多个表格的数据" 
              : "📋 单表查询模式：AI将生成单表查询SQL"}
          </Text>
        </Col>
      </Row>

      {/* 自然语言输入行 */}
      <Row style={{ padding: "0.5rem" }}>
        <Col span={multiTableMode ? 14 : 16}>
          <Input 
            placeholder={multiTableMode 
              ? "输入自然语言查询，例如：统计各个区域在所有表格中的UPS负载率平均值" 
              : "输入自然语言查询，例如：查询所有销售额大于1000的订单"
            } 
            value={naturalLanguage} 
            onChange={onNaturalLanguageChange}
          ></Input>
        </Col>
        {multiTableMode && (
          <Col span={3} style={{ paddingLeft: "5px" }}>
            <Button 
              type="warning" 
              block 
              theme="solid" 
              onClick={onGenerateMultiTableSQL}
              loading={generatingSQL}
            >
              多表联查
            </Button>
          </Col>
        )}
        <Col span={multiTableMode ? 3 : 4} style={{ paddingLeft: "5px" }}>
          <Button 
            type="secondary" 
            block 
            theme="solid" 
            onClick={onGenerateSQL}
            loading={generatingSQL}
          >
            {multiTableMode ? "单表查询" : "生成SQL"}
          </Button>
        </Col>
        <Col span={multiTableMode ? 4 : 4} style={{ paddingLeft: "5px" }}>
          <Button type="primary" block theme="solid" onClick={onQuery}>
            Query
          </Button>
        </Col>
      </Row>
      
      {/* SQL输入行 */}
      <Row style={{ padding: "0.5rem", paddingTop: 0 }}>
        <Col span={22}>
          <Input value={sql} onChange={onChange}></Input>
        </Col>
        <Col span={2} style={{ paddingLeft: "5px" }}>
          <Dropdown
            trigger={"click"}
            position={"bottomRight"}
            render={
              <Dropdown.Menu>
                <Dropdown.Item
                  icon={exportLoading ? <Spin /> : <IconExport />}
                  onClick={onExport}
                >
                  Export
                </Dropdown.Item>
                <Dropdown.Item icon={<IconLink />} onClick={onHelp}>
                  Help
                </Dropdown.Item>
                <Dropdown.Item icon={<IconGithubLogo />} onClick={onGithub}>
                  Github
                </Dropdown.Item>
                {/* <Dropdown.Item>Menu Item 2</Dropdown.Item>
                <Dropdown.Item>Menu Item 3</Dropdown.Item> */}
              </Dropdown.Menu>
            }
          >
            <Button icon={<IconAscend />}></Button>
          </Dropdown>
        </Col>
      </Row>
      
      {/* 实时进度显示 */}
      {showProgress && currentProgress.length > 0 && (
        <div style={{ padding: "0.5rem", paddingTop: 0 }}>
          <div>
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '0.5rem',
                backgroundColor: '#e6f7ff',
                borderRadius: '4px',
                cursor: 'pointer',
                border: '1px solid #91d5ff'
              }}
              onClick={() => setShowProgress(!showProgress)}
            >
              <Space>
                <Text strong style={{ color: '#1890ff' }}>实时进度</Text>
                <Text type="secondary">
                  查询: "{currentQuery}"
                </Text>
                {generatingSQL && <Spin size="small" />}
              </Space>
              {showProgress ? <IconChevronUp /> : <IconChevronDown />}
            </div>
            
            <div style={{ marginTop: '0.5rem' }}>
              {currentProgress.map((progress, index) => (
                <div 
                  key={index}
                  style={{ 
                    marginBottom: '0.5rem',
                    padding: '0.75rem',
                    backgroundColor: '#fff',
                    borderRadius: '4px',
                    border: '1px solid #f0f0f0',
                    borderLeft: `4px solid ${
                      progress.status === 'completed' ? '#52c41a' :
                      progress.status === 'failed' ? '#ff4d4f' :
                      progress.status === 'running' ? '#1890ff' :
                      '#faad14'
                    }`
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '0.25rem'
                  }}>
                    <Space>
                      <Tag 
                        color={
                          progress.status === 'completed' ? 'green' :
                          progress.status === 'failed' ? 'red' :
                          progress.status === 'running' ? 'blue' :
                          'orange'
                        }
                      >
                        {progress.stepName}
                      </Tag>
                      {progress.status === 'running' && <Spin size="small" />}
                    </Space>
                    <Text type="secondary" style={{ fontSize: '0.8rem' }}>
                      {progress.timestamp ? new Date(progress.timestamp).toLocaleTimeString() : ''}
                    </Text>
                  </div>
                  
                  <div style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                    {progress.description}
                  </div>
                  
                  {progress.data && (
                    <div style={{ 
                      fontSize: '0.8rem', 
                      color: '#666',
                      backgroundColor: '#f8f9fa',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '3px',
                      marginTop: '0.25rem'
                    }}>
                      {progress.data.sql && (
                        <div style={{ fontFamily: 'monospace', marginBottom: '0.25rem' }}>
                          SQL: {progress.data.sql}
                        </div>
                      )}
                      {progress.data.resultCount !== undefined && (
                        <div>结果: {progress.data.resultCount}条记录</div>
                      )}
                      {progress.data.textFieldCount !== undefined && (
                        <div>分析字段: {progress.data.textFieldCount}个文本字段</div>
                      )}
                      {progress.data.error && (
                        <div style={{ color: '#ff4d4f' }}>错误: {progress.data.error}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* 智能生成历史记录（查询完成后显示） */}
      {generationHistory.length > 0 && (
        <div style={{ padding: "0.5rem", paddingTop: 0 }}>
          <div>
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '0.5rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
              onClick={() => setShowHistory(!showHistory)}
            >
              <Space>
                <Text strong>智能生成历史</Text>
                <Text type="secondary">
                  查询: "{currentQuery}" - 共{generationHistory.length}次尝试
                </Text>
              </Space>
              {showHistory ? <IconChevronUp /> : <IconChevronDown />}
            </div>
            
            {showHistory && (
              <div style={{ marginTop: '0.5rem' }}>
                {generationHistory.map((attempt, index) => (
                  <Card 
                    key={index}
                    style={{ 
                      marginBottom: '1rem',
                      border: attempt.hasResult ? '1px solid #52c41a' : '1px solid #ff4d4f'
                    }}
                    bodyStyle={{ padding: '1rem' }}
                  >
                    <div style={{ marginBottom: '0.5rem' }}>
                      <Space>
                        <Tag 
                          color={attempt.hasResult ? 'green' : 'red'}
                        >
                          {attempt.hasResult ? <IconTick style={{ marginRight: '4px' }} /> : <IconClose style={{ marginRight: '4px' }} />}
                          {attempt.strategy ? `${attempt.strategy} - ` : ''}第{attempt.attemptNumber}次尝试
                        </Tag>
                        <Text type="secondary">
                          {new Date(attempt.timestamp).toLocaleTimeString()}
                        </Text>
                      </Space>
                    </div>
                    
                    {/* 备选方案描述 */}
                    {attempt.description && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <Text strong>方案描述:</Text>
                        <div style={{ 
                          backgroundColor: '#e6f7ff',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          marginTop: '0.25rem'
                        }}>
                          {attempt.description}
                        </div>
                      </div>
                    )}
                    
                    {/* AI推理过程 */}
                    {attempt.reasoning && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <Text strong>AI推理:</Text>
                        <div style={{ 
                          backgroundColor: '#f6ffed',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          marginTop: '0.25rem',
                          fontSize: '0.9rem'
                        }}>
                          {attempt.reasoning}
                        </div>
                      </div>
                    )}
                    
                    {/* 推荐指数 */}
                    {attempt.recommendation && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <Text strong>AI推荐:</Text>
                        <div style={{ 
                          backgroundColor: '#fff7e6',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          marginTop: '0.25rem',
                          fontSize: '0.9rem'
                        }}>
                          {attempt.recommendation}
                        </div>
                      </div>
                    )}
                    
                    <div style={{ marginBottom: '0.5rem' }}>
                      <Text strong>生成的SQL:</Text>
                      <div style={{ 
                        backgroundColor: '#f5f5f5',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        marginTop: '0.25rem'
                      }}>
                        {attempt.sql}
                      </div>
                    </div>
                    
                    <div>
                      <Space>
                        <Text strong>查询结果:</Text>
                        <Tag color={attempt.hasResult ? 'green' : 'orange'}>
                          {attempt.resultCount}条记录
                        </Tag>
                      </Space>
                      {attempt.error && (
                        <div style={{ 
                          color: '#ff4d4f',
                          fontSize: '0.9rem',
                          marginTop: '0.25rem'
                        }}>
                          错误: {attempt.error}
                        </div>
                      )}
                      {attempt.hasResult && attempt.resultCount > 0 && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <Button 
                            size="small" 
                            type="secondary"
                            onClick={() => {
                              setSql(attempt.sql);
                              onExec(attempt.sql, -1, true);
                            }}
                          >
                            使用此SQL查询
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {error && (
        <div style={{ margin: "0px 0.5rem" }}>
          <Banner
            fullMode={false}
            type="warning"
            bordered
            description={
              <p
                style={{
                  whiteSpace: "pre-wrap",
                  color: "red",
                  wordSpacing: "0.5em",
                }}
              >
                {error}
              </p>
            }
          ></Banner>
        </div>
      )}
      <div>
        <Table
          columns={columns}
          dataSource={result}
          pagination={pagination}
          loading={loading}
        />
      </div>
      
      {/* 日志查看界面 */}
      <div style={{ marginTop: '1rem' }}>
        {/* 日志控制栏 */}
        <Row style={{ marginBottom: '0.5rem', alignItems: 'center' }}>
          <Col>
            <Button 
              type="secondary" 
              onClick={toggleLogs}
              icon={<IconLink />}
            >
              {showLogs ? '隐藏日志' : '查看日志'}
            </Button>
          </Col>
          
          {showLogs && (
            <>
              <Col style={{ marginLeft: '0.5rem' }}>
                <Dropdown
                  trigger="click"
                  position="bottomLeft"
                  open={logFilterOpen}
                  onOpenChange={setLogFilterOpen}
                >
                  <Button type="secondary" theme="borderless">
                    筛选: {selectedLogType === 'all' ? '全部' : selectedLogType}
                  </Button>
                  <Dropdown.Menu>
                    <Dropdown.Item onClick={() => { setSelectedLogType('all'); setLogFilterOpen(false); }}>
                      全部
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => { setSelectedLogType('ai_request'); setLogFilterOpen(false); }}>
                      AI请求
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => { setSelectedLogType('ai_response'); setLogFilterOpen(false); }}>
                      AI响应
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => { setSelectedLogType('table_data'); setLogFilterOpen(false); }}>
                      表格数据
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => { setSelectedLogType('sql_execution'); setLogFilterOpen(false); }}>
                      SQL执行
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => { setSelectedLogType('result_processing'); setLogFilterOpen(false); }}>
                      结果处理
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => { setSelectedLogType('ui_state'); setLogFilterOpen(false); }}>
                      UI状态
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => { setSelectedLogType('field_analysis'); setLogFilterOpen(false); }}>
                      字段分析
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </Col>
              
              <Col style={{ marginLeft: '0.5rem' }}>
                <Button type="secondary" onClick={refreshLogs} theme="borderless">
                  刷新日志
                </Button>
              </Col>
              
              <Col style={{ marginLeft: '0.5rem' }}>
                <Button type="secondary" onClick={exportLogs} theme="borderless">
                  导出日志
                </Button>
              </Col>
              
              <Col style={{ marginLeft: '0.5rem' }}>
                <Button type="secondary" onClick={clearLogs} theme="borderless" danger>
                  清空日志
                </Button>
              </Col>
            </>
          )}
        </Row>
        
        {/* 日志列表 */}
        {showLogs && (
          <div style={{ 
            border: '1px solid #e0e0e0', 
            borderRadius: '4px', 
            padding: '1rem',
            maxHeight: '400px',
            overflowY: 'auto',
            backgroundColor: '#fafafa'
          }}>
            {filteredLogs.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
                没有日志记录
              </div>
            ) : (
              filteredLogs
                .sort((a, b) => b.timestamp - a.timestamp) // 按时间倒序显示
                .map((log) => (
                  <div key={log.id} style={{ 
                    marginBottom: '1rem', 
                    padding: '0.75rem',
                    backgroundColor: '#fff',
                    borderRadius: '4px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginBottom: '0.5rem'
                    }}>
                      <span style={{ 
                        fontWeight: 'bold',
                        color: {
                          'ai_request': '#1890ff',
                          'ai_response': '#52c41a',
                          'table_data': '#faad14',
                          'sql_execution': '#722ed1',
                          'result_processing': '#eb2f96',
                          'ui_state': '#13c2c2',
                          'field_analysis': '#f5222d'
                        }[log.type] || '#333'
                      }}>
                        [{log.type}] {log.context || ''}
                      </span>
                      <span style={{ 
                        fontSize: '0.8rem', 
                        color: '#999'
                      }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <pre style={{ 
                      margin: 0, 
                      fontSize: '0.9rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all'
                    }}>
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  </div>
                ))
            )}
          </div>
        )}
      </div>
      
      {/* 表结构显示模态框 */}
      {showTableStructure && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '1.5rem',
            maxWidth: '80vw',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1rem',
              borderBottom: '1px solid #e0e0e0',
              paddingBottom: '1rem'
            }}>
              <Title heading={3}>📊 表结构信息</Title>
              <Button 
                type="tertiary" 
                theme="borderless"
                onClick={() => setShowTableStructure(false)}
                icon={<IconClose />}
              >
                关闭
              </Button>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <Text type="secondary">
                共发现 {tableStructureData.length} 个表格，以下是详细的表结构信息：
              </Text>
            </div>
            
            {tableStructureData.map((table, index) => (
              <Card 
                key={table.id} 
                style={{ marginBottom: '1rem' }}
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Tag color="blue">{index + 1}</Tag>
                    <Text strong>{table.tableName}</Text>
                    <Text type="secondary" size="small">({table.id})</Text>
                  </div>
                }
              >
                <div style={{ marginBottom: '0.5rem' }}>
                  <Text strong>字段数量：</Text>
                  <Tag color="green">{table.fields.length} 个字段</Tag>
                </div>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: '0.5rem',
                  marginTop: '1rem'
                }}>
                  {table.fields.map((field: any) => (
                    <div 
                      key={field.id}
                      style={{
                        padding: '0.5rem',
                        border: '1px solid #e0e0e0',
                        borderRadius: '4px',
                        backgroundColor: '#fafafa'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong>{field.name}</Text>
                        <Tag size="small" color="orange">类型 {field.type}</Tag>
                      </div>
                      <Text type="secondary" size="small" style={{ display: 'block', marginTop: '0.25rem' }}>
                        ID: {field.id}
                      </Text>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
            
            <div style={{ 
              marginTop: '1.5rem', 
              padding: '1rem',
              backgroundColor: '#f0f9ff',
              borderRadius: '4px',
              border: '1px solid #bae7ff'
            }}>
              <Title heading={4}>💡 多表联查提示</Title>
              <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                <li>相同字段名的表格可以使用 UNION 合并数据</li>
                <li>有关联字段的表格可以使用 JOIN 连接查询</li>
                <li>开启多表联查模式后，AI会自动分析表格关联关系</li>
                <li>建议在查询中明确描述需要哪些表格的数据</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
