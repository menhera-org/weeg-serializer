/* -*- indent-tabs-mode: nil; tab-width: 2; -*- */
/* vim: set ts=2 sw=2 et ai : */
/**
  Copyright (C) 2023 WebExtensions Experts Group

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
  @license
*/

type Memory = Map<unknown, ComplexSerialization>;

type PrimitiveType = 'undefined' | 'null' | 'boolean' | 'number' | 'string' | 'bigint';
type PrimitiveSerialization = {
  type: 'primitive';
  primitiveType: PrimitiveType;
  value: string;
};

type BooleanSerialization = {
  type: 'Boolean';
  booleanData: string;
};

type NumberSerialization = {
  type: 'Number';
  numberData: string;
};

type StringSerialization = {
  type: 'String';
  stringData: string;
};

type DateSerialization = {
  type: 'Date';
  dateData: string;
};

type RegExpSerialization = {
  type: 'RegExp';
  originalSource: string;
  originalFlags: string;
};

type ArrayBufferSerialization = {
  type: 'ArrayBuffer';
  arrayBufferByteLength: number;
  arrayBufferData: string;
};

type TypedArraySerialization = {
  type: 'ArrayBufferView';
  typedArrayName: string;
  typedArrayByteOffset: number;
  typedArrayByteLength: number;
  arrayBufferSerialized: ChildSerialization;
};

type MapSerialization = {
  type: 'Map';
  mapData: { key: ChildSerialization, value: ChildSerialization }[];
};

type SetSerialization = {
  type: 'Set';
  setData: ChildSerialization[];
};

type ErrorSerialization = {
  type: 'Error';
  name: string;
  message?: string;
};

type ArraySerialization = {
  type: 'Array';
  length: number;
  properties: { key: string, value: ChildSerialization }[];
};

type ObjectSerialization = {
  type: 'Object';
  properties: { key: string, value: ChildSerialization }[];
};

type ReferenceSerialization = {
  type: 'Reference';
  referenceId: number;
};

type ChildSerialization = PrimitiveSerialization | ReferenceSerialization;

type ComplexSerialization = BooleanSerialization | NumberSerialization | StringSerialization | DateSerialization | RegExpSerialization | ArrayBufferSerialization | TypedArraySerialization | MapSerialization | SetSerialization | ErrorSerialization | ArraySerialization | ObjectSerialization;

type TopLevelSerialization = {
  type: 'TopLevel';
  objects: ComplexSerialization[];
  topLevelValue: ChildSerialization;
} | PrimitiveSerialization;

/**
 * This can process circular references.
 * However, this cannot detect Proxy exotic objects or platform objects.
 */
const structuredSerializeInternal = (value: unknown, memory?: Memory): ChildSerialization => {
  if (!memory) {
    memory = new Map();
  }
  if (memory.has(value)) {
    const index = [... memory.keys()].indexOf(value);
    return {
      type: 'Reference',
      referenceId: index,
    };
  }
  let deep = false;
  if (undefined === value) {
    return { type: 'primitive', primitiveType: 'undefined', value: 'undefined' };
  } else if (null === value) {
    return { type: 'primitive', primitiveType: 'null', value: 'null' };
  } else if ('boolean' == typeof value) {
    return { type: 'primitive', primitiveType: 'boolean', value: value.toString() };
  } else if ('number' == typeof value) {
    return { type: 'primitive', primitiveType: 'number', value: value.toString() };
  } else if ('bigint' == typeof value) {
    return { type: 'primitive', primitiveType: 'bigint', value: value.toString() };
  } else if ('string' == typeof value) {
    return { type: 'primitive', primitiveType: 'string', value: value };
  } else if ('symbol' == typeof value) {
    throw new TypeError('Cannot serialize a Symbol');
  }

  const TypedArray = Object.getPrototypeOf(Int8Array);
  let serialized: ComplexSerialization;
  if (value instanceof Boolean) {
    serialized = { type: 'Boolean', booleanData: value.valueOf().toString() };
  } else if (value instanceof Number) {
    serialized = { type: 'Number', numberData: value.valueOf().toString() };
  } else if (value instanceof String) {
    serialized = { type: 'String', stringData: value.valueOf() };
  } else if (value instanceof Date) {
    serialized = { type: 'Date', dateData: value.toISOString() };
  } else if (value instanceof RegExp) {
    serialized = { type: 'RegExp', originalSource: value.source, originalFlags: value.flags };
  } else if (value instanceof ArrayBuffer) {
    const size = value.byteLength;
    const data = new Uint8Array(value);
    serialized = { type: 'ArrayBuffer', arrayBufferByteLength: size, arrayBufferData: [... data].join(',') };
  } else if (value instanceof TypedArray || value instanceof DataView) {
    const arrayValue = value as { buffer: ArrayBuffer; byteOffset: number; byteLength: number; };
    const buffer = arrayValue.buffer;
    const bufferSerialized = structuredSerializeInternal(buffer, memory) as ChildSerialization;
    const typedArrayName = value.constructor.name;
    const typedArrayByteOffset = arrayValue.byteOffset;
    const typedArrayByteLength = arrayValue.byteLength;
    serialized = { type: 'ArrayBufferView', typedArrayName, typedArrayByteOffset, typedArrayByteLength, arrayBufferSerialized: bufferSerialized };
  } else if (value instanceof Map) {
    serialized = { type: 'Map', mapData: [] };
    deep = true;
  } else if (value instanceof Set) {
    serialized = { type: 'Set', setData: [] };
    deep = true;
  } else if (value instanceof Error) {
    let name = value.name;
    if (!["Error", "EvalError", "RangeError", "ReferenceError", "SyntaxError", "TypeError", "URIError"].includes(name)) {
      name = "Error";
    }
    const valueMessageDesc = Object.getOwnPropertyDescriptor(value, 'message');
    let message: string | undefined = undefined;
    if (valueMessageDesc && 'value' in valueMessageDesc) {
      message = String(valueMessageDesc.value);
    }
    serialized = { type: 'Error', name, message };
  } else if (Array.isArray(value)) {
    serialized = { type: 'Array', length: value.length, properties: [] };
    deep = true;
  } else if (value instanceof WeakMap || value instanceof WeakSet) {
    throw new TypeError('Cannot serialize a WeakMap or WeakSet');
  } else if (value instanceof Promise) {
    throw new TypeError('Cannot serialize a Promise');
  } else if (value instanceof WeakRef) {
    throw new TypeError('Cannot serialize a WeakRef');
  } else if (value instanceof FinalizationRegistry) {
    throw new TypeError('Cannot serialize a FinalizationRegistry');
  } else if ('function' == typeof value) {
    throw new TypeError('Cannot serialize a function');
  } else {
    serialized = { type: 'Object', properties: [] };
    deep = true;
  }
  memory.set(value, serialized);
  if (deep) {
    if (value instanceof Map) {
      for (const [key, val] of value) {
        const serializedKey = structuredSerializeInternal(key, memory);
        const serializedVal = structuredSerializeInternal(val, memory);
        (serialized as { mapData: unknown[] }).mapData.push({ key: serializedKey, value: serializedVal });
      }
    } else if (value instanceof Set) {
      for (const val of value) {
        const serializedVal = structuredSerializeInternal(val, memory);
        (serialized as { setData: ChildSerialization[] }).setData.push(serializedVal);
      }
    } else {
      const ownPropertyNames = Object.getOwnPropertyNames(value);
      for (const ownPropertyName of ownPropertyNames) {
        if (Object.hasOwnProperty.call(value, ownPropertyName)) {
          const inputValue = Reflect.get(value, ownPropertyName);
          const outputValue = structuredSerializeInternal(inputValue, memory);
          (serialized as { properties: unknown[] }).properties.push({ key: ownPropertyName, value: outputValue });
        }
      }
    }
  }
  return {
    type: 'Reference',
    referenceId: [... memory.keys()].indexOf(value),
  };
};

export const structuredSerialize = (value: unknown): string => {
  const memory = new Map<unknown, ComplexSerialization>();
  const serialized = structuredSerializeInternal(value, memory)
  if (serialized.type == 'primitive') {
    return JSON.stringify(serialized);
  }
  const topLevelSerialization: TopLevelSerialization = {
    type: 'TopLevel',
    objects: [... memory.values()],
    topLevelValue: serialized,
  };
  return JSON.stringify(topLevelSerialization);
};

const structuredDeserializeInternal = (serialized: ChildSerialization, objects: ComplexSerialization[], memory: Map<number, unknown>): unknown => {
  let deep = false;
  let value: unknown;
  if (serialized.type == 'Reference' && memory.has(serialized.referenceId)) {
    return memory.get(serialized.referenceId);
  }
  if (serialized.type == 'primitive') {
    switch (serialized.primitiveType) {
      case 'undefined':
        value = undefined;
        break;
      case 'null':
        value = null;
        break;
      case 'boolean':
        value = serialized.value == 'true';
        break;
      case 'number':
        value = Number(serialized.value);
        break;
      case 'bigint':
        value = BigInt(serialized.value);
        break;
      case 'string':
        value = serialized.value;
        break;
    }
    return value;
  }
  const complexSerialized = objects[serialized.referenceId] as ComplexSerialization;
  if (complexSerialized.type == 'Boolean') {
    value = new Boolean(complexSerialized.booleanData == 'true');
  } else if (complexSerialized.type == 'Number') {
    value = new Number(Number(complexSerialized.numberData));
  } else if (complexSerialized.type == 'String') {
    value = new String(complexSerialized.stringData);
  } else if (complexSerialized.type == 'Date') {
    value = new Date(complexSerialized.dateData);
  } else if (complexSerialized.type == 'RegExp') {
    value = new RegExp(complexSerialized.originalSource, complexSerialized.originalFlags);
  } else if (complexSerialized.type == 'ArrayBuffer') {
    const size = complexSerialized.arrayBufferByteLength;
    const data = new Uint8Array(size);
    const dataParts = complexSerialized.arrayBufferData.split(',');
    for (let i = 0; i < dataParts.length; i++) {
      data[i] = Number(dataParts[i]);
    }
    value = data.buffer;
  } else if (complexSerialized.type == 'ArrayBufferView') {
    const typedArrayName = complexSerialized.typedArrayName;
    const typedArrayByteOffset = complexSerialized.typedArrayByteOffset;
    const typedArrayByteLength = complexSerialized.typedArrayByteLength;
    let typedArrayConstructor;
    switch (typedArrayName) {
      case 'Int8Array':
        typedArrayConstructor = Int8Array;
        break;
      case 'Uint8Array':
        typedArrayConstructor = Uint8Array;
        break;
      case 'Uint8ClampedArray':
        typedArrayConstructor = Uint8ClampedArray;
        break;
      case 'Int16Array':
        typedArrayConstructor = Int16Array;
        break;
      case 'Uint16Array':
        typedArrayConstructor = Uint16Array;
        break;
      case 'Int32Array':
        typedArrayConstructor = Int32Array;
        break;
      case 'Uint32Array':
        typedArrayConstructor = Uint32Array;
        break;
      case 'Float32Array':
        typedArrayConstructor = Float32Array;
        break;
      case 'Float64Array':
        typedArrayConstructor = Float64Array;
        break;
      case 'BigInt64Array':
        typedArrayConstructor = BigInt64Array;
        break;
      case 'BigUint64Array':
        typedArrayConstructor = BigUint64Array;
        break;
      case 'DataView':
        typedArrayConstructor = DataView;
      default:
        throw new Error('Unknown typed array name');
    }
    const arrayBuffer = structuredDeserializeInternal(complexSerialized.arrayBufferSerialized, objects, memory) as ArrayBuffer;
    const typedArray = new typedArrayConstructor(arrayBuffer, typedArrayByteOffset, typedArrayByteLength);
    value = typedArray;
  } else if (complexSerialized.type == 'Map') {
    value = new Map();
    deep = true;
  } else if (complexSerialized.type == 'Set') {
    value = new Set();
    deep = true;
  } else if (complexSerialized.type == 'Array') {
    value = new Array(complexSerialized.length);
    deep = true;
  } else if (complexSerialized.type == 'Object') {
    value = {};
    deep = true;
  } else if (complexSerialized.type == 'Error') {
    let errorConstructor = Error;
    switch (complexSerialized.name) {
      case 'EvalError':
        errorConstructor = EvalError;
        break;
      case 'RangeError':
        errorConstructor = RangeError;
        break;
      case 'ReferenceError':
        errorConstructor = ReferenceError;
        break;
      case 'SyntaxError':
        errorConstructor = SyntaxError;
        break;
      case 'TypeError':
        errorConstructor = TypeError;
        break;
      case 'URIError':
        errorConstructor = URIError;
        break;
    }
    const error = new errorConstructor(complexSerialized.message);
    error.name = complexSerialized.name;
    value = error;
  }

  memory.set(serialized.referenceId, value);

  if (deep) {
    if (complexSerialized.type == 'Map') {
      for (const { key: serializedKey, value: serializedValue } of complexSerialized.mapData) {
        const deserializedKey = structuredDeserializeInternal(serializedKey, objects, memory);
        const deserializedValue = structuredDeserializeInternal(serializedValue, objects, memory);
        (value as Map<unknown, unknown>).set(deserializedKey, deserializedValue);
      }
    } else if (complexSerialized.type == 'Set') {
      for (const serializedValue of complexSerialized.setData) {
        const deserializedValue = structuredDeserializeInternal(serializedValue, objects, memory);
        (value as Set<unknown>).add(deserializedValue);
      }
    } else if (complexSerialized.type == 'Array' || complexSerialized.type == 'Object') {
      for (const { key, value: serializedValue } of complexSerialized.properties) {
        const deserializedValue = structuredDeserializeInternal(serializedValue, objects, memory);
        Reflect.set((value as object), key, deserializedValue);
      }
    }
  }

  return value;
};

/**
 * This should be able to restore circular references.
 */
export const structuredDeserialize = (serializedJson: string): unknown => {
  const serialized = JSON.parse(serializedJson) as TopLevelSerialization;
  if (serialized.type == 'primitive') {
    return structuredDeserializeInternal(serialized, [], new Map());
  }
  const objects = serialized.objects;
  return structuredDeserializeInternal(serialized.topLevelValue, objects, new Map());
};
