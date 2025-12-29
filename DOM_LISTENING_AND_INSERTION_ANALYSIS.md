# SiYuan Database Display 插件 - DOM 监听与插入机制分析

## 项目概述
这是一个思源笔记的数据库显示插件，用于在块属性面板中自动显示和编辑数据库字段值。

---

## 一、DOM 监听机制

### 1. 事件总线监听（核心触发）
**位置**：`src/index.ts` - `onload()` 方法

```typescript
// 监听文档切换事件
this.eventBus.on("switch-protyle", async (event) => {
    const currentDocId2 = event.detail.protyle.block.id;
    currentDocId = await reConfirmedDocId(currentDocId2);
    await this.showdata_doc();
    // ... 遍历处理块
});

// 监听内容加载完成（两个事件）
this.eventBus.on("loaded-protyle-dynamic", this.loaded.bind(this));
this.eventBus.on("loaded-protyle-static", this.loaded.bind(this));
```

**触发时机**：
- 用户切换打开文档时
- 编辑器内容动态/静态加载完成时

### 2. WebSocket 消息监听（实时更新）
**位置**：`src/index.ts` - `onLayoutReady()` 方法

```typescript
window.siyuan.ws.ws.addEventListener('message', async (e) => {
    const msg = JSON.parse(e.data);
    if (msg.cmd === "transactions") {
        if (msg.data[0].doOperations[0].action === "updateAttrViewCell") {
            this.loaded();  // 触发重新加载
        }
    }
});
```

**用途**：监听数据库单元格更新事件，实时刷新显示

### 3. MutationObserver 监听（DOM 变化）
**位置**：`src/index.ts` - `startAttrObserver()` 方法

```typescript
this.attrObserver = new MutationObserver(mutations => {
    let needRefresh = false;
    for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
            if (!(node instanceof HTMLElement)) continue;
            // 检查是否有新的 .protyle-attr--av 元素被添加
            const candidates: HTMLElement[] = [];
            if (node.matches('.protyle-attr--av')) {
                candidates.push(node);
            }
            // ... 若无我们插入的 .my-protyle-attr--av，则标记刷新
            if (!container.querySelector('.my-protyle-attr--av')) {
                needRefresh = true;
            }
        }
    }
    // 防抖处理
    if (needRefresh) {
        setTimeout(() => {
            this.loaded_run();
        }, 50);
    }
});

this.attrObserver.observe(document.body, { childList: true, subtree: true });
```

**作用**：自动补充原始属性视图出现时的显示

### 4. 自动刷新机制
**位置**：`src/index.ts` - 自动刷新相关方法

```typescript
// 定时自动刷新
private autoTimer: any = null;
private autoIntervalSec: number = 0;
private autoRunCount: number = 0;
private sleeping: boolean = false;

private startAuto() {
    this.autoTimer = setInterval(() => this.autoTick(), this.autoIntervalSec * 1000);
}

private autoTick() {
    if (this.sleeping) return;
    this.autoRunCount++;
    this.loaded_run();
    // 连续执行达到阈值(10次)且无外部触发 -> 进入休眠
    if (this.autoRunCount >= this.autoRunMax && !this.externalTriggerFlag) {
        this.enterSleep();
    }
}
```

**特点**：智能休眠机制，减少不必要的计算

---

## 二、DOM 插入机制

### 1. 目标元素定位
**两个场景**：

#### 场景1：文档级别 (showdata_doc)
```typescript
// 查找 .protyle-title 元素（文档标题）
const parentElements = document.querySelectorAll('.protyle-title');
parentElements.forEach(element => {
    // 排除 TalDraw 等特殊容器
    if (this.isTlHtmlContainer(element)) return;
    // 排除隐藏元素和ID不匹配的元素
    if (!element.classList.contains('fn__none') && 
        element.getAttribute('data-node-id') === currentDocId) {
        // 找到目标
    }
});
```

#### 场景2：块级别 (showdata_block)
```typescript
// 查找带 custom-avs 属性的元素
const parentElements = document.querySelectorAll('[custom-avs]');
parentElements.forEach(element => {
    if (element.getAttribute('data-node-id') === currentDocId) {
        // 找到目标
    }
});
```

### 2. 属性容器定位
```typescript
// 在每个目标元素中找到 .protyle-attr 容器
const attrContainer = Array.from(parentElement.children)
    .find((child: Element) => child.classList.contains('protyle-attr'));
```

### 3. 清空旧显示
```typescript
// 移除之前插入的自定义显示
const existingElements = Array.from(
    attrContainer.querySelectorAll('.my-protyle-attr--av')
);
existingElements.forEach((div: HTMLElement) => {
    div.remove();
});
```

### 4. 创建 DOM 元素
```typescript
// 创建容器 div
const newDiv = document.createElement('div');
newDiv.className = 'my-protyle-attr--av';

// 为每个字段创建 span 元素
contentsWithMeta.forEach(contentMeta => {
    const newSpan = document.createElement('span');
    newSpan.className = 'popover__block ariaLabel';
    
    // 应用颜色样式
    applyColors(newSpan, contentMeta.type, contentMeta.text);
    
    // 设置文本内容（支持截断）
    const maxLength = getMaxDisplayLength();
    if (contentStr.length > maxLength) {
        newSpan.textContent = contentStr.substring(0, maxLength) + '...';
        newSpan.setAttribute('aria-label', contentStr);
    } else {
        newSpan.textContent = contentStr;
    }
    
    // 存储元数据到 dataset（用于编辑）
    newSpan.dataset['avId'] = contentMeta.avID;
    newSpan.dataset['keyId'] = contentMeta.keyID;
    newSpan.dataset['keyName'] = contentMeta.keyName;
    newSpan.dataset['rawValue'] = JSON.stringify(contentMeta.rawValue);
    
    // 添加编辑事件
    this.addEditEventToSpan(newSpan, contentMeta, refreshCallback);
    
    newDiv.appendChild(newSpan);
});

// 插入到容器（在最前面）
attrContainer.insertBefore(newDiv, attrContainer.firstChild);
```

### 5. 样式应用
```typescript
function applyColors(ele: HTMLElement, type: string, valueText: string) {
    // 值级别覆盖 (优先级最高)
    if (valueText && fieldValueColorMap) {
        const conf = fieldValueColorMap[valueText];
        if (conf) {
            if (typeof conf === 'string') {
                ele.style.color = conf;
            } else if (typeof conf === 'object') {
                if (conf.color) ele.style.color = conf.color;
                if (conf.bg) {
                    ele.style.backgroundColor = conf.bg;
                    ele.style.padding = '2px 4px';
                    ele.style.borderRadius = '4px';
                }
            }
            return;
        }
    }
    // 类型级别应用
    const color = getColorForType(type);
    const bg = getBgColorForType(type);
    if (color) ele.style.color = color;
    if (bg) {
        ele.style.backgroundColor = bg;
        ele.style.padding = '2px 4px';
        ele.style.borderRadius = '4px';
    }
}
```

---

## 三、编辑交互流程

### 1. 事件绑定
```typescript
addEditEventToSpan(newSpan: HTMLElement, contentMeta: any, refreshCallback) {
    // created/updated 字段不可编辑
    if (['created', 'updated'].includes(contentMeta.type)) {
        return;
    }
    
    newSpan.style.cursor = 'pointer';
    
    // 特殊处理：URL 类型
    if (contentMeta.type === 'url') {
        // 左键：打开链接
        newSpan.addEventListener('click', (e) => {
            window.open(rawValue, '_blank');
        });
        // 右键：编辑
        newSpan.addEventListener('contextmenu', (e) => {
            this.handleEditClick(e, refreshCallback);
        });
    } else {
        // 其他类型：左键编辑
        newSpan.addEventListener('click', async (e) => {
            await this.handleEditClick(e, refreshCallback);
        });
    }
}
```

### 2. 编辑弹窗
**位置**：`src/inline-edit.ts`

```typescript
export function enableInlineEdit(options: InlineEditOptions) {
    // 根据字段类型选择编辑方式
    switch (options.keyType) {
        case 'checkbox':
            handleCheckboxEdit(options);        // 直接切换
            break;
        case 'select':
            handleSelectEdit(options);          // 下拉菜单
            break;
        case 'mSelect':
            handleMultiSelectEdit(options);     // 多选菜单
            break;
        case 'date':
            handleDateEdit(options);            // 日期选择器
            break;
        default:
            handlePopupEdit(options);           // 弹窗编辑
            break;
    }
}
```

### 3. 弹窗元素创建与定位
```typescript
// 创建弹窗容器
const popup = document.createElement('div');
popup.className = 'inline-edit-popup';

// 创建输入框
const inputElement = createTextInput(currentValue, keyType);

// 定位弹窗（避免超出视口）
positionPopup(popup, element);

// 添加到 DOM
document.body.appendChild(popup);

// 自动聚焦
setTimeout(() => {
    inputElement.focus();
}, 10);
```

### 4. 数据保存流程
```typescript
const save = async () => {
    const newValue = getInputValue(inputElement, keyType);
    
    // 转换为数据库格式
    const value = convertToAVValue(keyType, newValue);
    
    try {
        const avManager = new AVManager();
        await avManager.setBlockAttribute(
            avID, 
            keyName, 
            itemID, 
            value, 
            blockID
        );
        
        // 保存成功后刷新
        await refreshCallback();
        
        // 唤醒自动刷新
        this.wakeAuto();
        
        showMessage('保存成功');
    } catch (error) {
        showMessage('保存失败：' + error.message, 5000, 'error');
    }
};
```

---

## 四、核心数据提取流程

### 1. 元数据提取
**位置**：`src/extract-meta.ts`

```typescript
export function extractContentsWithMeta(
    data: any,
    conditions: string[],           // 要提取的字段类型
    hiddenFields: string[],         // 隐藏的字段
    dateOptions?: DateFormatOptions,
    checkboxOptions?: { style?: 'emoji' | 'symbol' | 'text' },
    forceShowFields: string[] = []  // 强制显示的字段
): ContentWithMeta[] {
    const results: ContentWithMeta[] = [];
    
    data.forEach(item => {
        const avID = item.avID;
        const keyValues = item.keyValues || [];
        
        keyValues.forEach(keyValue => {
            const key = keyValue.key;
            
            // 1. 检查隐藏
            if (hiddenFields.includes(key.name)) {
                return;
            }
            
            // 2. 提取值
            const values = keyValue.values || [];
            values.forEach(value => {
                conditions.forEach(condition => {
                    // 3. 类型匹配
                    if (!valueMatchesCondition(value, condition)) {
                        return;
                    }
                    
                    // 4. 文本转换
                    const texts = getConditionTexts(value, condition, dateOptions);
                    texts.forEach(t => {
                        results.push({
                            type: condition,
                            text: String(t),
                            avID,
                            keyID: key.id,
                            keyName: key.name,
                            keyType: key.type,
                            rawValue: extractRawValue(value, condition),
                            selectOptions: key.options
                        });
                    });
                });
            });
        });
    });
    
    return results;
}
```

### 2. 类型匹配判断
```typescript
function valueMatchesCondition(value: any, condition: string): boolean {
    switch (condition) {
        case 'mSelect':     return !!value.mSelect;
        case 'number':      return value.number?.content !== undefined;
        case 'date':        return !!value.date?.content;
        case 'text':        return !!value.text?.content;
        case 'checkbox':    return !!value.checkbox;
        case 'url':         return !!value.url?.content;
        // ... 其他类型
    }
}
```

### 3. 原始值提取（用于编辑回填）
```typescript
function extractRawValue(value: any, condition: string): any {
    switch (condition) {
        case 'text':
            return value.text?.content || '';
        case 'number':
            return value.number?.content || 0;
        case 'date':
            return {
                content: value.date.content,
                hasEndDate: value.date.hasEndDate,
                isNotTime: value.date.isNotTime,
                content2: value.date.content2
            };
        case 'mSelect':
            return value.mSelect?.map(s => s.content) || [];
        case 'checkbox':
            return value.checkbox?.checked || false;
        // ...
    }
}
```

---

## 五、特殊容器过滤

```typescript
private isTlHtmlContainer(element: Element): boolean {
    let current = element;
    while (current && current !== document.documentElement) {
        const isTlContainer = current.classList?.contains('tl-html-container');
        const hasShapeId = current.id?.startsWith('shape:');
        
        if (isTlContainer || hasShapeId) {
            // 再检查是否包含 iconDatabase
            if (this.hasIconDatabase(current)) {
                return true;
            }
        }
        current = current.parentElement;
    }
    return false;
}

private hasIconDatabase(element: Element): boolean {
    const svgElements = element.querySelectorAll('svg');
    for (const svg of svgElements) {
        const useElement = svg.querySelector('use');
        if (useElement?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') === '#iconDatabase') {
            return true;
        }
    }
    return false;
}
```

---

## 六、API 调用层

**位置**：`src/db_pro.ts` - `AVManager` 类

```typescript
class AVManager {
    // 1. 获取属性视图键
    async getAttributeViewKeysByAvID(avID: string): Promise<AttributeViewKey[]>
    
    // 2. 设置块属性
    async setBlockAttribute(
        avID: string, 
        keyName: string, 
        itemID: string, 
        value: setAttributeViewValue
    ): Promise<SetAttributeViewBlockAttrResponse>
    
    // 3. 块ID 与 itemID 映射
    async getItemIDsByBoundIDs(
        avID: string, 
        blockIDs: string[]
    ): Promise<Record<string, string>>
    
    // 4. 批量更新
    async batchUpdateCells(
        avID: string, 
        updates: Array<{ keyName, rowID, value }>
    ): Promise<any>
}
```

---

## 七、完整流程图

```
用户打开文档
    ↓
[事件触发]
├─ switch-protyle (文档切换)
├─ loaded-protyle-dynamic (动态加载)
└─ loaded-protyle-static (静态加载)
    ↓
调用 loaded_run()
    ↓
获取当前文档ID
    ↓
调用 showdata_doc() 或 showdata_block()
    ↓
[DOM 查询]
├─ 找到 .protyle-title (文档) 或 [custom-avs] (块)
├─ 过滤特殊容器 (TalDraw等)
└─ 定位 .protyle-attr 属性容器
    ↓
清空旧显示 (.my-protyle-attr--av)
    ↓
调用 getAttributeViewKeys() 获取字段数据
    ↓
调用 extractContentsWithMeta() 提取元数据
    ↓
[创建 DOM 元素]
├─ 创建 .my-protyle-attr--av 容器 div
├─ 为每个字段创建 span
├─ 应用颜色和样式
├─ 存储元数据到 dataset
└─ 绑定点击编辑事件
    ↓
insertBefore() 插入到属性容器
    ↓
用户点击字段
    ↓
enableInlineEdit() 弹出编辑界面
    ↓
用户保存
    ↓
setBlockAttribute() 调用 API 保存数据
    ↓
刷新显示 + 唤醒自动刷新
```

---

## 八、关键代码特点

1. **防抖处理**：MutationObserver 使用 50ms 防抖
2. **智能缓存**：属性键缓存 1 分钟，减少 API 调用
3. **错误处理**：完整的 try-catch 和用户提示
4. **性能优化**：
   - 自动刷新休眠机制（连续10次无外部触发）
   - 清晰的元素选择器避免重复查询
   - 元数据存储在 dataset，减少 DOM 查询

5. **可配置性**：
   - 字段显示类型可配置
   - 隐藏字段列表
   - 日期格式、复选框样式可选
   - 字段着色规则

---

## 九、依赖关系

```
index.ts (主入口)
├─ api.ts (思源 API)
├─ db_pro.ts (数据库操作 - AVManager)
├─ extract-meta.ts (元数据提取)
├─ inline-edit.ts (编辑界面)
├─ handleKey.ts (字段类型处理)
├─ block.ts (块操作工具)
├─ settings.ts (设置)
└─ i18n.ts (国际化)
```

