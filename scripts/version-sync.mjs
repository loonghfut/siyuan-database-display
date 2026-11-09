#!/usr/bin/env node
// 版本号检查 / 同步。
//   node scripts/version-sync.mjs --check   校验 plugin.json 与 package.json 版本一致（不一致时退出码 1）
//   node scripts/version-sync.mjs --write   以 plugin.json 为准，把版本同步到 package.json
import { collectVersionProblems, readVersions, syncPackageVersion } from "./version-utils.mjs";

const mode = process.argv.includes("--write") ? "write" : "check";
const { pluginVersion, packageVersion } = readVersions();

if (mode === "write") {
    const { from, to, changed } = syncPackageVersion();
    if (changed) {
        console.log(`✅ package.json 版本已同步：${from} → ${to}（来源：plugin.json）`);
    } else {
        console.log(`✅ 版本号已一致：${to}`);
    }
    process.exit(0);
}

const problems = collectVersionProblems();
if (problems.length > 0) {
    console.error("❌ 版本号校验失败：");
    for (const problem of problems) console.error(`   - ${problem}`);
    console.error(`\n   当前版本：plugin.json=${pluginVersion}，package.json=${packageVersion}`);
    console.error("   修复方式：pnpm sync-version（以 plugin.json 为准同步）或 pnpm update-version（发布前递增版本）");
    process.exit(1);
}

console.log(`✅ 版本号一致：${pluginVersion}`);
