# SiYuan 数据库显示插件 - 快速参考指南

## 🎯 核心概念速查

### DOM 监听层次
```
Level 1: 事件总线 (EventBus)
├─ switch-protyle      → 用户打开文档
├─ loaded-protyle-*    → 编辑器加载完成
└─ 最高优先级，立即响应

Level 2: WebSocket 消息
├─ updateAttrViewCell  → 数据库单元格更新
└─ 用于实时同步

Level 3: MutationObserver
├─ 观察 .protyle-attr--av 元素变化
└─ 防抖 50ms，自动补充显示

Level 4: 定时刷新
├─ setInterval (用户配置)
└─ 智能休眠机制
```

### DOM 插入位置
```
文档级别 (showdata_doc):
  .protyle-title (data-node-id = currentDocId)
    └─ .protyle-attr
        └─ .my-protyle-attr--av (我们的容器)
            └─ span.popover__block × N (每个字段)

块级别 (showdata_block):
  [custom-avs] (data-node-id = currentDocId)
    └─ .protyle-attr
        └─ .my-protyle-attr--av (我们的容器)
            └─ span.popover__block × N (每个字段)
```

### 数据流向
```
API: getAttributeViewKeys(blockID)
  ↓ 返回原始数据结构
{
  avID: "xxx",
  keyValues: [
    {
      key: { id, name, type, options },
      values: [
        {
          text?: { content },
          number?: { content },
          date?: { content, hasEndDate, content2 },
          mSelect?: [{ content, color }],
          ...
        }
      ]
    }
  ]
}
  ↓
提取层: extractContentsWithMeta()
  - 检查隐藏字段
  - 匹配条件类型
  - 提取原始值
  ↓
ContentWithMeta[] {
  type,           // 条件类型（mSelect, number, 等）
  text,           // 显示文本
  avID,           // 数据库ID
  keyID,          // 字段ID
  keyName,        // 字段名
  keyType,        // 字段类型
  rawValue,       // 原始值（用于编辑）
  selectOptions   // 选项列表（select/mSelect）
}
  ↓
DOM 层: 创建 span 元素并存储到 dataset
  ↓
编辑层: enableInlineEdit() 弹出编辑界面
```

---

## 📍 关键位置速查

### 监听代码位置
| 监听类型 | 文件 | 函数 | 行号 |
|---------|------|------|------|
| EventBus | index.ts | onload() | ~40-65 |
| WebSocket | index.ts | onLayoutReady() | ~240-250 |
| MutationObserver | index.ts | startAttrObserver() | ~420-480 |
| 定时刷新 | index.ts | initAutoInterval() | ~330-360 |

### DOM 操作代码位置
| 操作 | 文件 | 函数 | 主要步骤 |
|------|------|------|---------|
| 查询容器 | index.ts | showdata_doc/block() | querySelectorAll() |
| 过滤特殊容器 | index.ts | isTlHtmlContainer() | classList 和 id 检查 |
| 清空旧显示 | index.ts | showdata_doc/block() | querySelectorAll('.my-protyle-attr--av') + remove() |
| 创建元素 | index.ts | showdata_doc/block() | createElement('div/span') |
| 应用样式 | index.ts | applyColors() | style.color/backgroundColor 设置 |
| 插入 DOM | index.ts | showdata_doc/block() | insertBefore() |

### 数据处理代码位置
| 操作 | 文件 | 函数 | 输入 | 输出 |
|------|------|------|------|------|
| 提取元数据 | extract-meta.ts | extractContentsWithMeta() | viewKeys[] | ContentWithMeta[] |
| 类型匹配 | extract-meta.ts | valueMatchesCondition() | value, condition | boolean |
| 原始值提取 | extract-meta.ts | extractRawValue() | value, condition | any |
| 文本转换 | handleKey.ts | getConditionTexts() | value, type | string[] |
| 颜色应用 | index.ts | applyColors() | element, type, text | void |

### 编辑交互代码位置
| 操作 | 文件 | 函数 | 说明 |
|------|------|------|------|
| 绑定编辑事件 | index.ts | addEditEventToSpan() | click/contextmenu 监听 |
| 类型判断 | inline-edit.ts | enableInlineEdit() | switch 语句选择编辑方式 |
| 特殊编辑 | inline-edit.ts | handleCheckboxEdit() 等 | 各类型的编辑实现 |
| 值转换 | inline-edit.ts | convertToAVValue() | 用户输入 → API 格式 |
| API 保存 | db_pro.ts | setBlockAttribute() | 发送 HTTP 请求 |

---

## 🔧 常见修改

### 添加新的字段类型显示
```typescript
// 1. 在 extract-meta.ts 添加类型判断
function valueMatchesCondition(value: any, condition: string): boolean {
    case 'myType':
        return !!value.myType?.content;
}

// 2. 添加原始值提取
function extractRawValue(value: any, condition: string): any {
    case 'myType':
        return value.myType?.content || '';
}

// 3. 在 handleKey.ts 添加文本转换
export function getConditionTexts(value: any, type: string): string[] {
    case 'myType':
        return [value.myType?.content || ''];
}

// 4. 如果需要特殊编辑，在 inline-edit.ts 添加
function enableInlineEdit(options) {
    case 'myType':
        handleMyTypeEdit(options);
        break;
}
```

### 修改 DOM 选择器
```typescript
// 查找方式在这些函数中修改：
- showdata_doc() 中的 document.querySelectorAll('.protyle-title')
- showdata_block() 中的 document.querySelectorAll('[custom-avs]')
- attrContainer 定位中的 classList.contains('protyle-attr')
```

### 调整显示样式
```typescript
// 在 applyColors() 中修改样式逻辑
function applyColors(ele: HTMLElement, type: string, valueText: string) {
    // 修改颜色逻辑、padding、borderRadius 等
    ele.style.padding = '2px 4px';  // 这里
    ele.style.borderRadius = '4px';  // 这里
}
```

### 修改缓存策略
```typescript
// db_pro.ts 中
private cacheTimeout: number = 1 * 60 * 1000; // 改为其他值

// 或手动清除缓存
avManager.clearKeyCache(avID);
```

### 调整自动刷新
```typescript
// index.ts 中
private autoRunMax: number = 10;  // 改为其他值来调整休眠阈值

// 手动唤醒
this.wakeAuto();
```

---

## 🐛 常见问题排查

### 问题：字段显示不出来
```
排查步骤：
1. 检查 conditions 配置是否包含该字段类型
   → 在 showdata_doc/block() 中查看 disShow_doc/disShow_block
   
2. 检查字段是否在隐藏列表中
   → 检查 hiddenFields 配置
   
3. 检查 valueMatchesCondition() 是否返回 true
   → 在 extract-meta.ts 中添加 console.log 调试
   
4. 检查 getConditionTexts() 是否返回正确文本
   → 在 handleKey.ts 中添加 console.log 调试
   
5. 检查 DOM 插入是否成功
   → 打开开发者工具检查是否有 .my-protyle-attr--av 元素
```

### 问题：编辑后没有更新
```
排查步骤：
1. 检查 setBlockAttribute() 是否调用成功
   → 查看浏览器 Network 标签
   
2. 检查 refreshCallback() 是否被调用
   → 在 handleEditClick() 中添加 console.log
   
3. 检查 clearKeyCache() 是否被调用
   → 缓存可能过期导致显示不更新
   
4. 检查 WebSocket 消息是否被接收
   → 在 onLayoutReady() 的 message 监听中添加 console.log
```

### 问题：性能很差
```
排查步骤：
1. 检查是否有过多的 querySelectorAll 调用
   → 使用 Performance 标签查看
   
2. 检查 MutationObserver 是否触发过于频繁
   → 在回调中添加 console.log 计数
   
3. 检查 API 调用频率
   → 查看 Network 标签中的请求数
   
4. 检查自动刷新是否正在运行
   → 查看是否有 autoTimer 在持续运行
   
5. 检查缓存是否有效
   → 在 getAttributeViewKeysWithCache() 中添加日志
```

---

## 📊 性能指标参考

| 指标 | 当前值 | 优化目标 | 说明 |
|------|--------|---------|------|
| 缓存时长 | 1 分钟 | 可配置 | 越长性能越好但数据可能不新 |
| MutationObserver 防抖 | 50ms | 可调整 | 越短越实时但越耗资源 |
| 自动刷新最大次数 | 10 次 | 可调整 | 越大越耗资源 |
| 自动刷新最小间隔 | 5 秒 | 可调整 | 越小越实时但越耗资源 |

---

## 🔐 安全注意事项

### 可能的安全问题
```
1. 通过 dataset 存储原始值时，没有验证输入
   → 确保 JSON.parse() 不会执行恶意代码
   
2. 直接使用 textContent 设置用户输入
   → 这是安全的（已防止 XSS）
   
3. API 调用时的权限检查
   → 思源后端负责，插件不需要额外检查
   
4. 编辑时的数据验证
   → 建议在保存前进行类型和范围验证
```

### 建议的安全实践
```typescript
// 安全地解析 dataset
try {
    const value = JSON.parse(element.dataset.rawValue);
    // 验证 value 的类型和内容
} catch (e) {
    console.error('Invalid JSON in dataset');
}

// 验证用户输入
if (keyType === 'number' && isNaN(newValue)) {
    showError('请输入有效的数字');
    return;
}

// 验证 URL
if (keyType === 'url' && !isValidUrl(newValue)) {
    showError('请输入有效的 URL');
    return;
}
```

---

## 📚 参考资源

### 相关文档
- [完整分析文档](./DOM_LISTENING_AND_INSERTION_ANALYSIS.md)
- [大模型提示词库](./LLM_PROMPTS.md)
- [思源笔记 API 文档](https://github.com/siyuan-note/siyuan/blob/master/API.md)
- [思源笔记 API 中文文档](https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md)

### 关键代码文件
- `src/index.ts` - 主插件文件 (500+ 行)
- `src/db_pro.ts` - AVManager 数据库操作类 (800+ 行)
- `src/extract-meta.ts` - 数据提取转换 (200 行)
- `src/inline-edit.ts` - 编辑界面 (600 行)
- `src/handleKey.ts` - 字段类型处理 (300 行)

### 开发工具
```bash
# 启动开发服务
pnpm dev

# 构建生产版本
pnpm build

# 运行测试（如果有）
pnpm test

# 代码检查
pnpm lint
```

---

## 💡 最佳实践速记

### ✅ 做这些
```
1. 使用防抖处理高频事件
2. 缓存 API 响应数据
3. 清晰地分离关注点（数据、DOM、事件）
4. 添加详细的错误处理和用户反馈
5. 使用 data-* 属性存储关联数据
6. 定期清理不再需要的引用避免内存泄漏
7. 写可读性强的代码注释
8. 测试边界情况和错误场景
```

### ❌ 避免这些
```
1. 在循环中重复查询 DOM
2. 忽视 WebSocket 消息的延迟
3. 直接修改全局变量而不同步状态
4. 忘记注销事件监听器
5. 嵌套过深的回调函数（回调地狱）
6. 假设用户的网络连接稳定
7. 在 dataset 中存储大量数据
8. 使用 setTimeout 而不是 requestAnimationFrame 处理视觉更新
```

---

## 📋 快速检查清单

在提交代码前检查：

- [ ] 所有新增的事件监听器都在 onunload 中注销了吗？
- [ ] MutationObserver 在卸载时 disconnect() 了吗？
- [ ] 定时器都在卸载时 clearInterval() 了吗？
- [ ] 新增的 API 调用是否添加了超时和错误处理？
- [ ] 新的 DOM 操作是否考虑了文档/块的不同场景？
- [ ] 特殊容器（如 TalDraw）是否被正确过滤了？
- [ ] 新字段类型是否在所有相关的 switch 语句中处理了？
- [ ] 缓存更新逻辑是否正确？
- [ ] 用户看到友好的错误提示了吗？
- [ ] 代码有必要的注释和文档吗？
- [ ] 性能是否可接受（没有长时间阻塞）？
- [ ] 内存泄漏的可能性是否消除了？

