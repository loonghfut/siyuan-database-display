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
import { extractContents } from './handleKey';
import { SettingUtils } from "./libs/setting-utils";
import { addSettings } from './settings';
import { getCursorBlockId, getAVreferenceid, reConfirmedDocId } from "./block";

let disShow_doc = null;
let disShow_block = null;
let hiddenFields = null;
let dateFormat = null;
let includeTime = null;
let checkboxStyle = null;
let showTimestamps = null;
let maxDisplayLength = null;
let isoutLog = false;
let currentDocId = null;
let currentDocId_block = null;
let clickId = null;
export let isShow = null;
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
        window.siyuan.ws.ws.addEventListener('message', async (e) => {
            const msg = JSON.parse(e.data);
            if (msg.cmd === "transactions") {
                // console.log(msg);
                if (msg.data[0].doOperations[0].action === "updateAttrViewCell") {
                    this.loaded();
                }
            }
        });
        // 监听dom变化
        const targetNode = document.body;
        const config = { childList: true, subtree: true };
        const observer = new MutationObserver(callback); // 监听点击数据库按键的弹窗变化
        observer.observe(targetNode, config);

        // this.loadData(STORAGE_NAME);
    }

    async onunload() {
        this.eventBus.off("switch-protyle", this.showdata_doc);
        this.eventBus.off("click-editorcontent", this.handleSelectionChange.bind(this));
        this.eventBus.off("loaded-protyle-static", this.loaded.bind(this));
        this.eventBus.off("loaded-protyle-dynamic", this.loaded.bind(this));
    }

    uninstall() {
        this.eventBus.off("switch-protyle", this.showdata_doc);
        this.eventBus.off("click-editorcontent", this.handleSelectionChange.bind(this));
        this.eventBus.off("loaded-protyle-static", this.loaded.bind(this));
        this.eventBus.off("loaded-protyle-dynamic", this.loaded.bind(this));
        //console.log("uninstall");
    }

    async showdata_doc() { //TODO:以后合成一个函数
        //console.log("showdata2");
        const viewKeys = await getAttributeViewKeys(currentDocId);
        let contents1 = [];
        const hiddenFieldsList = getHiddenFields();
        const dateOptions = getDateFormatOptions();
        const checkboxOptions = getCheckboxOptions();
        if (disShow_doc) {
            const baseConditions = disShow_doc.split(',');
            const filteredConditions = getFilteredConditions(baseConditions);
            contents1 = extractContents(viewKeys, filteredConditions, hiddenFieldsList, dateOptions, checkboxOptions);
        } else {
            const defaultConditions = ['mSelect', 'number', 'date', 'text', 'mAsset', 'checkbox', 'phone', 'url', 'email', 'created', 'updated'];
            const filteredConditions = getFilteredConditions(defaultConditions);
            contents1 = extractContents(viewKeys, filteredConditions, hiddenFieldsList, dateOptions, checkboxOptions);
        }
        // console.log(contents1);
        const contents = contents1.filter(element => element !== '' && element !== null && element !== undefined);

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
            contents.forEach(content => {
                const newSpan = document.createElement('span');
                newSpan.className = 'popover__block ariaLabel';
                
                // 设置长度限制
                const maxLength = getMaxDisplayLength();
                const contentStr = String(content);
                if (contentStr.length > maxLength) {
                    newSpan.textContent = contentStr.substring(0, maxLength) + '...';
                    newSpan.setAttribute('aria-label', contentStr); // 使用aria-label显示完整内容
                    // newSpan.title = contentStr; // 保留title作为备用
                    // newSpan.style.cursor = 'help';
                } else {
                    newSpan.textContent = contentStr;
                }
                
                newDiv.appendChild(newSpan);
            });
        
            // 将 newDiv 插入到 attrContainer 中
            attrContainer.insertBefore(newDiv, attrContainer.firstChild);
        
            // console.log(".protyle-attr 元素已添加到父元素");
        });
    }

    async showdata_block() {
        const currentDocId = clickId; // 替换为实际的 currentDocId
        const viewKeys = await getAttributeViewKeys(currentDocId);
        let contents1 = [];
        const hiddenFieldsList = getHiddenFields();
        const dateOptions = getDateFormatOptions();
        const checkboxOptions = getCheckboxOptions();
        if (disShow_block) {
            const baseConditions = disShow_block.split(',');
            const filteredConditions = getFilteredConditions(baseConditions);
            contents1 = extractContents(viewKeys, filteredConditions, hiddenFieldsList, dateOptions, checkboxOptions);
        } else {
            const defaultConditions = ['mSelect', 'number', 'date', 'text', 'mAsset', 'checkbox', 'phone', 'url', 'email', 'created', 'updated'];
            const filteredConditions = getFilteredConditions(defaultConditions);
            contents1 = extractContents(viewKeys, filteredConditions, hiddenFieldsList, dateOptions, checkboxOptions);
        }
    
        const contents = contents1
            .filter(element => element !== '' && element !== null && element !== undefined)
            .map(element => String(element)); // 将所有元素转换为字符串
    
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
            contents.forEach(content => {
                const newSpan = document.createElement('span');
                newSpan.className = 'popover__block ariaLabel';
                
                // 设置长度限制
                const maxLength = getMaxDisplayLength();
                const contentStr = String(content);
                if (contentStr.length > maxLength) {
                    newSpan.textContent = contentStr.substring(0, maxLength) + '...';
                    newSpan.setAttribute('aria-label', contentStr); // 使用aria-label显示完整内容
                    // newSpan.title = contentStr; // 保留title作为备用
                    // newSpan.style.cursor = 'help';
                } else {
                    newSpan.textContent = contentStr;
                }
                
                newDiv.appendChild(newSpan);
            });
    
            // 将 newDiv 插入到 attrContainer 中
            attrContainer.insertBefore(newDiv, attrContainer.firstChild);
    
            // console.log(".protyle-attr 元素已添加到父元素");
        });
    }

    // 调用函数
}

const callback = (mutationsList: MutationRecord[]) => {
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
            mutation.removedNodes.forEach((node) => {
                if (node instanceof HTMLElement && node.matches('div[data-key="dialog-attr"].b3-dialog--open')) {
                    console.log('Dialog closed');
                    // 在这里添加你的代码
                    DatabaseDisplay.prototype.loaded();
                }
            });
        }
    }
};

// 
export function outLog(any, str = "") {
    if (isoutLog) {
        console.log(any, str);
    }
}