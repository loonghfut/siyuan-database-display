import {
    Plugin,
    showMessage,
    // confirm,
    // Dialog,
    // Menu,
    // openTab,
    // adaptHotkey,
    // getFrontend,
    // getBackend,
    // IModel,

} from "siyuan";
import "@/index.scss";
import { getAttributeViewKeys } from "./api";
import { SettingUtils } from "./libs/setting-utils";
import { addSettings } from './settings';
import { getCursorBlockId, getAVreferenceid, reConfirmedDocId } from "./block";
import { extractContentsWithMeta } from './extract-meta';
import { enableInlineEdit } from './inline-edit';

let disShow_doc = null;
let disShow_block = null;
let hiddenFields = null;
let dateFormat = null;
let includeTime = null;
let checkboxStyle = null;
let showTimestamps = null;
let maxDisplayLength = null;
let fieldColorMap: Record<string, string> = {};
let fieldBgColorMap: Record<string, string> = {};
let fieldValueColorMap: Record<string, string | { color?: string; bg?: string }> = {};

function parseFieldColorMap(raw?: string, isBg: boolean = false) {
    if (!raw) return;
    try {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
            if (isBg) fieldBgColorMap = obj; else fieldColorMap = obj;
        }
    } catch (e) {
        console.warn(isBg ? '解析字段背景颜色 JSON 失败' : '解析字段颜色 JSON 失败', e);
    }
}

function parseFieldValueColorMap(raw?: string) {
    if (!raw) return;
    try {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
            fieldValueColorMap = obj as any;
        }
    } catch (e) {
        console.warn('解析字段值颜色 JSON 失败', e);
    }
}

function getColorForType(type: string): string | undefined {
    const c = fieldColorMap?.[type];
    if (!c) return undefined;
    // 简单校验 hex / rgb / var(--x)
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c) || c.startsWith('rgb') || c.startsWith('var(')) {
        return c;
    }
    return undefined;
}

function getBgColorForType(type: string): string | undefined {
    const c = fieldBgColorMap?.[type];
    if (!c) return undefined;
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c) || c.startsWith('rgb') || c.startsWith('var(')) {
        return c;
    }
    return undefined;
}

function applyColors(ele: HTMLElement, type: string, valueText: string) {
    // 1. 值级别覆盖
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
            return; // 值命中直接返回
        }
    }
    // 2. 类型级别
    const color = getColorForType(type);
    const bg = getBgColorForType(type);
    if (color) ele.style.color = color;
    if (bg) {
        ele.style.backgroundColor = bg;
        ele.style.padding = '2px 4px';
        ele.style.borderRadius = '4px';
    }
}
let isoutLog = false;
let currentDocId = null;
let currentDocId_block = null;
let clickId = null;
export let isShow = null;

// 自动刷新相关（仅此文件内使用，保持简单维护）
// interval: 用户配置的秒；runCount: 连续自动执行次数；sleeping: 是否休眠
// 当自动执行达到阈值（10 次）且期间没有外部 loaded 触发，则进入休眠；外部触发后恢复

export function getHiddenFields(): string[] {
    if (!hiddenFields) return [];
    return hiddenFields.split(',').map(field => field.trim()).filter(field => field.length > 0);
}

export function updateHiddenFields(newHiddenFields: string) {
    hiddenFields = newHiddenFields;
}

export function getDateFormatOptions() {
    return {
        format: dateFormat || 'YYYY-MM-DD',
        includeTime: includeTime || false
    };
}

export function getCheckboxOptions() {
    return {
        style: checkboxStyle || 'emoji'
    };
}

export function getMaxDisplayLength(): number {
    return maxDisplayLength || 30;
}

export function getFilteredConditions(baseConditions: string[]): string[] {
    let conditions = [...baseConditions];

    // 如果用户关闭了时间戳显示，则过滤掉 created 和 updated 字段
    if (showTimestamps === false) {
        conditions = conditions.filter(condition => condition !== 'created' && condition !== 'updated');
    }

    return conditions;
}

export default class DatabaseDisplay extends Plugin {
    private settingUtils: SettingUtils;
    private autoTimer: any = null;
    private autoIntervalSec: number = 0; // 用户设定
    private autoRunCount: number = 0; // 已连续自动执行次数
    private readonly autoRunMax: number = 10; // 达到后若无外部触发则休眠
    private sleeping: boolean = false;
    private externalTriggerFlag: boolean = false; // 标记外部触发

    async onload() {
        //记得取消注释
        this.eventBus.on("switch-protyle", async (event) => {
            const currentDocId2 = event.detail.protyle.block.id;
            currentDocId = await reConfirmedDocId(currentDocId2);
            // console.log(currentDocId, "currentDocId");

            await this.showdata_doc();
            currentDocId_block = await getAVreferenceid(currentDocId);
            //遍历currentDocId_block执行showdata_block
            for (let i = 0; i < currentDocId_block.length; i++) {
                clickId = currentDocId_block[i];
                await this.showdata_block();
            }
        });
        this.eventBus.on("loaded-protyle-dynamic", this.loaded.bind(this));
        this.eventBus.on("loaded-protyle-static", this.loaded.bind(this));

        this.settingUtils = new SettingUtils({
            plugin: this, name: "DatabaseDisplay"
        });
        addSettings(this.settingUtils);

        try {
            this.settingUtils.load();
        } catch (error) {
            console.error("Error loading settings storage, probably empty config json:", error);
        }
    }

    async loaded() {
        console.log("loaded");
        setTimeout(async () => {//缓解乱显示bug
            await this.loaded_run();
        }, 10);
        // 外部触发唤醒自动刷新
        if (this.sleeping) {
            this.externalTriggerFlag = true; // 标记已外部触发
            this.wakeAuto();
        } else {
            // 这是外部触发（事件总线/WS 事务），重置标记
            this.externalTriggerFlag = true;
        }
    }

    async loaded_run() {
        console.log("loaded_run");
        if (currentDocId) {
            await this.showdata_doc();
            currentDocId_block = await getAVreferenceid(currentDocId);
            //遍历currentDocId_block执行showdata_block
            for (let i = 0; i < currentDocId_block.length; i++) {
                clickId = currentDocId_block[i];
                await this.showdata_block();
            }
        }
    }
    async handleSelectionChange() {
        // //console.log("handleSelectionChange");
        const blockId = getCursorBlockId();
        if (blockId) {
            clickId = blockId;

            showMessage(`光标所在的块ID: ${clickId}`);
            await this.showdata_block();
        } else {
            //console.log("无法获取光标所在的块ID");
        }
    }

    onLayoutReady() {
        this.settingUtils.load();
        // console.log(this.settingUtils.get("dis-show"), '1');
        disShow_doc = this.settingUtils.get("dis-show");
        disShow_block = this.settingUtils.get("dis-show-block");
        hiddenFields = this.settingUtils.get("hidden-fields");
        dateFormat = this.settingUtils.get("date-format");
        includeTime = this.settingUtils.get("include-time");
        checkboxStyle = this.settingUtils.get("checkbox-style");
        showTimestamps = this.settingUtils.get("show-timestamps");
        maxDisplayLength = this.settingUtils.get("max-display-length");
    parseFieldColorMap(this.settingUtils.get("field-color-map"));
    parseFieldColorMap(this.settingUtils.get("field-bg-color-map"), true);
    parseFieldValueColorMap(this.settingUtils.get("field-value-color-map"));
        window.siyuan.ws.ws.addEventListener('message', async (e) => {
            const msg = JSON.parse(e.data);
            if (msg.cmd === "transactions") {
                // console.log(msg);
                if (msg.data[0].doOperations[0].action === "updateAttrViewCell") {
                    this.loaded();
                }
            }
        });
        // 初始化自动刷新
        this.initAutoInterval();
        // 监听dom变化
        // const targetNode = document.body;
        // const config = { childList: true, subtree: true };
        // const observer = new MutationObserver(callback); // 监听点击数据库按键的弹窗变化
        // observer.observe(targetNode, config);

        // this.loadData(STORAGE_NAME);
    }

    async onunload() {
        this.eventBus.off("switch-protyle", this.showdata_doc);
        this.eventBus.off("click-editorcontent", this.handleSelectionChange.bind(this));
        this.eventBus.off("loaded-protyle-static", this.loaded.bind(this));
        this.eventBus.off("loaded-protyle-dynamic", this.loaded.bind(this));
        this.clearAutoTimer();
    }

    uninstall() {
        this.eventBus.off("switch-protyle", this.showdata_doc);
        this.eventBus.off("click-editorcontent", this.handleSelectionChange.bind(this));
        this.eventBus.off("loaded-protyle-static", this.loaded.bind(this));
        this.eventBus.off("loaded-protyle-dynamic", this.loaded.bind(this));
        //console.log("uninstall");
        this.clearAutoTimer();
    }

    /**
     * 为元素添加编辑事件
     * @param newSpan 要添加事件的元素
     * @param contentMeta 元数据
     * @param refreshCallback 保存后的刷新回调
     */
    addEditEventToSpan(newSpan: HTMLElement, contentMeta: any, refreshCallback: () => Promise<void>) {
        // created 和 updated 字段不允许编辑
        if (['created', 'updated'].includes(contentMeta.type)) {
            return;
        }
        
        newSpan.style.cursor = 'pointer';
        
        // 对于 url 类型，左键点击跳转，右键编辑
        if (contentMeta.type === 'url') {
            newSpan.addEventListener('click', async (e) => {
                e.stopPropagation();
                const target = e.currentTarget as HTMLElement;
                const rawValue = target.dataset['rawValue'] ? JSON.parse(target.dataset['rawValue']) : null;
                
                if (rawValue && typeof rawValue === 'string') {
                    // 确保 URL 有协议前缀
                    let url = rawValue;
                    // if (!url.match(/^https?:\/\//i)) {
                    //     url = 'http://' + url;
                    // }
                    window.open(url, '_blank');
                }
            });
            
            // 右键点击编辑
            newSpan.addEventListener('contextmenu', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                await this.handleEditClick(e, refreshCallback);
            });
        } else {
            // 其他类型字段，左键点击编辑
            newSpan.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                await this.handleEditClick(e, refreshCallback);
            });
        }
    }

    /**
     * 处理编辑点击事件
     */
    async handleEditClick(e: MouseEvent | Event, refreshCallback: () => Promise<void>) {
        const target = e.currentTarget as HTMLElement;
        
        // 从最近的带有 data-node-id 的父元素获取 blockID
        const blockElement = target.closest('[data-node-id]') as HTMLElement;
        if (!blockElement) {
            showMessage('无法获取块ID', 3000, 'error');
            return;
        }
        const blockID = blockElement.getAttribute('data-node-id') || '';
        
        // 从 dataset 中读取其他参数
        const avID = target.dataset['avId'] || '';
        const keyName = target.dataset['keyName'] || '';
        const keyType = target.dataset['keyType'] || '';
        const rawValue = target.dataset['rawValue'] ? JSON.parse(target.dataset['rawValue']) : null;
        const selectOptions = target.dataset['selectOptions'] ? JSON.parse(target.dataset['selectOptions']) : undefined;
        
        // 使用 AVManager 将 blockID 转换为 itemID
        try {
            const { AVManager } = await import('./db_pro');
            const avManager = new AVManager();
            const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID]);
            const itemID = mapping[blockID];
            
            if (!itemID) {
                showMessage('无法获取行ID', 3000, 'error');
                return;
            }
            
            // 弹窗编辑模式
            enableInlineEdit({
                element: target,
                avID,
                blockID,
                itemID,
                keyID: target.dataset['keyId'] || '',
                keyName,
                keyType,
                currentValue: rawValue,
                selectOptions,
                onSave: async () => {
                    // 保存成功后刷新显示
                    await refreshCallback();
                }
            });
        } catch (error) {
            console.error('获取itemID失败:', error);
            showMessage('获取行ID失败: ' + error.message, 5000, 'error');
        }
    }

    async showdata_doc() { //TODO:以后合成一个函数
        //console.log("showdata2");
        const viewKeys = await getAttributeViewKeys(currentDocId);
        const hiddenFieldsList = getHiddenFields();
        const dateOptions = getDateFormatOptions();
        const checkboxOptions = getCheckboxOptions();
        
        let conditions: string[] = [];
        if (disShow_doc) {
            conditions = disShow_doc.split(',');
        } else {
            conditions = ['mSelect', 'number', 'date', 'text', 'mAsset', 'checkbox', 'phone', 'url', 'email', 'created', 'updated'];
        }
        const filteredConditions = getFilteredConditions(conditions);
        
        // 使用新方法提取内容及元数据
        const contentsWithMeta = extractContentsWithMeta(
            viewKeys, 
            filteredConditions, 
            hiddenFieldsList, 
            dateOptions, 
            checkboxOptions
        );

        const parentElements = document.querySelectorAll('.protyle-title');
        let parentElementsArray = [];
        // 遍历父元素，找到不包含 'fn__none' 类且 id 匹配的元素
        parentElements.forEach(element => {
            if (!element.classList.contains('fn__none') && element.getAttribute('data-node-id') === currentDocId) {
                parentElementsArray.push(element);
            }
        });
        if (parentElementsArray.length === 0) {
            console.log("无法找到不包含 'fn__none' 类且 id 匹配的父元素");
            return;
        }
        //console.log("找到不包含 'fn__none' 类且 id 匹配的父元素 .protyle-title");
        parentElementsArray.forEach(parentElement => {
            const attrContainer = Array.from(parentElement.children).find((child: Element) => child.classList.contains('protyle-attr')) as Element;
            if (!attrContainer) {
                console.log("无法找到 .protyle-attr 元素");
                return;
            }

            // 清空现有的 .my-protyle-attr--av 元素
            const existingElements = Array.from(attrContainer.querySelectorAll('.my-protyle-attr--av'));
            existingElements.forEach((div: HTMLElement) => {
                div.remove();
            });

            // 创建新的 div 元素
            const newDiv = document.createElement('div');
            newDiv.className = 'my-protyle-attr--av';

            // 将所有 content 作为 span 元素添加到 newDiv 中
            contentsWithMeta.forEach(contentMeta => {
                const newSpan = document.createElement('span');
                newSpan.className = 'popover__block ariaLabel';
                applyColors(newSpan, contentMeta.type, contentMeta.text);
                
                const maxLength = getMaxDisplayLength();
                const contentStr = contentMeta.text;
                if (contentStr.length > maxLength) {
                    newSpan.textContent = contentStr.substring(0, maxLength) + '...';
                    newSpan.setAttribute('aria-label', contentStr);
                } else {
                    newSpan.textContent = contentStr;
                }
                
                // 只保存必要的元数据到 dataset
                newSpan.dataset['fieldType'] = contentMeta.type;
                newSpan.dataset['avId'] = contentMeta.avID;
                newSpan.dataset['keyId'] = contentMeta.keyID;
                newSpan.dataset['keyName'] = contentMeta.keyName;
                newSpan.dataset['keyType'] = contentMeta.keyType;
                newSpan.dataset['rawValue'] = JSON.stringify(contentMeta.rawValue);
                if (contentMeta.selectOptions) {
                    newSpan.dataset['selectOptions'] = JSON.stringify(contentMeta.selectOptions);
                }
                
                // 添加编辑事件
                this.addEditEventToSpan(newSpan, contentMeta, async () => {
                    await this.showdata_doc();
                });
                
                newDiv.appendChild(newSpan);
            })

            // 将 newDiv 插入到 attrContainer 中
            attrContainer.insertBefore(newDiv, attrContainer.firstChild);

            // console.log(".protyle-attr 元素已添加到父元素");
        });
    }

    async showdata_block() {
        const currentDocId = clickId; // 替换为实际的 currentDocId
        const viewKeys = await getAttributeViewKeys(currentDocId);
        const hiddenFieldsList = getHiddenFields();
        const dateOptions = getDateFormatOptions();
        const checkboxOptions = getCheckboxOptions();
        
        let conditions: string[] = [];
        if (disShow_block) {
            conditions = disShow_block.split(',');
        } else {
            conditions = ['mSelect', 'number', 'date', 'text', 'mAsset', 'checkbox', 'phone', 'url', 'email', 'created', 'updated'];
        }
        const filteredConditions = getFilteredConditions(conditions);
        
        // 使用新方法提取内容及元数据
        const contentsWithMeta = extractContentsWithMeta(
            viewKeys, 
            filteredConditions, 
            hiddenFieldsList, 
            dateOptions, 
            checkboxOptions
        );

        const parentElements = document.querySelectorAll('[custom-avs]');
        let parentElementsArray = [];
        outLog(parentElements);
        parentElements.forEach(element => {
            if (element.getAttribute('data-node-id') === currentDocId) {
                outLog(currentDocId, "cunr");
                parentElementsArray.push(element);
            }
        });

        if (parentElementsArray.length === 0) {
            console.log("无法找到 id 匹配的父元素");
            return;
        }

        parentElementsArray.forEach(parentElement => {
            const attrContainer = Array.from(parentElement.children).find((child: Element) => child.classList.contains('protyle-attr')) as Element;
            if (!attrContainer) {
                console.log("无法找到 .protyle-attr 元素");
                return;
            }

            // 清空现有的 .my-protyle-attr--av 元素
            const existingElements = Array.from(attrContainer.querySelectorAll('.my-protyle-attr--av'));
            existingElements.forEach((div: HTMLElement) => {
                div.remove();
            });

            // 创建新的 div 元素
            const newDiv = document.createElement('div');
            newDiv.className = 'my-protyle-attr--av';

            // 将所有 content 作为 span 元素添加到 newDiv 中
            contentsWithMeta.forEach(contentMeta => {
                const newSpan = document.createElement('span');
                newSpan.className = 'popover__block ariaLabel';
                applyColors(newSpan, contentMeta.type, contentMeta.text);
                
                const maxLength = getMaxDisplayLength();
                const contentStr = contentMeta.text;
                if (contentStr.length > maxLength) {
                    newSpan.textContent = contentStr.substring(0, maxLength) + '...';
                    newSpan.setAttribute('aria-label', contentStr);
                } else {
                    newSpan.textContent = contentStr;
                }
                
                // 只保存必要的元数据到 dataset
                newSpan.dataset['fieldType'] = contentMeta.type;
                newSpan.dataset['avId'] = contentMeta.avID;
                newSpan.dataset['keyId'] = contentMeta.keyID;
                newSpan.dataset['keyName'] = contentMeta.keyName;
                newSpan.dataset['keyType'] = contentMeta.keyType;
                newSpan.dataset['rawValue'] = JSON.stringify(contentMeta.rawValue);
                if (contentMeta.selectOptions) {
                    newSpan.dataset['selectOptions'] = JSON.stringify(contentMeta.selectOptions);
                }
                
                // 添加编辑事件
                this.addEditEventToSpan(newSpan, contentMeta, async () => {
                    await this.showdata_block();
                });
                
                newDiv.appendChild(newSpan);
            });

            // 将 newDiv 插入到 attrContainer 中
            attrContainer.insertBefore(newDiv, attrContainer.firstChild);

            // console.log(".protyle-attr 元素已添加到父元素");
        });
    }

    // 调用函数

    /* ================= 自动刷新相关 ================= */
    private initAutoInterval() {
        // 从设置读取（不存在则 0 关闭）
        this.autoIntervalSec = this.settingUtils.get("auto-loaded-interval") || 0;
        if (typeof this.autoIntervalSec !== 'number' || isNaN(this.autoIntervalSec) || this.autoIntervalSec < 0) {
            this.autoIntervalSec = 0;
        }
        if (this.autoIntervalSec > 0 && this.autoIntervalSec < 5) {
            this.autoIntervalSec = 5; // 最小 5 秒
        }
        this.startAuto();
    }

    private startAuto() {
        this.clearAutoTimer();
        if (this.autoIntervalSec <= 0) return;
        this.sleeping = false;
        this.autoRunCount = 0;
        this.externalTriggerFlag = false; // 新一轮统计
        this.autoTimer = setInterval(() => this.autoTick(), this.autoIntervalSec * 1000);
    }

    private autoTick() {
        if (this.sleeping) return; // 已休眠不再执行
        this.autoRunCount++;
        // 在计数前清除外部触发标记（本次 tick 视为内部触发）
        this.externalTriggerFlag = false;
        this.loaded_run();
        if (this.autoRunCount >= this.autoRunMax && !this.externalTriggerFlag) {
            // 连续 autoRunMax 次均为内部触发（externalTriggerFlag 未被外部 loaded 期间置 true）-> 进入休眠
            this.enterSleep();
        }
    }

    private enterSleep() {
        this.sleeping = true;
        this.clearAutoTimer();
        console.log('[DatabaseDisplay] 自动刷新已休眠');
    }

    private wakeAuto() {
        if (!this.sleeping) return;
        console.log('[DatabaseDisplay] 唤醒自动刷新');
        this.startAuto();
    }

    private clearAutoTimer() {
        if (this.autoTimer) {
            clearInterval(this.autoTimer);
            this.autoTimer = null;
        }
    }

    // 供设置修改后调用的更新接口（未来若在 settings 中添加按钮，即可调用）
    public updateAutoLoadedInterval() {
        this.initAutoInterval();
    }
}

// const callback = (mutationsList: MutationRecord[]) => {
//     for (const mutation of mutationsList) {
//         if (mutation.type === 'childList') {
//             mutation.removedNodes.forEach((node) => {
//                 if (node instanceof HTMLElement && node.matches('div[data-key="dialog-attr"].b3-dialog--open')) {
//                     console.log('Dialog closed');
//                     // 在这里添加你的代码
//                     DatabaseDisplay.prototype.loaded();
//                 }
//             });
//         }
//     }
// };

// 
export function outLog(any, str = "") {
    if (isoutLog) {
        console.log(any, str);
    }
}