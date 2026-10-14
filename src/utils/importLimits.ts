export const MAX_JSON_IMPORT_FILE_SIZE = 20 * 1024 * 1024;

export function validateJsonImportFileSize(size: number, label = 'JSON 文件'): void {
  if (!Number.isFinite(size) || size < 0) throw new Error(`${label}大小无效。`);
  if (size > MAX_JSON_IMPORT_FILE_SIZE) throw new Error(`${label}不能超过 20 MB。`);
}
