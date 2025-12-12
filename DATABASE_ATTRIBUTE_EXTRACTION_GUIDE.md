# 思源笔记 - 数据库块属性提取指南

## 项目概述
**SiYuan Database Display Plugin** 是一个思源笔记插件，用于在文档和块上显示数据库（属性视图）的属性值，支持99%的块类型。

---

## 一、获取块数据库属性的完整流程

### 1.1 数据获取入口

#### API调用链路
```
getAttributeViewKeys(blockID)
  └─> /api/av/getAttributeViewKeys
      └─> 返回 viewKeys 数据结构 (包含所有绑定的属性视图信息)
```

#### 核心函数定义 (src/api.ts)
```typescript
export async function getAttributeViewKeys(id: BlockId) {
    const data = { id: id }
    const url = '/api/av/getAttributeViewKeys';
    return request(url, data);
}
```

### 1.2 数据结构

#### 响应数据结构
```typescript
// viewKeys 是一个数组，每个元素对应一个属性视图
[
  {
    avID: string,                    // 属性视图ID
    keyValues: [
      {
        key: {
          id: string,               // 字段ID
          name: string,             // 字段名称 (如 "优先级", "截止日期")
          type: KeyType,            // 字段类型
          icon: string,             // 字段图标
          options?: KeyOption[]      // 选项列表 (用于select/mSelect)
        },
        values: [
          {
            // 根据类型包含不同字段
            text?: { content: string }
            number?: { content: number }
            date?: { 
              content: number        // 时间戳
              hasEndDate?: boolean
              content2?: number      // 结束时间戳
              isNotTime?: boolean    // 是否不包含时间部分
            }
            mSelect?: Array<{ content: string; color: string }>
            checkbox?: { checked: boolean }
            url?: { content: string }
            email?: { content: string }
            phone?: { content: string }
            mAsset?: Array<{ name: string }>
            created?: { content: number }
            updated?: { content: number }
            select?: { content: string; color: string }
            relation?: Array<{ blockID: string; content: string }>
            template?: { content: string }
          }
        ]
      }
    ]
  }
]
```

### 1.3 支持的字段类型 (KeyType)

| 类型 | 说明 | 数据结构示例 |
|------|------|-----------|
| `text` | 文字 | `{ text: { content: "文本内容" } }` |
| `number` | 数字 | `{ number: { content: 100 } }` |
| `date` | 日期 | `{ date: { content: 1703769600000, hasEndDate: false, isNotTime: true } }` |
| `select` | 单选 | `{ select: { content: "选项1", color: "#ff0000" } }` |
| `mSelect` | 多选 | `{ mSelect: [{ content: "选项1", color: "#ff0000" }, ...] }` |
| `checkbox` | 复选框 | `{ checkbox: { checked: true } }` |
| `url` | 网址 | `{ url: { content: "https://example.com" } }` |
| `email` | 邮箱 | `{ email: { content: "user@example.com" } }` |
| `phone` | 电话 | `{ phone: { content: "13800000000" } }` |
| `mAsset` | 资源/附件 | `{ mAsset: [{ name: "file.pdf" }, ...] }` |
| `created` | 创建时间 | `{ created: { content: 1703769600000 } }` |
| `updated` | 更新时间 | `{ updated: { content: 1703769600000 } }` |
| `relation` | 关联 | `{ relation: [{ blockID: "xxx", content: "..." }] }` |
| `template` | 模板 | `{ template: { content: "..." } }` |
| `block` | 主键(块) | `{ block: { content: "...", blockID: "xxx", isDetached: false } }` |

---

## 二、数据提取和处理

### 2.1 元数据提取 (src/extract-meta.ts)

#### 核心函数
```typescript
export function extractContentsWithMeta(
    data: any,                    // viewKeys 数据
    conditions: string[],         // 要提取的字段类型 (如 ['text', 'date', 'mSelect'])
    hiddenFields: string[],       // 要隐藏的字段名称列表
    dateOptions?: DateFormatOptions,
    checkboxOptions?: { style?: 'emoji' | 'symbol' | 'text' },
    forceShowFields: string[] = []
): ContentWithMeta[]
```

#### 返回数据结构
```typescript
interface ContentWithMeta {
    type: string;                // 字段类型 (用于分类显示)
    text: string;                // 格式化后的显示文本
    // 数据库相关参数
    avID: string;                // 属性视图ID
    keyID: string;               // 字段ID
    keyName: string;             // 字段名称
    keyType: string;             // 字段原始类型
    // 原始值（用于编辑）
    rawValue: any;               // 未格式化的原始值
    // 选择选项（用于 select 和 mSelect）
    selectOptions?: any[];       // 选项列表
}
```

### 2.2 字段值格式化 (src/handleKey.ts)

#### 日期格式化选项
```typescript
interface DateFormatOptions {
    format?: 'YYYY-MM-DD' | 'YYYY/MM/DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'full' | 'relative';
    includeTime?: boolean;       // 是否包含时分秒
    locale?: string;             // 国际化语言
}
```

#### 日期格式示例
- `YYYY-MM-DD`: 2023-12-25
- `YYYY/MM/DD`: 2023/12/25
- `MM/DD/YYYY`: 12/25/2023
- `DD/MM/YYYY`: 25/12/2023
- `full`: Monday, December 25, 2023
- `relative`: 3 days ago / 明天 / 今天

#### 复选框显示样式
```typescript
{
    style?: 'emoji' | 'symbol' | 'text'
}
// emoji: ✅ / ❌
// symbol: ☑ / ☐
// text: Selected / Unselected
```

### 2.3 数据处理流程

```
获取 viewKeys
    ↓
提取元数据 (extractContentsWithMeta)
    ├─ 遍历每个属性视图 (avID)
    ├─ 遍历每个字段 (key: id, name, type)
    ├─ 遍历每个值
    └─ 检查字段类型是否在 conditions 中
        └─ 检查字段名是否在 hiddenFields 中
            └─ 格式化值 (getConditionTexts)
                ├─ 日期: 按格式化选项格式化
                ├─ 复选框: 转换为图标
                ├─ 多选: 提取所有选项
                └─ 其他: 直接提取内容
                    ↓
                返回 ContentWithMeta 对象
```

---

## 三、高级操作 (AVManager - src/db_pro.ts)

### 3.1 属性视图核心操作

#### 获取属性视图信息
```typescript
async getAttributeView(avID: string): Promise<GetAttributeViewResponse>
```

#### 渲染属性视图 (获取完整数据)
```typescript
async renderAttributeView(
    avID: string,
    options?: { 
        viewID?: string; 
        page?: number; 
        pageSize?: number; 
        query?: any 
    }
): Promise<RenderAttributeViewResponse>
```

### 3.2 字段(Key)操作

#### 获取字段列表 (带缓存)
```typescript
async getAttributeViewKeysByAvID(avID: string): Promise<AttributeViewKey[]>
// 带1分钟缓存，可减少API调用
```

#### 字段列表结构
```typescript
interface AttributeViewKey {
    id: string;                  // 字段ID
    name: string;               // 字段名称
    type: KeyType;              // 字段类型
    icon: string;               // 字段图标
    options?: KeyOption[];      // 选项列表 (select/mSelect)
}

interface KeyOption {
    id: string;
    name: string;
    color: string;              // 16进制颜色码
}
```

### 3.3 数据块和属性值操作

#### 块ID ↔ ItemID 映射
```typescript
// 将块ID转换为行ID
async getItemIDsByBoundIDs(avID: string, blockIDs: string[]): Promise<Record<string, string>>
// 返回: { blockID: itemID }

// 将行ID转换为块ID  
async getBoundBlockIDsByItemIDs(avID: string, itemIDs: string[]): Promise<Record<string, string>>
// 返回: { itemID: blockID }
```

#### 设置属性值
```typescript
async setAttributeViewBlockAttrByItemID(
    avID: string,
    itemID: string,
    keyID: string,
    value: any
): Promise<void>
```

---

## 四、使用示例

### 4.1 完整的数据获取示例

```typescript
import { getAttributeViewKeys } from './api';
import { extractContentsWithMeta } from './extract-meta';

// 1. 获取块的属性视图数据
const blockID = 'your-block-id';
const viewKeys = await getAttributeViewKeys(blockID);

// 2. 定义显示配置
const conditions = ['text', 'date', 'mSelect', 'checkbox']; // 要显示的字段类型
const hiddenFields = ['password', 'internal']; // 隐藏的字段名称
const dateOptions = { 
    format: 'YYYY-MM-DD', 
    includeTime: true 
};
const checkboxOptions = { style: 'emoji' };

// 3. 提取并格式化数据
const contentsWithMeta = extractContentsWithMeta(
    viewKeys,
    conditions,
    hiddenFields,
    dateOptions,
    checkboxOptions,
    ['priority', 'status'] // 强制显示这些字段，即使为空
);

// 4. 遍历结果
contentsWithMeta.forEach(item => {
    console.log(`字段: ${item.keyName} | 类型: ${item.type} | 值: ${item.text}`);
    // 访问属性视图ID: item.avID
    // 访问字段ID: item.keyID
    // 访问原始值: item.rawValue (用于编辑)
});
```

### 4.2 日期范围处理

```typescript
// 当 date.hasEndDate = true 时
date: {
    content: 1703769600000,   // 开始时间
    content2: 1704374400000,  // 结束时间
    hasEndDate: true
}
// 显示为: "2023-12-25 ~ 2024-01-05"
```

### 4.3 多选字段处理

```typescript
mSelect: [
    { content: "高优先级", color: "#ff0000" },
    { content: "紧急", color: "#ff6600" },
    { content: "需跟进", color: "#0066ff" }
]
// 显示为: "高优先级 | 紧急 | 需跟进"
```

---

## 五、集成要点

### 5.1 事件监听
```typescript
// 属性视图更新事件
window.siyuan.ws.ws.addEventListener('message', async (e) => {
    const msg = JSON.parse(e.data);
    if (msg.cmd === "transactions") {
        if (msg.data[0].doOperations[0].action === "updateAttrViewCell") {
            // 属性值已更新，刷新显示
            await this.showdata_doc();
        }
    }
});
```

### 5.2 缓存管理
```typescript
// 属性视图键缓存 (1分钟)
private keyCache: Map<string, { keys: AttributeViewKey[], timestamp: number }>;

// 清除指定属性视图的缓存
clearKeyCache(avID?: string): void

// 强制刷新缓存
getAttributeViewKeysByAvID(avID, forceRefresh = true)
```

### 5.3 编辑集成
```typescript
// 编辑前需要转换块ID到itemID
const { AVManager } = await import('./db_pro');
const avManager = new AVManager();
const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID]);
const itemID = mapping[blockID];

// 然后使用 itemID 更新属性值
await avManager.setAttributeViewBlockAttrByItemID(
    avID,
    itemID,
    keyID,
    newValue
);
```

---

## 六、配置选项

### 用户可配置的参数
```typescript
// 文档块显示字段
dis-show: "mSelect,number,date,text,mAsset,checkbox,phone,url,email,created,updated"

// 普通块显示字段
dis-show-block: "mSelect,number,date,text,mAsset,checkbox,phone,url,email,created,updated"

// 隐藏的字段名称 (逗号分隔)
hidden-fields: "password,internalNotes"

// 日期格式
date-format: "YYYY-MM-DD" | "YYYY/MM/DD" | "MM/DD/YYYY" | "DD/MM/YYYY" | "full" | "relative"

// 是否显示具体时间
include-time: true | false

// 复选框样式
checkbox-style: "emoji" | "symbol" | "text"

// 是否显示created/updated字段
show-timestamps: true | false

// 最大显示长度 (超长显示省略号)
max-display-length: 30

// 强制显示的字段名称 (即使为空)
force-show-fields: ["priority", "status"]

// 字段颜色 (JSON格式)
field-color-map: '{"date":"#0066ff","number":"#ff6600"}'

// 字段背景颜色
field-bg-color-map: '{"checkbox":"#f0f0f0"}'

// 值级别颜色 (JSON格式)
field-value-color-map: '{"已完成":"#00cc00","未完成":"#ff0000"}'
```

---

## 七、常见问题处理

### 7.1 时间戳处理
```typescript
// 检测时间戳类型（秒 vs 毫秒）
const timestamp = value.date.content;
const date = new Date(timestamp > 10000000000 ? timestamp : timestamp * 1000);
// > 10000000000 表示毫秒级，否则是秒级
```

### 7.2 空值过滤
```typescript
// 自动过滤以下情况：
// - null / undefined
// - 空字符串
// - 空数组
// - 未定义的字段

if (t !== undefined && t !== null && t !== '') {
    results.push(contentMeta);
}
```

### 7.3 字段名匹配
```typescript
// 支持模糊匹配或精确匹配
const key = keys.find(k => k.name === keyName);
// 如果使用中文字段名，确保编码一致
```

---

## 八、性能优化建议

1. **缓存属性视图键** (已内置)
   - 1分钟自动过期
   - 可手动清除缓存

2. **批量获取数据**
   - 一次调用 getAttributeViewKeys 获取所有属性视图
   - 避免多次调用相同的 API

3. **条件过滤**
   - 使用 conditions 数组过滤不需要的字段类型
   - 使用 hiddenFields 隐藏敏感字段

4. **增量更新**
   - 使用 WebSocket 事件而不是定时轮询
   - 只在属性值变化时刷新显示

---

## 九、API 端点汇总

| 功能 | 端点 | 请求 | 响应 |
|------|------|------|------|
| 获取属性视图键 | `/api/av/getAttributeViewKeys` | `{ id: blockID }` | 属性视图列表 |
| 获取属性视图信息 | `/api/av/getAttributeView` | `{ id: avID }` | 属性视图详情 |
| 渲染属性视图 | `/api/av/renderAttributeView` | `{ id, viewID?, page?, pageSize? }` | 渲染结果 |
| 获取字段列表 | `/api/av/getAttributeViewKeysByAvID` | `{ avID }` | 字段数组 |
| 块ID转itemID | `/api/av/getAttributeViewItemIDsByBoundIDs` | `{ avID, blockIDs }` | ID映射 |
| ItemID转块ID | `/api/av/getAttributeViewBoundBlockIDsByItemIDs` | `{ avID, itemIDs }` | ID映射 |
| 设置属性值 | `/api/av/setAttributeViewBlockAttr` | `{ avID, keyID, itemID, value }` | 操作结果 |

---

## 参考文档

- 思源API文档: https://github.com/siyuan-note/siyuan/blob/master/API.md
- 思源API中文文档: https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md
- 项目源代码: src/api.ts, src/db_pro.ts, src/extract-meta.ts, src/handleKey.ts
