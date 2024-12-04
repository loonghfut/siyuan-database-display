import {
    Plugin,
    // showMessage,
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

let isoutLog = true;
let currentDocId = null;
let currentDocId2 = null;
let clickId = null;
export let isShow = null;

export default class DatabaseDisplay extends Plugin {
    private settingUtils: SettingUtils;

    async onload() {
        this.eventBus.on("switch-protyle", async (event) => {
            currentDocId = event.detail.protyle.block.id;
            await this.showdata();
        });
        // this.eventBus.on("click-editorcontent", this.handleSelectionChange);
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




    async showdata() {
        //console.log("showdata2");
        const viewKeys = await getAttributeViewKeys(currentDocId);
        const contents1 = extractContents(viewKeys);
        console.log(contents1);
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


    async handleSelectionChange() {
        // //console.log("handleSelectionChange");
        const blockId = getCursorBlockId();
        if (blockId) {
            // showMessage(`光标所在的块ID: ${blockId}`);
            //console.log(`光标所在的块ID: ${blockId}`);
            clickId = blockId;
        } else {
            //console.log("无法获取光标所在的块ID");
        }
    }

    onLayoutReady() {
        this.settingUtils.load();
        console.log(this.settingUtils.get("Check-mSelect"),'1');
        console.log(this.settingUtils.get("Check-number"),'2');
        console.log(this.settingUtils.get("Check-date"));
        console.log(this.settingUtils.get("Check-text"));
        console.log(this.settingUtils.get("Check-mAsset"));
        console.log(this.settingUtils.get("Check-checkbox"));
        console.log(this.settingUtils.get("Check-phone"));
        console.log(this.settingUtils.get("Check-url"));
        console.log(this.settingUtils.get("Check-email"),'9');
        // this.loadData(STORAGE_NAME);
    }

    async onunload() {
        this.eventBus.off("switch-protyle", this.showdata);
    }

    uninstall() {
        this.eventBus.off("switch-protyle", this.showdata);
        //console.log("uninstall");
    }
}

function getCursorBlockId() {
    //console.log("getCursorBlockId");
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    let container = range.startContainer;

    // 如果 startContainer 是文本节点，则获取其父元素
    if (container.nodeType === Node.TEXT_NODE) {
        container = container.parentElement;
    }

    // 确保 container 是一个元素节点
    if (!(container instanceof Element)) {
        return null;
    }

    const blockElement = container.closest('.protyle-wysiwyg [data-node-id]');

    if (blockElement) {
        return blockElement.getAttribute('data-node-id');
    } else {
        return null;
    }
}





// 
export function outLog(any) {
    if (isoutLog) {
        console.log(any);
    }
}