// settings.ts
import { updateHiddenFields } from './index';
import { validateHiddenFields } from './handleKey';
import { showMessage } from 'siyuan';
import { SettingUtils } from './libs/setting-utils';

export function addSettings(settingUtils: SettingUtils) {
    // 统一广播颜色配置变化事件
    function emitColorConfigChanged() {
        document.dispatchEvent(new CustomEvent('dbdisplay-color-changed'));
    }
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
            textarea.dataset.settingKey = 'field-color-map';

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
                        textarea.dispatchEvent(new Event('input'));
                        emitColorConfigChanged();
                    };
                    item.appendChild(label);
                    item.appendChild(input);
                    visual.appendChild(item);
                });
            }
            textarea.addEventListener('input', () => {
                settingUtils.set('field-color-map', textarea.value);
                syncVisual();
                emitColorConfigChanged();
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
            textarea.dataset.settingKey = 'field-bg-color-map';

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
                        textarea.dispatchEvent(new Event('input'));
                        emitColorConfigChanged();
                    };
                    item.appendChild(label);
                    item.appendChild(input);
                    visual.appendChild(item);
                });
            }
            textarea.addEventListener('input', () => {
                settingUtils.set('field-bg-color-map', textarea.value);
                syncVisual();
                emitColorConfigChanged();
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
    // 基于值的配色（优先级最高）
    settingUtils.addItem({
        key: "field-value-color-map",
        value: "{\n  \"测试\": { \"color\": \"#ffffff\", \"bg\": \"#dc2626\" },\n  \"重要\": { \"bg\": \"#fde68a\", \"color\": \"#92400e\" },\n  \"进行中\": \"#2563eb\"\n}",
        type: "custom",
        title: "字段值配色(JSON)",
        direction: "row",
        description: "按具体值自定义颜色，覆盖类型配色。格式: { \"值\": \"#文字色\" } 或 { \"值\": { \"color\": \"#文字色\", \"bg\": \"#背景色\" } }。",
        createElement: (currentVal: string) => {
            const wrap = document.createElement('div');
            wrap.style.display = 'flex';
            wrap.style.flexDirection = 'column';
            wrap.style.gap = '6px';

            const textarea = document.createElement('textarea');
            textarea.className = 'b3-text-field fn__block';
            textarea.style.height = '140px';
            textarea.value = currentVal || '';
            textarea.dataset.settingKey = 'field-value-color-map';

            const list = document.createElement('div');
            list.style.display = 'flex';
            list.style.flexDirection = 'column';
            list.style.gap = '4px';

            const addBtn = document.createElement('button');
            addBtn.className = 'b3-button b3-button--outline';
            addBtn.textContent = '新增条目';

            let valueOrder: string[] = [];
            function parse(): any {
                try {
                    const obj = JSON.parse(textarea.value || '{}');
                    if (!valueOrder.length) {
                        valueOrder = Object.keys(obj);
                    } else {
                        // 同步新增键（保持已有顺序在前）
                        Object.keys(obj).forEach(k => { if (!valueOrder.includes(k)) valueOrder.push(k); });
                        // 移除已删除键
                        valueOrder = valueOrder.filter(k => Object.prototype.hasOwnProperty.call(obj, k));
                    }
                    return obj;
                } catch { return {}; }
            }
            function serializeWithOrder(obj: any) {
                const ordered: any = {};
                valueOrder.forEach(k => { if (Object.prototype.hasOwnProperty.call(obj, k)) ordered[k] = obj[k]; });
                // 兜底剩余键
                Object.keys(obj).forEach(k => { if (!Object.prototype.hasOwnProperty.call(ordered, k)) ordered[k] = obj[k]; });
                textarea.value = JSON.stringify(ordered, null, 2);
                settingUtils.set('field-value-color-map', textarea.value);
                settingUtils.save();
                emitColorConfigChanged();
            }
            function rebuild() {
                list.innerHTML = '';
                const obj = parse();
                Object.keys(obj).forEach(key => {
                    const row = document.createElement('div');
                    row.style.display = 'flex';
                    row.style.alignItems = 'center';
                    row.style.gap = '4px';
                    const keyInput = document.createElement('input');
                    keyInput.className = 'b3-text-field';
                    keyInput.style.width = '120px';
                    keyInput.value = key;
                    const colorInput = document.createElement('input');
                    colorInput.type = 'color';
                    const bgInput = document.createElement('input');
                    bgInput.type = 'color';
                    bgInput.title = '背景色';
                    let val = obj[key];
                    let colorVal = '#000000';
                    let bgVal = '#ffffff';
                    if (typeof val === 'string') {
                        colorVal = val;
                    } else if (val && typeof val === 'object') {
                        if (val.color) colorVal = val.color;
                        if (val.bg) bgVal = val.bg;
                    }
                    const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                    colorInput.value = hex.test(colorVal) ? colorVal : '#000000';
                    bgInput.value = hex.test(bgVal) ? bgVal : '#ffffff';
                    const delBtn = document.createElement('button');
                    delBtn.className = 'b3-button';
                    delBtn.textContent = '✕';
                    delBtn.style.padding = '0 6px';
                    function commit() {
                        const newKey = keyInput.value.trim();
                        if (!newKey) return;
                        const prevIndex = valueOrder.indexOf(key);
                        delete obj[key];
                        if (bgInput.value === '#ffffff') {
                            obj[newKey] = colorInput.value;
                        } else {
                            obj[newKey] = { color: colorInput.value, bg: bgInput.value };
                        }
                        if (prevIndex >= 0) {
                            valueOrder[prevIndex] = newKey;
                        } else if (!valueOrder.includes(newKey)) {
                            valueOrder.push(newKey);
                        }
                        serializeWithOrder(obj);
                        rebuild();
                    }
                    keyInput.onchange = commit;
                    colorInput.onchange = commit;
                    bgInput.onchange = commit;
                    delBtn.onclick = () => {
                        delete obj[key];
                        valueOrder = valueOrder.filter(k => k !== key);
                        serializeWithOrder(obj);
                        rebuild();
                    };
                    row.appendChild(keyInput);
                    row.appendChild(colorInput);
                    row.appendChild(bgInput);
                    row.appendChild(delBtn);
                    list.appendChild(row);
                });
            }
            addBtn.onclick = () => {
                const obj = parse();
                let base = '新值';
                let i = 1;
                while (Object.prototype.hasOwnProperty.call(obj, base)) { base = '新值' + (++i); }
                obj[base] = '#000000';
                valueOrder.push(base);
                serializeWithOrder(obj);
                rebuild();
            };
            textarea.addEventListener('input', () => {
                settingUtils.set('field-value-color-map', textarea.value);
                emitColorConfigChanged();
                rebuild();
            });
            rebuild();
            wrap.appendChild(textarea);
            wrap.appendChild(addBtn);
            wrap.appendChild(list);
            return wrap;
        },
        getEleVal: (ele: HTMLElement) => (ele.querySelector('textarea') as HTMLTextAreaElement)?.value ?? '',
        setEleVal: (ele: HTMLElement, v: any) => { const t = ele.querySelector('textarea') as HTMLTextAreaElement; if (t) t.value = v ?? ''; },
        action: { callback: () => settingUtils.takeAndSave('field-value-color-map') }
    });
    // 预览组件（不存储，仅展示当前配色效果）
    settingUtils.addItem({
        key: "preview-color-demo",
        value: "",
        type: "custom",
        title: "测试预览",
        direction: "row",
        description: "展示当前类型 / 背景 / 值配色的示例。修改任一 JSON 即时刷新。",
        createElement: () => {
            const wrap = document.createElement('div');
            wrap.style.display = 'flex';
            wrap.style.flexDirection = 'column';
            wrap.style.gap = '8px';

            const note = document.createElement('div');
            note.className = 'b3-label';
            note.textContent = '优先级：值配色 > 类型文字色 / 类型背景色 (自动刷新)';

            const sectionTypes = document.createElement('div');
            const sectionValues = document.createElement('div');
            sectionTypes.style.display = sectionValues.style.display = 'flex';
            sectionTypes.style.flexWrap = sectionValues.style.flexWrap = 'wrap';
            sectionTypes.style.gap = sectionValues.style.gap = '6px';

            function chip(label: string, color?: string, bg?: string) {
                const span = document.createElement('span');
                span.textContent = label;
                span.style.fontSize = '12px';
                span.style.lineHeight = '1.4';
                span.style.padding = '2px 6px';
                span.style.borderRadius = '4px';
                span.style.border = '1px solid var(--b3-border-color)';
                if (color) span.style.color = color;
                if (bg) span.style.background = bg;
                span.title = `${label}\n文字色: ${color || '-'}\n背景: ${bg || '-'}`;
                return span;
            }
            function safeParse(str: string) { try { return JSON.parse(str || '{}'); } catch { return {}; } }
            function hexLike(v: string) { return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) || v?.startsWith('rgb') || v?.startsWith('var('); }
            function render() {
                sectionTypes.innerHTML = '';
                sectionValues.innerHTML = '';
                const typeColorMap = safeParse(settingUtils.get('field-color-map'));
                const typeBgMap = safeParse(settingUtils.get('field-bg-color-map'));
                const allKeys = ["mSelect","number","date","text","mAsset","checkbox","phone","url","email","created","updated"];
                allKeys.forEach(k => {
                    sectionTypes.appendChild(chip(k, hexLike(typeColorMap[k]) ? typeColorMap[k] : undefined, hexLike(typeBgMap[k]) ? typeBgMap[k] : undefined));
                });
                const valueMap = safeParse(settingUtils.get('field-value-color-map'));
                Object.keys(valueMap).forEach(v => {
                    const conf = valueMap[v];
                    if (typeof conf === 'string') {
                        sectionValues.appendChild(chip(v, hexLike(conf) ? conf : undefined));
                    } else if (conf && typeof conf === 'object') {
                        sectionValues.appendChild(chip(v, hexLike(conf.color) ? conf.color : undefined, hexLike(conf.bg) ? conf.bg : undefined));
                    }
                });
            }
            render();
            const watchKeys = ['field-color-map','field-bg-color-map','field-value-color-map'];
            function bindListeners() {
                watchKeys.forEach(k => {
                    const el = settingUtils.getElement(k);
                    if (!el) return;
                    const ta = el.querySelector('textarea');
                    if (ta && !ta.dataset.previewListenerBound) {
                        const handler = () => {
                            clearTimeout((ta as any)._previewTimer);
                            (ta as any)._previewTimer = setTimeout(render, 120);
                        };
                        ta.addEventListener('input', handler);
                        ta.addEventListener('change', handler);
                        ta.dataset.previewListenerBound = '1';
                    }
                });
            }
            bindListeners();
            // 监听全局颜色变化事件
            document.addEventListener('dbdisplay-color-changed', () => render());
            setTimeout(bindListeners, 300);
            const title1 = document.createElement('div');
            title1.className = 'b3-label';
            title1.textContent = '类型配色示例:';
            const title2 = document.createElement('div');
            title2.className = 'b3-label';
            title2.textContent = '值配色示例:';
            wrap.appendChild(note);
            wrap.appendChild(title1);
            wrap.appendChild(sectionTypes);
            wrap.appendChild(title2);
            wrap.appendChild(sectionValues);
            return wrap;
        },
        getEleVal: () => '',
        setEleVal: () => {},
        action: { callback: () => {} }
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