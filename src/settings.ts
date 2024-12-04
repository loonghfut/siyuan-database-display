// settings.ts
export function addSettings(settingUtils) {
    settingUtils.addItem({
        key: "",
        value: true,
        type: "checkbox",
        title: "此设置暂时不可用，写到一半发现，这个设置选项多了的话好难看~~",
        description: "此设置暂时不可用！此设置暂时不可用！此设置暂时不可用！",
        action: {
            callback: () => {
                
            }
        }
    });

    settingUtils.addItem({
        key: "Check-mSelect",
        value: true,
        type: "checkbox",
        title: "多选和单选",
        description: "选择是否显示",
        action: {
            callback: () => {
                settingUtils.takeAndSave("Check-mSelect");
            }
        }
    });
    settingUtils.addItem({
        key: "Check-number",
        value: true,
        type: "checkbox",
        title: "数字",
        description: "选择是否显示",
        action: {
            callback: () => {
                settingUtils.takeAndSave("Check-number");
            }
        }
    });
    settingUtils.addItem({
        key: "Check-date",
        value: true,
        type: "checkbox",
        title: "日期",
        description: "选择是否显示",
        action: {
            callback: () => {
                settingUtils.takeAndSave("Check-date");
            }
        }
    });
    settingUtils.addItem({
        key: "Check-text",
        value: true,
        type: "checkbox",
        title: "文本",
        description: "选择是否显示",
        action: {
            callback: () => {
                settingUtils.takeAndSave("Check-text");
            }
        }
    });
    settingUtils.addItem({
        key: "Check-mAsset",
        value: true,
        type: "checkbox",
        title: "附件",
        description: "选择是否显示",
        action: {
            callback: () => {
                settingUtils.takeAndSave("Check-mAsset");
            }
        }
    });
    settingUtils.addItem({
        key: "Check-checkbox",
        value: true,
        type: "checkbox",
        title: "多选框",
        description: "选择是否显示",
        action: {
            callback: () => {
                settingUtils.takeAndSave("Check-checkbox");
            }
        }
    });
    settingUtils.addItem({
        key: "Check-phone",
        value: true,
        type: "checkbox",
        title: "电话",
        description: "选择是否显示",
        action: {
            callback: () => {
                settingUtils.takeAndSave("Check-phone");
            }
        }
    });
    settingUtils.addItem({
        key: "Check-url",
        value: true,
        type: "checkbox",
        title: "链接",
        description: "选择是否显示",
        action: {
            callback: () => {
                settingUtils.takeAndSave("Check-url");
            }
        }
    });
    settingUtils.addItem({
        key: "Check-email",
        value: true,
        type: "checkbox",
        title: "邮箱",
        description: "选择是否显示",
        action: {
            callback: () => {
                settingUtils.takeAndSave("Check-email");
            }
        }
    });


}