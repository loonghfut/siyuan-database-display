// settings.ts
export function addSettings(settingUtils) {
    settingUtils.addItem({
        key: "dis-show",
        value: "",
        type: "textarea",
        title: "展示的字段(不填默认展示所有支持的字段)",
        description: "输入展示的字段(mSelect,number,date,text,mAsset,checkbox,phone,url,email)",
        action: {
            // Called when focus is lost and content changes
            callback: () => {
                settingUtils.takeAndSave("dis-show");
            }
        }
    });
}