// 版本号递增脚本。
// plugin.json 是唯一版本来源：递增基于它的当前版本，并同步写入 package.json，避免两者再次漂移。
//
// 用法：
//   pnpm update-version          交互式选择 patch / minor / major / 手动输入
//   pnpm update-version patch    非交互，直接递增补丁号
//   pnpm update-version 5.4.4    非交互，指定版本号
import readline from "node:readline";
import {
    PLUGIN_JSON_PATH,
    PACKAGE_JSON_PATH,
    bumpVersion,
    collectVersionProblems,
    isValidVersion,
    readVersions,
    writeJson,
} from "./version-utils.mjs";

function promptUser(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(query, (answer) => {
        rl.close();
        resolve(answer.trim());
    }));
}

async function resolveNewVersion(currentVersion) {
    const arg = process.argv[2]?.trim();

    // 非交互模式：支持 patch / minor / major / 显式版本号
    if (arg) {
        if (["patch", "minor", "major"].includes(arg)) return bumpVersion(currentVersion, arg);
        if (isValidVersion(arg)) return arg;
        throw new Error(`无法识别的参数 "${arg}"，可用值：patch | minor | major | x.y.z`);
    }

    const newPatchVersion = bumpVersion(currentVersion, "patch");
    const newMinorVersion = bumpVersion(currentVersion, "minor");
    const newMajorVersion = bumpVersion(currentVersion, "major");

    console.log("\n🔄  如何更新版本号？\n");
    console.log(`   1️⃣  递增补丁号 patch   (${newPatchVersion})`);
    console.log(`   2️⃣  递增次版本 minor   (${newMinorVersion})`);
    console.log(`   3️⃣  递增主版本 major   (${newMajorVersion})`);
    console.log("   4️⃣  手动输入版本号");
    console.log("   0️⃣  退出，不做修改\n");

    const choice = await promptUser("👉  请选择 (1/2/3/4): ");
    switch (choice) {
        case "1":
            return newPatchVersion;
        case "2":
            return newMinorVersion;
        case "3":
            return newMajorVersion;
        case "4": {
            const input = await promptUser("✍️  请输入新版本号（形如 1.2.3）: ");
            if (!isValidVersion(input)) throw new Error(`版本号格式非法：${JSON.stringify(input)}`);
            return input;
        }
        case "0":
            return null;
        default:
            throw new Error(`无效选项：${JSON.stringify(choice)}`);
    }
}

async function main() {
    const { pluginVersion, pluginData, packageData } = readVersions();

    if (!isValidVersion(pluginVersion)) {
        throw new Error(`plugin.json 中的 version 非法：${JSON.stringify(pluginVersion)}`);
    }

    // 先暴露已有漂移，避免在错误版本上继续递增
    const problems = collectVersionProblems();
    if (problems.length > 0) {
        console.warn("⚠️  检测到版本号不一致：");
        for (const problem of problems) console.warn(`   - ${problem}`);
        console.warn("");
    }

    console.log(`🌟  当前版本（plugin.json）：${pluginVersion}`);
    if (packageData.version !== pluginVersion) {
        console.log(`    package.json 当前为：${packageData.version}`);
    }
    console.log("");

    const newVersion = await resolveNewVersion(pluginVersion);
    if (!newVersion) {
        console.log("🛑  已取消，未修改版本号。");
        return;
    }
    if (newVersion === pluginVersion && packageData.version === pluginVersion) {
        console.log(`🤷  版本号未变化：${newVersion}`);
        return;
    }

    pluginData.version = newVersion;
    packageData.version = newVersion;
    writeJson(PLUGIN_JSON_PATH, pluginData);
    writeJson(PACKAGE_JSON_PATH, packageData);

    console.log(`✅  版本号已更新为 ${newVersion}（plugin.json + package.json）`);
    console.log(`\n下一步建议：\n   pnpm check-version   # 确认一致\n   git add plugin.json package.json && git commit -m "v${newVersion}"`);
}

main().catch((error) => {
    console.error("❌  错误：", error instanceof Error ? error.message : error);
    process.exit(1);
});
