/** A model's structured output, defined once as a zod object: the JSON schema the model is given comes from it, and its reply
 *  is read against it leniently — whatever fits is kept, so one malformed field never costs the rest. */

import { z } from 'zod';

type JsonSchema = Record<string, unknown>;

/** The JSON schema a model is given (descriptions kept; no `$schema` key, which some on-device models reject). */
export function jsonSchemaOf(schema: z.ZodType): JsonSchema {
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema, { target: 'draft-7' }) as JsonSchema;
  return json;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** One field: as given when it fits; a list keeps its items that fit; a nested object is read the same way; anything else
 *  takes its empty value (`''`, `[]`), or stays out when optional. */
function readField(field: z.ZodType, value: unknown): unknown {
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
