# 思源笔记 - 数据库块属性编辑指南

## 项目概述
本指南详细介绍 **SiYuan Database Display Plugin** 如何编辑数据库（属性视图）的属性值，包括完整的 API 调用流程、数据结构转换和交互实现。

---

## 一、编辑流程概览

### 1.1 完整编辑链路

```
用户点击属性值
    ↓
获取编辑上下文 (blockID, avID, keyName, keyType, currentValue)
    ↓
blockID → itemID 映射 (getItemIDsByBoundIDs)
    ↓
根据字段类型选择编辑器
    ├─ checkbox: 直接切换
    ├─ select: 下拉菜单
    ├─ mSelect: 多选下拉菜单
    ├─ date: 日期时间选择器
    └─ 其他: 弹窗输入框
        ↓
用户编辑并提交
    ↓
值转换 (convertToAVValue)
    ↓
调用 API 保存 (setAttributeViewBlockAttr)
    ↓
刷新显示
```

### 1.2 关键组件

| 文件 | 功能 |
|------|------|
| `src/index.ts` | 编辑事件处理、UI集成 |
| `src/inline-edit.ts` | 编辑器实现（弹窗、下拉菜单等） |
| `src/db_pro.ts` | 数据库操作封装（AVManager类） |
| `src/db_interface.ts` | 类型定义和接口 |

---

## 二、核心 API 调用

### 2.1 设置属性值 API

#### 端点
```
POST /api/av/setAttributeViewBlockAttr
```

#### 请求参数
```typescript
{
    avID: string;      // 属性视图ID
    keyID: string;     // 字段ID
    itemID: string;    // 行ID (注意：不是blockID!)
    value: setAttributeViewValue;  // 值对象
}
```

#### 响应
```typescript
interface SetAttributeViewBlockAttrResponse {
    code: number;
    msg: string;
    data: any;
}
```

### 2.2 AVManager 封装方法

#### 方法签名
```typescript
async setBlockAttribute(
    avID: string,           // 属性视图ID
    keyName: string,        // 字段名称 (自动转换为keyID)
    itemID: string,         // 行ID
    value: setAttributeViewValue,  // 值对象
    blockID?: string        // 可选: 块ID (用于自动映射itemID)
): Promise<SetAttributeViewBlockAttrResponse>
```

#### 使用示例
```typescript
const avManager = new AVManager();

// 方式1: 直接使用 itemID
await avManager.setBlockAttribute(
    'av-id-123',
    '优先级',
    'item-id-456',
    { mSelect: [{ content: '高', color: '#ff0000' }] }
);

// 方式2: 使用 blockID 自动映射
await avManager.setBlockAttribute(
    'av-id-123',
    '优先级',
    undefined,  // itemID 留空
    { mSelect: [{ content: '高', color: '#ff0000' }] },
    'block-id-789'  // 提供 blockID，自动映射为 itemID
);
```

---

## 三、BlockID ↔ ItemID 映射

### 3.1 为什么需要映射？

在思源数据库中：
- **BlockID**: 块的唯一标识符（文档、段落等）
- **ItemID**: 数据库行的唯一标识符（可能绑定块，也可能是游离行）

编辑属性值时，API 需要 `itemID`，但用户界面上通常只有 `blockID`。

### 3.2 映射 API

#### BlockID → ItemID
```typescript
// API端点
POST /api/av/getAttributeViewItemIDsByBoundIDs

// AVManager方法
async getItemIDsByBoundIDs(
    avID: string, 
    blockIDs: string[]
): Promise<Record<string, string>>

// 使用示例
const mapping = await avManager.getItemIDsByBoundIDs(
    'av-id-123', 
    ['block-id-1', 'block-id-2']
);
// 返回: { 'block-id-1': 'item-id-a', 'block-id-2': 'item-id-b' }

const itemID = mapping['block-id-1'];
```

#### ItemID → BlockID (反向)
```typescript
// API端点
POST /api/av/getAttributeViewBoundBlockIDsByItemIDs

// AVManager方法
async getBoundBlockIDsByItemIDs(
    avID: string, 
    itemIDs: string[]
): Promise<Record<string, string>>

// 使用示例
const mapping = await avManager.getBoundBlockIDsByItemIDs(
    'av-id-123', 
    ['item-id-a', 'item-id-b']
);
// 返回: { 'item-id-a': 'block-id-1', 'item-id-b': '' }
// 注意: 空字符串表示游离行（未绑定块）
```

### 3.3 完整编辑流程示例

```typescript
// 1. 用户点击某个属性值，已知 blockID
const blockID = 'block-id-123';
const avID = 'av-id-456';
const keyName = '状态';

// 2. 将 blockID 映射为 itemID
const avManager = new AVManager();
const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID]);
const itemID = mapping[blockID];

if (!itemID) {
    showMessage('无法获取行ID', 3000, 'error');
    return;
}

// 3. 准备新值
const newValue = { 
    mSelect: [{ content: '已完成', color: '#00cc00' }] 
};

// 4. 保存
await avManager.setBlockAttribute(avID, keyName, itemID, newValue);
showMessage('保存成功', 2000, 'info');
```

---

## 四、值格式转换 (convertToAVValue)

### 4.1 所有字段类型的值格式

#### 文本 (text)
```typescript
// 输入: 字符串
"这是文本内容"

// 转换为:
{ 
    text: { 
        content: "这是文本内容" 
    } 
}
```

#### 数字 (number)
```typescript
// 输入: 数字或对象
100
// 或
{ content: 100, isNotEmpty: true }

// 转换为:
{ 
    number: { 
        content: 100,
        isNotEmpty: true  // 标记是否有值
    } 
}

// 注意: 空值处理
{ content: 0, isNotEmpty: false }  // 用户清空了数字
```

#### 日期 (date)
```typescript
// 输入: 时间戳(毫秒) 或对象
1703769600000

// 单个日期转换为:
{ 
    date: { 
        content: 1703769600000,
        isNotTime: false,      // 是否不包含时间部分
        hasEndDate: false      // 是否有结束日期
    } 
}

// 日期范围:
{
    content: 1703769600000,    // 开始时间
    hasEndDate: true,
    content2: 1704374400000,   // 结束时间
    isNotTime: false
}

// 转换为:
{ 
    date: { 
        content: 1703769600000,
        hasEndDate: true,
        content2: 1704374400000,
        isNotTime: false
    } 
}
```

#### 单选 (select)
```typescript
// 输入: 选项值
"高优先级"

// 转换为 (使用 mSelect 格式):
{ 
    mSelect: [
        { 
            content: "高优先级", 
            color: "" 
        }
    ] 
}
```

#### 多选 (mSelect)
```typescript
// 输入: 选项值数组
["高优先级", "紧急", "需跟进"]

// 转换为:
{ 
    mSelect: [
        { content: "高优先级", color: "" },
        { content: "紧急", color: "" },
        { content: "需跟进", color: "" }
    ] 
}

// 注意: color 可以为空字符串，系统会自动使用预设颜色
```

#### 复选框 (checkbox)
```typescript
// 输入: 布尔值
true

// 转换为:
{ 
    checkbox: { 
        checked: true 
    } 
}
```

#### URL (url)
```typescript
// 输入: URL字符串
"https://example.com"

// 转换为:
{ 
    url: { 
        content: "https://example.com" 
    } 
}
```

#### 邮箱 (email)
```typescript
// 输入: 邮箱字符串
"user@example.com"

// 转换为:
{ 
    email: { 
        content: "user@example.com" 
    } 
}
```

#### 电话 (phone)
```typescript
// 输入: 电话字符串
"13800000000"

// 转换为:
{ 
    phone: { 
        content: "13800000000" 
    } 
}
```

### 4.2 convertToAVValue 函数

```typescript
function convertToAVValue(keyType: string, value: any): setAttributeViewValue {
    switch (keyType) {
        case 'text':
            return { text: { content: String(value || '') } };
            
        case 'number':
            // 支持传入对象 { content, isNotEmpty } 或原始值
            if (value && typeof value === 'object') {
                const content = Number(value.content ?? 0);
                const isNotEmpty = Boolean(value.isNotEmpty);
                return { number: { content, isNotEmpty } };
            }
            const content = Number(value) || 0;
            const isNotEmpty = (value !== '' && value !== null && value !== undefined);
            return { number: { content, isNotEmpty } };
            
        case 'date':
            // 兼容数值与对象两种输入
            if (value && typeof value === 'object') {
                const content = Number(value.content ?? 0);
                const hasEndDate = Boolean(value.hasEndDate);
                const content2 = hasEndDate ? Number(value.content2 ?? 0) : undefined;
                return { 
                    date: { 
                        content, 
                        isNotTime: Boolean(value.isNotTime) || false, 
                        hasEndDate, 
                        content2 
                    } 
                };
            }
            return { date: { content: Number(value ?? 0), isNotTime: false } };
            
        case 'url':
            return { url: { content: String(value || '') } };
            
        case 'email':
            return { email: { content: String(value || '') } };
            
        case 'phone':
            return { phone: { content: String(value || '') } };
            
        case 'checkbox':
            return { checkbox: { checked: Boolean(value) } };
            
        case 'select':
            // 单选也使用 mSelect 格式（单个元素的数组）
            return { mSelect: value ? [{ content: String(value), color: '' }] : [] };
            
        case 'mSelect':
            // 多选返回数组
            const values = Array.isArray(value) ? value : [value];
            return { 
                mSelect: values.filter(v => v).map(v => ({ 
                    content: String(v), 
                    color: '' 
                })) 
            };
            
        default:
            return { text: { content: String(value || '') } };
    }
}
```

---

## 五、交互式编辑器实现

### 5.1 编辑器入口 (enableInlineEdit)

```typescript
export interface InlineEditOptions {
    element: HTMLElement;     // 触发编辑的元素
    avID: string;            // 属性视图ID
    blockID: string;         // 块ID
    itemID: string;          // 行ID
    keyID: string;           // 字段ID
    keyName: string;         // 字段名称
    keyType: string;         // 字段类型
    currentValue: any;       // 当前值
    selectOptions?: any[];   // 选项列表 (select/mSelect)
    onSave?: (newValue: any) => void;     // 保存回调
    onCancel?: () => void;   // 取消回调
}

export function enableInlineEdit(options: InlineEditOptions) {
    // 根据字段类型选择编辑方式
    switch (options.keyType) {
        case 'checkbox':
            handleCheckboxEdit(options);      // 直接切换
            break;
        case 'select':
            handleSelectEdit(options);        // 下拉菜单
            break;
        case 'mSelect':
            handleMultiSelectEdit(options);   // 多选下拉
            break;
        case 'date':
            handleDateEdit(options);          // 日期选择器
            break;
        default:
            handlePopupEdit(options);         // 弹窗输入
            break;
    }
}
```

### 5.2 复选框编辑 (直接切换)

```typescript
async function handleCheckboxEdit(options: InlineEditOptions) {
    const { avID, blockID, itemID, keyName, currentValue, onSave } = options;
    
    // 1. 直接切换状态
    const newValue = !Boolean(currentValue);
    
    try {
        // 2. 保存到数据库
        const avManager = new AVManager();
        const value = convertToAVValue('checkbox', newValue);
        
        await avManager.setBlockAttribute(avID, keyName, itemID, value, blockID);
        
        showMessage('保存成功', 2000, 'info');
        
        // 3. 触发回调
        if (onSave) {
            onSave(newValue);
        }
    } catch (error) {
        console.error('保存失败:', error);
        showMessage('保存失败', 5000, 'error');
    }
}
```

### 5.3 单选下拉菜单

```typescript
function handleSelectEdit(options: InlineEditOptions) {
    const { element, avID, blockID, itemID, keyName, currentValue, selectOptions, onSave } = options;
    
    // 1. 创建下拉菜单
    const dropdown = document.createElement('div');
    dropdown.className = 'inline-edit-dropdown';
    
    // 2. 添加空选项（清除值）
    const emptyOption = createDropdownOption('', '清除', currentValue === '');
    dropdown.appendChild(emptyOption);
    
    // 3. 添加备选项
    (selectOptions || []).forEach(option => {
        const optionId = option.name || option.id || option.content;
        const optionText = option.name || option.content || option.id;
        const isSelected = (optionId === currentValue);
        
        const optionElement = createDropdownOption(optionId, optionText, isSelected);
        dropdown.appendChild(optionElement);
    });
    
    document.body.appendChild(dropdown);
    
    // 4. 定位下拉菜单
    positionDropdown(dropdown, element);
    
    // 5. 点击选项保存
    dropdown.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const optionElement = target.closest('.inline-edit-dropdown-option');
        if (optionElement) {
            const value = optionElement.dataset.value || '';
            
            // 保存
            const avManager = new AVManager();
            const avValue = convertToAVValue('select', value);
            await avManager.setBlockAttribute(avID, keyName, itemID, avValue, blockID);
            
            dropdown.remove();
            showMessage('保存成功', 2000, 'info');
            
            if (onSave) onSave(value);
        }
    });
}
```

### 5.4 多选下拉菜单

```typescript
function handleMultiSelectEdit(options: InlineEditOptions) {
    const { element, avID, blockID, itemID, keyName, currentValue, selectOptions, onSave } = options;
    
    // 1. 当前选中的值集合
    const selectedValues = new Set(
        Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : [])
    );
    
    // 2. 创建多选容器
    const dropdown = document.createElement('div');
    dropdown.className = 'inline-edit-dropdown inline-edit-dropdown--multi';
    
    // 3. 添加备选项（带复选框）
    (selectOptions || []).forEach(option => {
        const optionId = option.name || option.id || option.content;
        const optionText = option.name || option.content || option.id;
        const isSelected = selectedValues.has(optionId);
        
        const optionElement = createMultiSelectOption(optionId, optionText, isSelected);
        dropdown.appendChild(optionElement);
        
        // 点击切换选中状态
        optionElement.addEventListener('click', (e) => {
            const checkbox = optionElement.querySelector('input[type="checkbox"]');
            checkbox.checked = !checkbox.checked;
            
            if (checkbox.checked) {
                selectedValues.add(optionId);
            } else {
                selectedValues.delete(optionId);
            }
        });
    });
    
    // 4. 添加保存/取消按钮
    const saveButton = document.createElement('button');
    saveButton.textContent = '保存';
    saveButton.addEventListener('click', async () => {
        const values = Array.from(selectedValues);
        
        const avManager = new AVManager();
        const avValue = convertToAVValue('mSelect', values);
        await avManager.setBlockAttribute(avID, keyName, itemID, avValue, blockID);
        
        dropdown.remove();
        showMessage('保存成功', 2000, 'info');
        
        if (onSave) onSave(values);
    });
    
    dropdown.appendChild(saveButton);
    document.body.appendChild(dropdown);
    positionDropdown(dropdown, element);
}
```

### 5.5 日期编辑器

```typescript
function handleDateEdit(options: InlineEditOptions) {
    const { element, avID, blockID, itemID, keyName, currentValue, onSave } = options;

    // 1. 解析当前值
    const current = (currentValue && typeof currentValue === 'object')
        ? currentValue
        : { content: currentValue ?? null, hasEndDate: false, content2: null, isNotTime: false };

    // 2. 创建日期选择器
    const datePicker = document.createElement('div');
    datePicker.className = 'inline-edit-datepicker';

    // 3. 开始时间输入
    const startInput = document.createElement('input');
    startInput.type = 'datetime-local';
    startInput.value = timestampToDateInput(current.content);
    datePicker.appendChild(startInput);

    // 4. 是否有结束时间
    const hasEndCheckbox = document.createElement('input');
    hasEndCheckbox.type = 'checkbox';
    hasEndCheckbox.checked = Boolean(current.hasEndDate);
    datePicker.appendChild(hasEndCheckbox);

    // 5. 结束时间输入
    const endInput = document.createElement('input');
    endInput.type = 'datetime-local';
    endInput.value = timestampToDateInput(current.content2);
    endInput.style.display = hasEndCheckbox.checked ? '' : 'none';
    datePicker.appendChild(endInput);

    // 6. 联动显示/隐藏结束时间
    hasEndCheckbox.addEventListener('change', () => {
        endInput.style.display = hasEndCheckbox.checked ? '' : 'none';
    });

    // 7. 保存按钮
    const saveButton = document.createElement('button');
    saveButton.textContent = '保存';
    saveButton.addEventListener('click', async () => {
        const startTs = startInput.value ? new Date(startInput.value).getTime() : null;
        const hasEnd = hasEndCheckbox.checked;
        const endTs = hasEnd && endInput.value ? new Date(endInput.value).getTime() : null;

        const avManager = new AVManager();
        const avValue = convertToAVValue('date', {
            content: startTs,
            hasEndDate: hasEnd,
            content2: endTs,
            isNotTime: false
        });

        await avManager.setBlockAttribute(avID, keyName, itemID, avValue, blockID);

        datePicker.remove();
        showMessage('保存成功', 2000, 'info');

        if (onSave) {
            onSave({ content: startTs, hasEndDate: hasEnd, content2: endTs });
        }
    });

    datePicker.appendChild(saveButton);
    document.body.appendChild(datePicker);
    positionDropdown(datePicker, element);
}

// 辅助函数: 时间戳转 datetime-local 格式
function timestampToDateInput(timestamp: number): string {
    if (!timestamp) return '';
    
    const ts = timestamp > 10000000000 ? timestamp : timestamp * 1000;
    const date = new Date(ts);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}
```

### 5.6 弹窗编辑器 (文本、数字、URL等)

```typescript
function handlePopupEdit(options: InlineEditOptions) {
    const { element, avID, blockID, itemID, keyName, keyType, currentValue, onSave } = options;
    
    // 1. 创建弹窗
    const popup = document.createElement('div');
    popup.className = 'inline-edit-popup';
    
    // 2. 创建输入框
    let inputElement: HTMLInputElement;
    
    switch (keyType) {
        case 'number':
            inputElement = document.createElement('input');
            inputElement.type = 'number';
            inputElement.value = String(currentValue ?? '');
            break;
        case 'url':
            inputElement = document.createElement('input');
            inputElement.type = 'url';
            inputElement.value = String(currentValue || '');
            break;
        case 'email':
            inputElement = document.createElement('input');
            inputElement.type = 'email';
            inputElement.value = String(currentValue || '');
            break;
        case 'phone':
            inputElement = document.createElement('input');
            inputElement.type = 'tel';
            inputElement.value = String(currentValue || '');
            break;
        default:  // text
            inputElement = document.createElement('input');
            inputElement.type = 'text';
            inputElement.value = String(currentValue || '');
            break;
    }
    
    popup.appendChild(inputElement);
    
    // 3. 保存按钮
    const saveButton = document.createElement('button');
    saveButton.textContent = '保存';
    saveButton.addEventListener('click', async () => {
        let newValue: any = inputElement.value;
        
        // 特殊处理数字
        if (keyType === 'number') {
            const isNotEmpty = inputElement.value.trim() !== '';
            newValue = { content: Number(newValue) || 0, isNotEmpty };
        }
        
        const avManager = new AVManager();
        const avValue = convertToAVValue(keyType, newValue);
        await avManager.setBlockAttribute(avID, keyName, itemID, avValue, blockID);
        
        popup.remove();
        showMessage('保存成功', 2000, 'info');
        
        if (onSave) onSave(newValue);
    });
    
    popup.appendChild(saveButton);
    
    // 4. 取消按钮
    const cancelButton = document.createElement('button');
    cancelButton.textContent = '取消';
    cancelButton.addEventListener('click', () => {
        popup.remove();
    });
    popup.appendChild(cancelButton);
    
    // 5. 键盘快捷键
    inputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveButton.click();
        } else if (e.key === 'Escape') {
            cancelButton.click();
        }
    });
    
    document.body.appendChild(popup);
    positionPopup(popup, element);
    
    // 6. 聚焦并选中
    setTimeout(() => {
        inputElement.focus();
        inputElement.select();
    }, 10);
}
```

---

## 六、事件集成

### 6.1 在显示的属性值上添加编辑事件

```typescript
// src/index.ts
addEditEventToSpan(newSpan: HTMLElement, contentMeta: any, refreshCallback: () => Promise<void>) {
    // 1. created 和 updated 字段不允许编辑
    if (['created', 'updated'].includes(contentMeta.type)) {
        return;
    }
    
    newSpan.style.cursor = 'pointer';
    
    // 2. 特殊处理 URL 类型: 左键跳转，右键编辑
    if (contentMeta.type === 'url') {
        newSpan.addEventListener('click', async (e) => {
            e.stopPropagation();
            const rawValue = JSON.parse(newSpan.dataset['rawValue']);
            if (rawValue && typeof rawValue === 'string') {
                window.open(rawValue, '_blank');
            }
        });
        
        // 右键编辑
        newSpan.addEventListener('contextmenu', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this.handleEditClick(e, refreshCallback);
        });
    } else {
        // 3. 其他类型: 左键编辑
        newSpan.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.handleEditClick(e, refreshCallback);
        });
    }
}
```

### 6.2 处理编辑点击事件

```typescript
async handleEditClick(e: MouseEvent, refreshCallback: () => Promise<void>) {
    const target = e.currentTarget as HTMLElement;
    
    // 1. 获取 blockID（从最近的带 data-node-id 的父元素）
    const blockElement = target.closest('[data-node-id]') as HTMLElement;
    if (!blockElement) {
        showMessage('缺少块ID', 3000, 'error');
        return;
    }
    const blockID = blockElement.getAttribute('data-node-id') || '';
    
    // 2. 从 dataset 读取编辑所需的所有参数
    const avID = target.dataset['avId'] || '';
    const keyID = target.dataset['keyId'] || '';
    const keyName = target.dataset['keyName'] || '';
    const keyType = target.dataset['keyType'] || '';
    const rawValue = target.dataset['rawValue'] ? JSON.parse(target.dataset['rawValue']) : null;
    const selectOptions = target.dataset['selectOptions'] ? JSON.parse(target.dataset['selectOptions']) : undefined;
    
    // 3. 将 blockID 映射为 itemID
    try {
        const { AVManager } = await import('./db_pro');
        const avManager = new AVManager();
        const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID]);
        const itemID = mapping[blockID];
        
        if (!itemID) {
            showMessage('无法获取行ID', 3000, 'error');
            return;
        }
        
        // 4. 启动编辑器
        enableInlineEdit({
            element: target,
            avID,
            blockID,
            itemID,
            keyID,
            keyName,
            keyType,
            currentValue: rawValue,
            selectOptions,
            onSave: async () => {
                // 5. 保存成功后刷新显示
                await refreshCallback();
            }
        });
    } catch (error) {
        console.error('编辑失败:', error);
        showMessage('编辑失败', 5000, 'error');
    }
}
```

### 6.3 在元素上存储元数据

```typescript
// 创建属性值元素时，保存必要的元数据
const newSpan = document.createElement('span');
newSpan.className = 'popover__block ariaLabel';
newSpan.textContent = contentMeta.text;

// 保存元数据到 dataset
newSpan.dataset['fieldType'] = contentMeta.type;       // 字段类型（用于样式）
newSpan.dataset['avId'] = contentMeta.avID;            // 属性视图ID
newSpan.dataset['keyId'] = contentMeta.keyID;          // 字段ID
newSpan.dataset['keyName'] = contentMeta.keyName;      // 字段名称
newSpan.dataset['keyType'] = contentMeta.keyType;      // 字段原始类型
newSpan.dataset['rawValue'] = JSON.stringify(contentMeta.rawValue);  // 原始值
if (contentMeta.selectOptions) {
    newSpan.dataset['selectOptions'] = JSON.stringify(contentMeta.selectOptions);  // 选项列表
}

// 添加编辑事件
this.addEditEventToSpan(newSpan, contentMeta, async () => {
    await this.showdata_doc();  // 刷新显示
});
```

---

## 七、批量操作

### 7.1 批量设置属性值

```typescript
// API端点
POST /api/av/batchSetAttributeViewBlockAttrs

// AVManager 方法
async batchSetAttributes(
    avID: string,
    values: Array<{
        keyID: string;
        itemID: string;
        value: setAttributeViewValue;
    }>
): Promise<void>

// 使用示例
await avManager.batchSetAttributes('av-id-123', [
    {
        keyID: 'key-1',
        itemID: 'item-a',
        value: { text: { content: '更新内容1' } }
    },
    {
        keyID: 'key-2',
        itemID: 'item-b',
        value: { number: { content: 100, isNotEmpty: true } }
    }
]);
```

---

## 八、完整示例代码

### 8.1 编辑文本字段

```typescript
import { AVManager } from './db_pro';
import { showMessage } from 'siyuan';

async function editTextField() {
    const avManager = new AVManager();
    
    // 1. 准备参数
    const avID = 'av-20240101000000-abc1234';
    const blockID = 'block-20240101000001-xyz5678';
    const keyName = '备注';
    
    // 2. 映射 blockID → itemID
    const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID]);
    const itemID = mapping[blockID];
    
    if (!itemID) {
        showMessage('找不到对应的数据行', 3000, 'error');
        return;
    }
    
    // 3. 准备新值
    const newText = '这是更新后的备注内容';
    const value = { text: { content: newText } };
    
    // 4. 保存
    try {
        await avManager.setBlockAttribute(avID, keyName, itemID, value);
        showMessage('保存成功', 2000, 'info');
    } catch (error) {
        console.error('保存失败:', error);
        showMessage('保存失败: ' + error.message, 5000, 'error');
    }
}
```

### 8.2 编辑多选字段

```typescript
async function editMultiSelectField() {
    const avManager = new AVManager();
    
    const avID = 'av-id-123';
    const blockID = 'block-id-456';
    const keyName = '标签';
    
    // 映射 itemID
    const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID]);
    const itemID = mapping[blockID];
    
    // 更新多选值
    const newTags = ['重要', '紧急', '待办'];
    const value = {
        mSelect: newTags.map(tag => ({
            content: tag,
            color: ''  // 留空，使用默认颜色
        }))
    };
    
    await avManager.setBlockAttribute(avID, keyName, itemID, value);
    showMessage('标签已更新', 2000, 'info');
}
```

### 8.3 编辑日期范围

```typescript
async function editDateRangeField() {
    const avManager = new AVManager();
    
    const avID = 'av-id-123';
    const blockID = 'block-id-456';
    const keyName = '项目周期';
    
    // 映射 itemID
    const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID]);
    const itemID = mapping[blockID];
    
    // 设置日期范围
    const startDate = new Date('2024-01-01').getTime();
    const endDate = new Date('2024-12-31').getTime();
    
    const value = {
        date: {
            content: startDate,
            hasEndDate: true,
            content2: endDate,
            isNotTime: true  // 只保存日期，不包含时间
        }
    };
    
    await avManager.setBlockAttribute(avID, keyName, itemID, value);
    showMessage('日期已更新', 2000, 'info');
}
```

### 8.4 清空字段值

```typescript
async function clearFieldValue() {
    const avManager = new AVManager();
    
    const avID = 'av-id-123';
    const blockID = 'block-id-456';
    const keyName = '优先级';
    
    const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID]);
    const itemID = mapping[blockID];
    
    // 清空多选字段（传空数组）
    const value = { mSelect: [] };
    
    await avManager.setBlockAttribute(avID, keyName, itemID, value);
    showMessage('已清空', 2000, 'info');
}
```

---

## 九、错误处理

### 9.1 常见错误及处理

#### 错误1: 找不到 itemID
```typescript
const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID]);
const itemID = mapping[blockID];

if (!itemID) {
    showMessage('该块未绑定到数据库，无法编辑', 3000, 'error');
    return;
}
```

#### 错误2: 字段名不存在
```typescript
try {
    await avManager.setBlockAttribute(avID, '不存在的字段', itemID, value);
} catch (error) {
    // AVManager 的 findKeyByName 会抛出错误
    if (error.message.includes('未找到名称为')) {
        showMessage('字段不存在', 3000, 'error');
    }
}
```

#### 错误3: 值格式错误
```typescript
// 数字字段传入字符串
const value = { number: { content: 'abc', isNotEmpty: true } };  // ❌ 错误

// 正确做法：转换为数字
const value = { number: { content: Number('abc') || 0, isNotEmpty: true } };  // ✅
```

### 9.2 统一错误处理

```typescript
async function safeEditAttribute(
    avID: string, 
    blockID: string, 
    keyName: string, 
    value: any
) {
    try {
        const avManager = new AVManager();
        
        // 1. 验证参数
        if (!avID || !blockID || !keyName) {
            throw new Error('缺少必需参数');
        }
        
        // 2. 映射 itemID
        const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID]);
        const itemID = mapping[blockID];
        
        if (!itemID) {
            throw new Error('找不到数据行');
        }
        
        // 3. 保存
        await avManager.setBlockAttribute(avID, keyName, itemID, value);
        
        showMessage('保存成功', 2000, 'info');
        return true;
        
    } catch (error) {
        console.error('编辑失败:', error);
        
        // 友好的错误提示
        let message = '保存失败';
        if (error.message.includes('未找到名称为')) {
            message = '字段不存在';
        } else if (error.message.includes('找不到数据行')) {
            message = '该块未绑定到数据库';
        } else if (error.message) {
            message += ': ' + error.message;
        }
        
        showMessage(message, 5000, 'error');
        return false;
    }
}
```

---

## 十、高级技巧

### 10.1 缓存优化

AVManager 内置了字段缓存机制（1分钟），减少重复API调用：

```typescript
// 第一次调用：从API获取
const keys1 = await avManager.getAttributeViewKeysByAvID(avID);

// 1分钟内再次调用：从缓存读取
const keys2 = await avManager.getAttributeViewKeysByAvID(avID);

// 强制刷新缓存
avManager.clearKeyCache(avID);
const keys3 = await avManager.getAttributeViewKeysByAvID(avID);
```

### 10.2 监听属性更新

```typescript
// 监听 WebSocket 事件
window.siyuan.ws.ws.addEventListener('message', async (e) => {
    const msg = JSON.parse(e.data);
    
    if (msg.cmd === 'transactions') {
        const operations = msg.data[0]?.doOperations || [];
        
        operations.forEach(op => {
            if (op.action === 'updateAttrViewCell') {
                console.log('属性值已更新:', op);
                // 刷新显示
                refreshDisplay();
            }
        });
    }
});
```

### 10.3 选项颜色管理

虽然 `convertToAVValue` 中将 color 设置为空字符串，但你也可以自定义颜色：

```typescript
const value = {
    mSelect: [
        { content: '高优先级', color: '#ff0000' },    // 红色
        { content: '中优先级', color: '#ff9900' },    // 橙色
        { content: '低优先级', color: '#00cc00' }     // 绿色
    ]
};
```

### 10.4 游离行处理

数据库中可以有游离行（未绑定块的行）：

```typescript
// 检查是否为游离行
const mapping = await avManager.getBoundBlockIDsByItemIDs(avID, [itemID]);
const blockID = mapping[itemID];

if (!blockID || blockID === '') {
    console.log('这是一个游离行');
}

// 游离行同样可以编辑
await avManager.setAttributeViewBlockAttrByItemID(avID, itemID, keyID, value);
```

---

## 十一、API 端点完整汇总

| 功能 | 端点 | 请求参数 | 响应 |
|------|------|---------|------|
| 设置属性值 | `/api/av/setAttributeViewBlockAttr` | `{ avID, keyID, itemID, value }` | 操作结果 |
| 批量设置属性值 | `/api/av/batchSetAttributeViewBlockAttrs` | `{ avID, values: [{keyID, itemID, value}] }` | 操作结果 |
| BlockID转ItemID | `/api/av/getAttributeViewItemIDsByBoundIDs` | `{ avID, blockIDs }` | ID映射对象 |
| ItemID转BlockID | `/api/av/getAttributeViewBoundBlockIDsByItemIDs` | `{ avID, itemIDs }` | ID映射对象 |
| 获取字段列表 | `/api/av/getAttributeViewKeysByAvID` | `{ avID }` | 字段数组 |
| 获取属性视图键 | `/api/av/getAttributeViewKeys` | `{ id: blockID }` | 属性视图列表 |

---

## 参考资源

- **获取数据指南**: DATABASE_ATTRIBUTE_EXTRACTION_GUIDE.md
- **思源API文档**: https://github.com/siyuan-note/siyuan/blob/master/API.md
- **思源API中文文档**: https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md
- **项目源代码**: 
  - src/inline-edit.ts (编辑器实现)
  - src/db_pro.ts (AVManager类)
  - src/index.ts (事件集成)
  - src/db_interface.ts (类型定义)
