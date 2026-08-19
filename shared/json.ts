export type JsonPrimitive = string | number | boolean | null;

export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export function parseJson(text: string): JsonValue {
  return JSON.parse(text);
}

export function isJsonObject(value: JsonValue | object | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function getJsonValue(object: JsonObject, key: string): JsonValue | undefined {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
}

export function isString(value: JsonValue | undefined): value is string {
  return typeof value === "string";
}

export function isNumber(value: JsonValue | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isInteger(value: JsonValue | undefined): value is number {
  return isNumber(value) && Number.isSafeInteger(value);
}
