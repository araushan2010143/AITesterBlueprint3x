export class ResponseHelper {
  public static getValueByPath<T = unknown>(data: Record<string, unknown>, path: string): T {
    const sanitized = path.replace(/\$\./, '');
    const properties = sanitized.split('.');
    let result: unknown = data;

    for (const prop of properties) {
      if (result && typeof result === 'object' && prop in result) {
        result = (result as Record<string, unknown>)[prop];
      } else {
        throw new Error(`Unable to resolve JSON path: ${path}`);
      }
    }
    return result as T;
  }
}
