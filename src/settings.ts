// settings.ts
import { updateHiddenFields } from './index';
import { validateHiddenFields } from './handleKey';

export function addSettings(settingUtils) {
    settingUtils.addItem({
        key: "dis-show",
        value: "",
        type: "textarea",
        title: "文档块展示的字段(不填默认展示所有支持的字段)",
        description: "输入展示的字段(mSelect,number,date,text,mAsset,checkbox,phone,url,email)",
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
        description: "输入展示的字段(mSelect,number,date,text,mAsset,checkbox,phone,url,email)",
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
}