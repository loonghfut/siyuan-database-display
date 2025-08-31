// settings.ts
import { updateHiddenFields } from './index';
import { validateHiddenFields } from './handleKey';
import { showMessage } from 'siyuan';
import { SettingUtils } from './libs/setting-utils';

export function addSettings(settingUtils: SettingUtils) {
    settingUtils.addItem({
        key: "dis-show",
        value: "",
        type: "textarea",
        title: "文档块展示的字段(不填默认展示所有支持的字段)",
        description: "输入展示的字段(mSelect,number,date,text,mAsset,checkbox,phone,url,email,created,updated)",
        action: {
            // Called when focus is lost and content changes
            callback: () => {
                settingUtils.takeAndSave("dis-show");
            }
        }
    });
    settingUtils.addItem({
        key: "dis-show-block",
        value: "mSelect,text",
        type: "textarea",
        title: "普通块展示的字段(不填默认展示所有支持的字段)",
        description: "输入展示的字段(mSelect,number,date,text,mAsset,checkbox,phone,url,email,created,updated)",
        action: {
            // Called when focus is lost and content changes
            callback: () => {
                settingUtils.takeAndSave("dis-show-block");
            }
        }
    });
    settingUtils.addItem({
        key: "hidden-fields",
        value: "",
        type: "textarea",
        title: "隐藏的字段名称",
        description: "输入要隐藏的字段名称，用逗号分隔。例如：密码,私人信息,内部备注。设置后将在数据显示时自动过滤这些字段。",
        action: {
            // Called when focus is lost and content changes
            callback: () => {
                const hiddenFieldsValue = settingUtils.get("hidden-fields");

                // 验证隐藏字段设置
                const validation = validateHiddenFields(hiddenFieldsValue);
                if (!validation.isValid) {
                    console.warn("隐藏字段设置有问题:", validation.errors);
                    // 可以选择显示警告消息给用户
                }

                settingUtils.takeAndSave("hidden-fields");
                // 更新全局隐藏字段变量
                updateHiddenFields(hiddenFieldsValue);

                // 显示设置生效提示
                const fieldCount = validation.fields.length;
                if (fieldCount > 0) {
                    console.log(`隐藏字段设置已更新，共隐藏 ${fieldCount} 个字段: ${validation.fields.join(', ')}`);
                } else {
                    console.log("隐藏字段设置已清空，将显示所有字段");
                }
            }
        }
    });
    settingUtils.addItem({
        key: "date-format",
        value: "YYYY-MM-DD",
        type: "select",
        title: "日期显示格式",
        description: "选择日期字段的显示格式",
        options: {
            "YYYY-MM-DD": "YYYY-MM-DD (2023-12-25)",
            "YYYY/MM/DD": "YYYY/MM/DD (2023/12/25)",
            "MM/DD/YYYY": "MM/DD/YYYY (12/25/2023)",
            "DD/MM/YYYY": "DD/MM/YYYY (25/12/2023)",
            "full": "完整格式 (2023年12月25日星期一)",
            "relative": "相对时间 (3天前, 明天)"
        },
        action: {
            callback: () => {
                settingUtils.takeAndSave("date-format");
                console.log(`日期格式已更新为: ${settingUtils.get("date-format")}`);
            }
        }
    });
    settingUtils.addItem({
        key: "include-time",
        value: false,
        type: "checkbox",
        title: "显示时间",
        description: "是否在日期中包含具体时间 (小时:分钟:秒)",
        action: {
            callback: () => {
                settingUtils.takeAndSave("include-time");
                const includeTime = settingUtils.get("include-time");
                console.log(`时间显示已${includeTime ? '开启' : '关闭'}`);
            }
        }
    });
    settingUtils.addItem({
        key: "checkbox-style",
        value: "emoji",
        type: "select",
        title: "复选框显示样式",
        description: "选择复选框字段的显示样式",
        options: {
            "emoji": "表情符号 (✅ / ❌)",
            "symbol": "符号样式 (☑ / ☐)",
            "text": "文字描述 (已选中 / 未选中)"
        },
        action: {
            callback: () => {
                settingUtils.takeAndSave("checkbox-style");
                console.log(`复选框样式已更新为: ${settingUtils.get("checkbox-style")}`);
            }
        }
    });
    settingUtils.addItem({
        key: "show-timestamps",
        value: true,
        type: "checkbox",
        title: "显示时间戳字段",
        description: "是否显示创建时间(created)和更新时间(updated)字段。关闭后这些字段将被自动过滤。",
        action: {
            callback: () => {
                settingUtils.takeAndSave("show-timestamps");
                const showTimestamps = settingUtils.get("show-timestamps");
                console.log(`时间戳字段显示已${showTimestamps ? '开启' : '关闭'}`);
            }
        }
    });
    settingUtils.addItem({
        key: "max-display-length",
        value: 30,
        type: "number",
        title: "最大显示长度",
        description: "设置字段内容的最大显示字符数，超出部分将显示为省略号。范围：10-200字符。",
        action: {
            callback: () => {
                const maxLength = parseInt(settingUtils.get("max-display-length"));
                // 验证输入范围
                if (maxLength < 10 || maxLength > 200) {
                    showMessage("最大显示长度应在10-200字符之间，已重置为默认值30");
                    settingUtils.set("max-display-length", 30);
                }
                settingUtils.takeAndSave("max-display-length");
                console.log(`最大显示长度已更新为: ${settingUtils.get("max-display-length")} 字符`);
            }
        }
    });
    // 字段类型配色 JSON
    settingUtils.addItem({
        key: "field-color-map",
        value: "{\n  \"mSelect\": \"#4f46e5\",\n  \"number\": \"#2563eb\",\n  \"date\": \"#16a34a\",\n  \"text\": \"#374151\",\n  \"mAsset\": \"#7c3aed\",\n  \"checkbox\": \"#059669\",\n  \"phone\": \"#0d9488\",\n  \"url\": \"#d97706\",\n  \"email\": \"#db2777\",\n  \"created\": \"#6b7280\",\n  \"updated\": \"#6b7280\"\n}",
        type: "custom",
        title: "字段文字类型配色(JSON)",
        direction: "row",
        description: "为各字段类型自定义颜色。支持: mSelect,number,date,text,mAsset,checkbox,phone,url,email,created,updated。左侧输入框直接编辑 JSON，右侧可视化修改。",
        createElement: (currentVal: string) => {
            const wrap = document.createElement('div');
            wrap.style.display = 'flex';
            wrap.style.flexDirection = 'column';
            wrap.style.gap = '4px';

            const textarea = document.createElement('textarea');
            textarea.className = 'b3-text-field fn__block';
            textarea.style.height = '120px';
            textarea.value = currentVal || '';

            const visual = document.createElement('div');
            visual.style.display = 'flex';
            visual.style.flexWrap = 'wrap';
            visual.style.gap = '6px';

            const help = document.createElement('div');
            help.className = 'b3-label';
            help.textContent = '可视化修改:';

            function syncVisual() {
                visual.innerHTML = '';
                let map: Record<string, string> = {};
                try {
                    map = JSON.parse(textarea.value || '{}');
                } catch (e) {
                    // ignore
                }
                const allKeys = ["mSelect", "number", "date", "text", "mAsset", "checkbox", "phone", "url", "email", "created", "updated"];
                allKeys.forEach(k => {
                    const item = document.createElement('div');
                    item.style.display = 'flex';
                    item.style.alignItems = 'center';
                    item.style.gap = '4px';
                    const label = document.createElement('span');
                    label.textContent = k;
                    label.style.fontSize = '12px';
                    const input = document.createElement('input');
                    input.type = 'color';
                    // 简单校验 hex
                    const val = map[k] || '#888888';
                    const hexMatch = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                    input.value = hexMatch.test(val) ? val : '#888888';
                    input.onchange = () => {
                        map[k] = input.value;
                        textarea.value = JSON.stringify(map, null, 2);
                        settingUtils.set('field-color-map', textarea.value);
                        settingUtils.save();
                    }
                    item.appendChild(label);
                    item.appendChild(input);
                    visual.appendChild(item);
                });
            }
            textarea.addEventListener('input', () => {
                settingUtils.set('field-color-map', textarea.value);
                syncVisual();
            });
            syncVisual();

            wrap.appendChild(textarea);
            wrap.appendChild(help);
            wrap.appendChild(visual);
            return wrap;
        },
        getEleVal: (ele: HTMLElement) => {
            const textarea = ele.querySelector('textarea') as HTMLTextAreaElement;
            return textarea?.value ?? '';
        },
        setEleVal: (ele: HTMLElement, val: any) => {
            const textarea = ele.querySelector('textarea') as HTMLTextAreaElement;
            if (textarea) textarea.value = val ?? '';
        },
        action: {
            callback: () => {
                settingUtils.takeAndSave('field-color-map');
            }
        }
    });
    // 字段背景色配色 JSON
    settingUtils.addItem({
        key: "field-bg-color-map",
        value: "{\n  \"mSelect\": \"#eef2ff\",\n  \"number\": \"#dbeafe\",\n  \"date\": \"#dcfce7\",\n  \"text\": \"#f3f4f6\",\n  \"mAsset\": \"#ede9fe\",\n  \"checkbox\": \"#d1fae5\",\n  \"phone\": \"#ccfbf1\",\n  \"url\": \"#fef3c7\",\n  \"email\": \"#fce7f3\",\n  \"created\": \"#f1f5f9\",\n  \"updated\": \"#f1f5f9\"\n}",
        type: "custom",
        title: "字段背景类型配色(JSON)",
        direction: "row",
        description: "为各字段类型自定义背景颜色（浅色更易读）。支持同上字段。",
        createElement: (currentVal: string) => {
            const wrap = document.createElement('div');
            wrap.style.display = 'flex';
            wrap.style.flexDirection = 'column';
            wrap.style.gap = '4px';

            const textarea = document.createElement('textarea');
            textarea.className = 'b3-text-field fn__block';
            textarea.style.height = '120px';
            textarea.value = currentVal || '';

            const visual = document.createElement('div');
            visual.style.display = 'flex';
            visual.style.flexWrap = 'wrap';
            visual.style.gap = '6px';

            const help = document.createElement('div');
            help.className = 'b3-label';
            help.textContent = '可视化修改:';

            function syncVisual() {
                visual.innerHTML = '';
                let map: Record<string, string> = {};
                try { map = JSON.parse(textarea.value || '{}'); } catch (e) {}
                const allKeys = ["mSelect", "number", "date", "text", "mAsset", "checkbox", "phone", "url", "email", "created", "updated"];
                allKeys.forEach(k => {
                    const item = document.createElement('div');
                    item.style.display = 'flex';
                    item.style.alignItems = 'center';
                    item.style.gap = '4px';
                    const label = document.createElement('span');
                    label.textContent = k;
                    label.style.fontSize = '12px';
                    const input = document.createElement('input');
                    input.type = 'color';
                    const val = map[k] || '#ffffff';
                    const hexMatch = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                    input.value = hexMatch.test(val) ? val : '#ffffff';
                    input.onchange = () => {
                        map[k] = input.value;
                        textarea.value = JSON.stringify(map, null, 2);
                        settingUtils.set('field-bg-color-map', textarea.value);
                        settingUtils.save();
                    }
                    item.appendChild(label);
                    item.appendChild(input);
                    visual.appendChild(item);
                });
            }
            textarea.addEventListener('input', () => {
                settingUtils.set('field-bg-color-map', textarea.value);
                syncVisual();
            });
            syncVisual();

            wrap.appendChild(textarea);
            wrap.appendChild(help);
            wrap.appendChild(visual);
            return wrap;
        },
        getEleVal: (ele: HTMLElement) => {
            const textarea = ele.querySelector('textarea') as HTMLTextAreaElement;
            return textarea?.value ?? '';
        },
        setEleVal: (ele: HTMLElement, val: any) => {
            const textarea = ele.querySelector('textarea') as HTMLTextAreaElement;
            if (textarea) textarea.value = val ?? '';
        },
        action: { callback: () => settingUtils.takeAndSave('field-bg-color-map') }
    });
    // 自动刷新间隔设置（若后续实现自动 loaded 逻辑，可直接读取此值）
    settingUtils.addItem({
        key: "auto-loaded-interval",
        value: 0,
        type: "number",
        title: "自动刷新间隔(秒)",
        description: "定时自动执行 loaded() 的间隔；0=关闭；>=5 启用（小于5会自动提升到5）。",
        action: {
            callback: () => {
                let v = parseInt(settingUtils.get("auto-loaded-interval"));
                if (isNaN(v) || v < 0) v = 0;
                if (v > 0 && v < 5) v = 5; // 最小 5 秒
                settingUtils.set("auto-loaded-interval", v);
                settingUtils.takeAndSave("auto-loaded-interval");
                const plugin = (window as any).siyuan?.plugins?.find?.(p => p.name === 'DatabaseDisplay');
                if (plugin && typeof plugin.updateAutoLoadedInterval === 'function') {
                    plugin.updateAutoLoadedInterval();
                }
                showMessage(v === 0 ? '自动刷新已关闭' : `自动刷新每 ${v} 秒`);
            }
        }
    });
}