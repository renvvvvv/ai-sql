# 🚀 AI-Powered SQL Query Generator for Lark Base

An intelligent multi-table SQL query generator with AI-powered natural language processing, specifically designed for Lark Base (飞书多维表格).

## ✨ Key Features

- 🤖 **AI-Powered Query Generation**: Convert natural language to SQL queries using advanced AI
- 🔗 **Multi-Table Support**: Intelligent JOIN, UNION, and subquery generation across multiple tables
- 🧠 **Smart Error Recovery**: Automatic error detection, analysis, and correction
- 🌐 **Chinese Character Support**: Handles Chinese aliases and field names seamlessly
- 📊 **Data Quality Analysis**: Pre-checks for data completeness and consistency
- 🎯 **5-Strategy Approach**: Generates multiple query alternatives for optimal results
- 📈 **Progress Tracking**: Real-time query generation progress with detailed feedback
- 🔄 **Error Learning**: Learns from execution errors to improve subsequent queries

## 🏗️ Architecture

```
├── libs/
│   ├── ai-service/          # AI service integration and smart multi-table logic
│   ├── bs-sdk/             # Lark Base SDK wrapper
│   └── bs-sql/             # SQL execution engine
├── views/
│   └── App/                # Main application UI components
├── utils/                  # Utility functions and helpers
└── pages/                  # Next.js pages and API routes
```

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ 
- npm or pnpm
- AI service API key (OpenAI compatible)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repository-url>
   cd ai-sql-query-generator
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your AI service configuration:
   ```env
   AI_ENDPOINT=https://your-ai-service.com/api/v1/chat/completions
   AI_API_KEY=your-api-key-here
   AI_MODEL=gpt-3.5-turbo
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

## 🎮 Usage

### Basic Query

1. **Enable Multi-Table Mode**: Click the multi-table query toggle
2. **Enter Natural Language**: Type your query in Chinese or English
   ```
   "各个楼栋的项目工程费用汇总"
   "Show total costs by building"
   ```
3. **Review Strategies**: The AI generates 5 different SQL approaches
4. **Execute & Analyze**: System automatically tests and selects the best result

### Advanced Features

- **Error Recovery**: Failed queries are automatically analyzed and improved
- **Data Quality Checks**: Empty tables and invalid data are detected
- **Chinese Support**: Chinese field names are automatically converted to English aliases
- **Progress Tracking**: Real-time feedback on query generation steps

## 🔧 Configuration

### AI Service Setup

The system supports any OpenAI-compatible API:

```typescript
// libs/ai-service/AIService.ts
const config = {
  apiKey: process.env.AI_API_KEY,
  endpoint: process.env.AI_ENDPOINT,
  model: process.env.AI_MODEL || 'gpt-3.5-turbo'
};
```

### Proxy Server (Optional)

For CORS handling, use the included proxy server:

```bash
# In project root
node proxy.js
```

## 📚 Core Components

### AISmartMultiTableService

The heart of the system - handles the 4-step AI-driven process:

1. **AI Field Analysis**: Identifies relevant tables and fields
2. **AI Data Analysis**: Analyzes data patterns and relationships  
3. **AI Strategy Generation**: Creates 5 different SQL approaches
4. **Iterative Testing**: Tests and improves based on execution results

### Chinese Character Handling

Automatic conversion of Chinese aliases to English:

```typescript
// Before: AS 楼栋, AS 项目工程费用汇总
// After:  AS building, AS total_cost
```

### Error Recovery System

Intelligent error analysis and correction:

- Parse errors → Syntax fixes
- Chinese encoding → Alias conversion
- JOIN errors → Relationship validation
- Data type errors → Type matching

## 🛠️ Development

### Project Structure

```
src/
├── libs/ai-service/
│   ├── AIService.ts                    # Main AI service
│   ├── AISmartMultiTableService.ts     # Enhanced multi-table logic
│   └── types.ts                        # Type definitions
├── views/App/
│   └── index.tsx                       # Main UI component
└── utils/
    ├── logger.ts                       # Logging utility
    └── useBase.ts                      # Lark Base hooks
```

### Key Technologies

- **Next.js 13**: React framework
- **TypeScript**: Type safety
- **Semi Design**: UI components
- **AlaSQL**: Client-side SQL execution
- **Lark Base SDK**: Integration with Lark Base

## 📖 Documentation

- [Enhanced Multi-Table Logic](./ENHANCED_MULTI_TABLE_LOGIC.md)
- [Chinese Encoding Fix](./CHINESE_ENCODING_FIX.md)
- [AI-Driven Multi-Table Logic](./AI_DRIVEN_MULTI_TABLE_LOGIC.md)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Lark Base team for providing the excellent SDK
- Semi Design for the beautiful and functional UI components
- The open-source community for various tools and libraries used in this project

## 📞 Support

- 📧 Email: 2744689162@qq.com
- 🐛 Issues: Create issues in your repository
- 📖 Docs: Check the documentation files in the project

---

**Built with ❤️ by renvvvvv for efficient data querying and analysis**
