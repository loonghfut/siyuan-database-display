// 版本号统一管理工具。
// 约定：plugin.json 是唯一版本来源（思源从它读取插件版本，发布 tag 也以它为准），
// package.json 的 version 由脚本同步，不再手工维护。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
export const PLUGIN_JSON_PATH = path.join(ROOT_DIR, "plugin.json");
export const PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json");

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function isValidVersion(version) {
    return typeof version === "string" && SEMVER_PATTERN.test(version.trim());
}

export function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, data) {
    // 保持 2 空格缩进并以换行结尾，避免产生无意义的 diff
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** 读取两处版本号。pluginVersion 为权威版本。 */
export function readVersions() {
    const pluginData = readJson(PLUGIN_JSON_PATH);
    const packageData = readJson(PACKAGE_JSON_PATH);
    return {
        pluginVersion: pluginData?.version,
        packageVersion: packageData?.version,
        pluginData,
        packageData,
    };
}

/** 校验版本号一致性，返回错误信息数组（为空表示一致）。 */
export function collectVersionProblems() {
    const { pluginVersion, packageVersion } = readVersions();
    const problems = [];

    if (!isValidVersion(pluginVersion)) {
        problems.push(`plugin.json 的 version 缺失或格式非法：${JSON.stringify(pluginVersion)}`);
    }
    if (!isValidVersion(packageVersion)) {
        problems.push(`package.json 的 version 缺失或格式非法：${JSON.stringify(packageVersion)}`);
    }
    if (problems.length === 0 && pluginVersion !== packageVersion) {
        problems.push(
            `版本号不一致：plugin.json=${pluginVersion}，package.json=${packageVersion}` +
            `（以 plugin.json 为准，执行 pnpm sync-version 可自动对齐）`
        );
    }

    return problems;
}

export function bumpVersion(version, type) {
    const [major, minor, patch] = version.split("-")[0].split(".").map(Number);
    switch (type) {
        case "major":
            return `${major + 1}.0.0`;
        case "minor":
            return `${major}.${minor + 1}.0`;
        case "patch":
            return `${major}.${minor}.${patch + 1}`;
        default:
            throw new Error(`未知的版本递增类型：${type}`);
    }
}

/** 把 plugin.json 的版本写入 package.json，返回 { from, to }。 */
export function syncPackageVersion() {
    const { pluginVersion, packageData } = readVersions();
    if (!isValidVersion(pluginVersion)) {
        throw new Error(`plugin.json 的 version 非法：${JSON.stringify(pluginVersion)}`);
    }
    const from = packageData.version;
    if (from === pluginVersion) {
        return { from, to: pluginVersion, changed: false };
    }
    packageData.version = pluginVersion;
    writeJson(PACKAGE_JSON_PATH, packageData);
    return { from, to: pluginVersion, changed: true };
}
