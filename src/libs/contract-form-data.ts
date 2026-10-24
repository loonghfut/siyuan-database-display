/**
 * 从类型化字段构造 multipart 上传表单。
 *
 * 思源 3.8.x 起 fetchPost/fetchSyncPost 对已知路径启用 API 契约类型：
 * multipart 接口的 data 必须是携带 apiRequest 属性的 FormData
 * （node_modules\siyuan\types\api\index.d.ts 的 APIFormData）。
 * 该辅助类随官方前端实现（app\src\util\contractFormData.ts），未随 npm 包导出，
 * 插件侧按官方代码等价移植。
 */
export class ContractFormData<Request extends Record<string, string | Blob | Array<string | Blob> | undefined>> extends FormData {
    public readonly apiRequest: Request;

    constructor(request: Request) {
        super();
        this.apiRequest = request;
        Object.entries(request).forEach(([name, value]) => {
            if (Array.isArray(value)) {
                value.forEach(item => this.append(name, item));
            } else if (value !== undefined) {
                this.append(name, value);
            }
        });
    }
}
