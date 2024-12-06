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
import { getCursorBlockId, getAVreferenceid } from "./block";

let disShow_doc = null;
let disShow_block = null;
let isoutLog = false;
let currentDocId = null;
let currentDocId_block = null;
let clickId = null;
export let isShow = null;

export default class DatabaseDisplay extends Plugin {
    private settingUtils: SettingUtils;

    async onload() {
        //记得取消注释
        this.eventBus.on("switch-protyle", async (event) => {
            currentDocId = event.detail.protyle.block.id;
            await this.showdata_doc();
            currentDocId_block = await getAVreferenceid(currentDocId);
            //遍历currentDocId_block执行showdata_block
            for (let i = 0; i < currentDocId_block.length; i++) {
                clickId = currentDocId_block[i];
                await this.showdata_block();
            }
        });
        // this.eventBus.on("click-editorcontent", this.handleSelectionChange.bind(this));

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
        // this.loadData(STORAGE_NAME);
    }
    async onunload() {
        this.eventBus.off("switch-protyle", this.showdata_doc);
        this.eventBus.off("click-editorcontent", this.handleSelectionChange.bind(this));
    }
    uninstall() {
        this.eventBus.off("switch-protyle", this.showdata_doc);
        this.eventBus.off("click-editorcontent", this.handleSelectionChange.bind(this));
        //console.log("uninstall");
    }

    async showdata_doc() {
        //console.log("showdata2");
        const viewKeys = await getAttributeViewKeys(currentDocId);
        let contents1 = [];
        if (disShow_doc) {
            contents1 = extractContents(viewKeys, disShow_doc.split(','));
        } else {
            contents1 = extractContents(viewKeys);
        }
        // console.log(contents1);
        const contents = contents1.filter(element => element !== '' && element !== null && element !== undefined);
        // 创建并设置新元素
        // const contents = ['内容1', '较长的内容2', '内容3', '非常非常长的内容4', '内容5', '内容6', '内容7', '内容8', '内容9', '内容10']; // 示例内容数组
        // 动态生成 my__block 类的样式
        // 找到所有可能的父元素
        const parentElements = document.querySelectorAll('.protyle-title');
        let parentElement = null;
        // 遍历父元素，找到不包含 'fn__none' 类且 id 匹配的元素
        parentElements.forEach(element => {
            if (!element.classList.contains('fn__none') && element.getAttribute('data-node-id') === currentDocId) {
                parentElement = element;
            }
        });

        if (!parentElement) {
            //console.log("无法找到不包含 'fn__none' 类且 id 匹配的父元素");
            return;
        }
        //console.log("找到不包含 'fn__none' 类且 id 匹配的父元素 .protyle-title");

        // 检查是否已经存在 .my__block-container 元素
        let container = document.querySelector('.my__block-container');
        if (!container) {
            // 创建一个容器元素
            container = document.createElement('div');
            container.className = 'my__block-container';
            //console.log("创建 .my__block-container 元素");
        } else {
            // 删除原有的内容，再重新添加
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
            //console.log(".my__block-container 元素已存在，内容已清空");
        }

        // 将每个内容项添加到容器中
        contents.forEach(content => {
            const newSpan = document.createElement('span');
            newSpan.className = 'my__block';
            newSpan.textContent = content; // 将内容项设置为 span 的文本内容
            container.appendChild(newSpan);
            //console.log(`添加内容项: ${content}`);
        });

        // 将容器添加到父元素中
        parentElement.appendChild(container);
        //console.log(".my__block-container 已添加到父元素");
    }

    async showdata_block() {
        const currentDocId = clickId; // 替换为实际的 currentDocId
        const viewKeys = await getAttributeViewKeys(currentDocId);
        let contents1 = [];
        if (disShow_block) {
            contents1 = extractContents(viewKeys, disShow_block.split(','));
        } else {
            contents1 = extractContents(viewKeys);
        }

        const contents = contents1
            .filter(element => element !== '' && element !== null && element !== undefined)
            .map(element => String(element)); // 将所有元素转换为字符串

        const parentElements = document.querySelectorAll('.p[custom-avs]');//TODO:目前暂时只支持段落块
        let parentElement = null;
        outLog(parentElements);
        parentElements.forEach(element => {
            // console.log(element.getAttribute('data-node-id'), currentDocId);
            // console.log(element.getAttribute('data-node-id'), "currentDocId");
            if (element.getAttribute('data-node-id') === currentDocId) {
                parentElement = element;
            }
        });

        if (!parentElement) {
            console.log("无法找到 id 匹配的父元素");
            return;
        }

        const attrContainer = parentElement.querySelector('.protyle-attr');
        if (!attrContainer) {
            console.log("无法找到 .protyle-attr 元素");
            return;
        }

        contents.forEach(content => {
            // 检查是否已经存在相同内容的元素
            const existingElement = Array.from(attrContainer.querySelectorAll('.popover__block')).find((span: HTMLElement) => {
                const spanText = typeof span.textContent === 'string' ? span.textContent.trim() : '';
                const contentText = typeof content === 'string' ? content.trim() : '';
                return spanText.localeCompare(contentText, undefined, { numeric: true }) === 0;
            });
            if (existingElement) {
                outLog(`内容项 "${content}" 已存在`);
                return;
            }

            const newDiv = document.createElement('div');
            newDiv.className = 'protyle-attr--av';
            const newUse = document.createElement('use');
            newUse.setAttribute('xlink:href', '#iconDatabase');

            const newSpan = document.createElement('span');
            newSpan.className = 'popover__block';
            newSpan.setAttribute('data-av-id', `${currentDocId}`); // 替换为实际的 data-av-id
            newSpan.setAttribute('data-popover-url', '/api/av/getMirrorDatabaseBlocks'); // 替换为实际的 data-popover-url
            newSpan.textContent = content;

            newDiv.appendChild(newSpan);
            attrContainer.insertBefore(newDiv, attrContainer.firstChild);
        });

        // console.log(".protyle-attr 元素已添加到父元素");
    }

    // 调用函数


}






// 
export function outLog(any) {
    if (isoutLog) {
        console.log(any);
    }
}