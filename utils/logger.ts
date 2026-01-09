// 日志管理工具

interface LogEntry {
  id: string;            // 唯一标识符
  timestamp: number;     // 时间戳
  type: 'ai_request' | 'ai_response' | 'table_data' | 'sql_execution' | 'result_processing' | 'ui_state' | 'field_analysis'; // 日志类型
  data: any;             // 日志数据
  context?: string;      // 上下文信息
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 100; // 最大日志数量

  // 生成唯一标识符
  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // 记录日志
  log(type: LogEntry['type'], data: any, context?: string): void {
    const logEntry: LogEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      type,
      data,
      context
    };

    // 添加到日志数组
    this.logs.push(logEntry);

    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // 删除最旧的日志
    }

    // 在控制台打印日志
    console.log(`[${logEntry.type}] ${logEntry.context || ''}`, logEntry.data);
  }

  // 获取所有日志
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  // 根据类型获取日志
  getLogsByType(type: LogEntry['type']): LogEntry[] {
    return this.logs.filter(log => log.type === type);
  }

  // 清空日志
  clearLogs(): void {
    this.logs = [];
  }

  // 导出日志为JSON
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

// 创建单例实例
const logger = new Logger();

export default logger;
export type { LogEntry };
