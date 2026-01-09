import Parser from "js-sql-parser";

export function sqlFieldReplace(sql: string, replaceMap: Map<string, string>) {
  const reg = /([^\s,?= ]+)/gm;
  return sql.replace(reg, (match, p1) => {
    const trimmedMatch = match.trim();
    const replacement = replaceMap.get(trimmedMatch) ?? replaceMap.get(p1);
    if (
      !replacement &&
      trimmedMatch.includes("(") &&
      trimmedMatch.includes(")")
    ) {
      return trimmedMatch.replace(/\((.+)\)/gm, (match, p1) => {
        const replacement = replaceMap.get(p1);
        return `(${replacement || p1})`;
      });
    }
    return replacement || match;
  });
}

export function replaceName(sql: string, replaceMap: Map<string, string>) {
  replaceMap.forEach((id, name) => {
    sql = sql.replace(name, id);
  });
  return sql;
}

export function replaceFieldNames(
  query: string | any,
  fieldReplacements: any,
  tableReplacements: any,
  extFields?: string[]
) {
  const ast = typeof query === "string" ? Parser.parse(query) : query;

  // console.log(ast);
  const tableAliasMap: any = {};

  function traverseTableName(node: any) {
    if (!node || typeof node !== "object") return;

    if (node.type === "SubQuery") {
      // console.log(JSON.stringify(node));
      node.value = replaceFieldNames(
        node.value,
        fieldReplacements,
        tableReplacements
      );
    }

    // 处理表别名
    if (node.type === "TableFactor") {
      if (node.alias && node.alias.value) {
        tableAliasMap[node.alias.value] = node.value.value;
        node.value.value =
          tableReplacements[extantName(node.value.value)] || node.value.value;
      } else {
        tableAliasMap[node.value.value] = node.value.value;
        node.value.value =
          tableReplacements[extantName(node.value.value)] || node.value.value;
      }
    }

    // 遍历子节点
    Object.keys(node).forEach((key) => {
      if (typeof node[key] === "object") {
        traverseTableName(node[key]);
      }
    });
  }

  function traverse(node: any) {
    if (!node || typeof node !== "object") return;

    // 处理表别名
    if (node.type === "TableFactor") {
      return;
    }

    // 处理函数调用中的参数，如MIN(fld09uvSfe)
    if (node.type === "FunctionCall") {
      if (node.args && Array.isArray(node.args)) {
        node.args.forEach((arg: any) => {
          traverse(arg);
        });
      }
    }

    // 处理字段名
    if (node.type === "Identifier") {
      // 处理字段名到字段ID的映射
      if (node.value.includes(".")) {
        const [tableAlias, columnName] = node.value.split(".");
        const actualTable = tableAliasMap[tableAlias];
        const newColumnName = 
          fieldReplacements[actualTable] && 
          fieldReplacements[actualTable][columnName];
        if (newColumnName) {
          const tableMap = 
            tableReplacements[extantName(tableAlias)] || tableAlias;
          node.value = `${tableMap}.${newColumnName}`;
        }
      } else {
        // 检查是否是直接使用的字段ID
        let fieldMatched = false;
        
        // 首先检查是否是字段ID直接映射
        Object.keys(fieldReplacements).some((table) => {
          // 检查字段名到字段ID的映射
          const mapTable = tableReplacements[extantName(table)] || table;
          const newColumnName = fieldReplacements[table][node.value];
          
          if (newColumnName) {
            // 字段名映射到字段ID
            node.value = `${mapTable}.${newColumnName}`;
            fieldMatched = true;
            return true;
          }
          // 检查字段ID是否直接在字段映射中
          else {
            // 检查字段ID是否存在于任何表格的字段映射中
            const tables = Object.keys(fieldReplacements);
            for (const t of tables) {
              const fieldsMapId = Object.keys(fieldReplacements[t]);
              if (fieldsMapId.includes(node.value)) {
                // 直接使用的字段ID，不需要替换
                node.value = `${tableReplacements[extantName(t)] || t}.${node.value}`;
                fieldMatched = true;
                return true;
              }
            }
          }
        });
        
        // 如果没有匹配的字段映射，尝试使用当前激活表格
        if (!fieldMatched) {
          // 获取第一个表格作为默认表格
          const firstTable = Object.keys(fieldReplacements)[0];
          if (firstTable) {
            const mapTable = tableReplacements[extantName(firstTable)] || firstTable;
            node.value = `${mapTable}.${node.value}`;
          }
        }
      }
    }

    if (node.type === "SelectExpr") {
      extFields?.forEach((field) => {
        node.value.push({
          type: "Identifier",
          value: field,
          alias: null,
          hasAs: null,
        });
      });
    }

    // 遍历子节点
    Object.keys(node).forEach((key) => {
      if (typeof node[key] === "object") {
        traverse(node[key]);
      }
    });
  }

  traverseTableName(ast);
  // console.log(JSON.stringify(ast));
  traverse(ast);

  Object.defineProperty(ast, "toString", {
    value: () => Parser.stringify(ast),
  });

  return ast;
}

export function mapToObj(map: Map<string, any>) {
  const obj: any = {};
  map.forEach((v, k) => {
    obj[k] = v;
  });
  return obj;
}

export function extantName(name: string) {
  if (name.startsWith("`") && name.endsWith("`")) {
    return name.substring(1, name.length - 1);
  }
  return name;
}
