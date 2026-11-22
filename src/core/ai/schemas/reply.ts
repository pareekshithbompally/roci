/** A model's structured output, defined once as a zod object: the JSON schema the model is given comes from it, and its reply
 *  is read against it leniently — whatever fits is kept, so one malformed field never costs the rest. */

import { z } from 'zod';

type JsonSchema = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keys whose value is a list of schemas, or one schema, to walk into. */
const SCHEMA_LISTS = ['anyOf', 'oneOf', 'allOf'] as const;

/** An optional field as strict structured output takes it: required, and either its value or null. */
function nullable(field: JsonSchema): JsonSchema {
  const { description, ...value } = field;
  return { ...(description === undefined ? {} : { description }), anyOf: [value, { type: 'null' }] };
}

/** `node` in strict form: every object lists all its properties as required (an optional one may be null), at every depth. */
function strict(node: JsonSchema): JsonSchema {
  const out: JsonSchema = { ...node };
  if (isRecord(node.items)) out.items = strict(node.items);
  for (const key of SCHEMA_LISTS) {
    const list = node[key];
    if (Array.isArray(list)) out[key] = list.map((item) => (isRecord(item) ? strict(item) : item));
  }
  if (!isRecord(node.properties)) return out;
  const required = new Set(Array.isArray(node.required) ? node.required : []);
  const properties = Object.fromEntries(Object.entries(node.properties).map(([key, field]) => {
    const walked = isRecord(field) ? strict(field) : field;
    return [key, required.has(key) || !isRecord(walked) ? walked : nullable(walked)];
  }));
  return { ...out, properties, required: Object.keys(properties) };
}

/** The JSON schema a model is given, in strict form (OpenAI's strict structured output rejects a schema with an optional
 *  property; every provider accepts the strict form): descriptions kept; no `$schema` key, which some on-device models
 *  reject. A null sent back for an optional field is read as absent (`readReply`). */
export function jsonSchemaOf(schema: z.ZodType): JsonSchema {
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema, { target: 'draft-7' }) as JsonSchema;
  return strict(json);
}

/** One field: as given when it fits; a list keeps its items that fit; a nested object is read the same way; anything else
 *  takes its empty value (`''`, `[]`), or stays out when optional (null included). */
function readField(field: z.ZodType, value: unknown): unknown {
  // The strict schema sends an optional field as required-or-null: null means it was left out.
  if (value === null && field instanceof z.ZodOptional) return undefined;
  const exact = field.safeParse(value);
  if (exact.success) return exact.data;
  const optional = field instanceof z.ZodOptional;
  const inner = optional ? (field.unwrap() as z.ZodType) : field;
  if (inner instanceof z.ZodObject) return readObject(inner, value);
  if (inner instanceof z.ZodArray) {
    if (!Array.isArray(value)) return optional ? undefined : [];
    const element = inner.element as z.ZodType;
    return value.flatMap((item) => {
      const read = element instanceof z.ZodObject ? element.safeParse(readObject(element, item)) : element.safeParse(item);
      return read.success ? [read.data] : [];
    });
  }
  if (optional) return undefined;
  return inner instanceof z.ZodString ? '' : undefined;
}

function readObject(schema: z.ZodObject, raw: unknown): Record<string, unknown> {
  const record = isRecord(raw) ? raw : {};
  const read = Object.entries(schema.shape).map(([key, field]) => [key, readField(field as z.ZodType, record[key])] as const);
  return Object.fromEntries(read.filter(([, value]) => value !== undefined));
}

/** `raw` read against `schema`; never throws. Strings and lists are always present (empty when missing). */
export function readReply<S extends z.ZodObject>(schema: S, raw: unknown): z.infer<S> {
  return readObject(schema, raw) as z.infer<S>;
}
