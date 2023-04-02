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

type Memory = Map<unknown, unknown>;

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
  arrayBufferSerialized: ArrayBufferSerialization;
};

type MapSerialization = {
  type: 'Map';
  mapData: { key: Serialization, value: Serialization }[];
};

type SetSerialization = {
  type: 'Set';
  setData: Serialization[];
};

type ErrorSerialization = {
  type: 'Error';
  name: string;
  message?: string;
};

type ArraySerialization = {
  type: 'Array';
  length: number;
  properties: { key: string, value: Serialization }[];
};

type ObjectSerialization = {
  type: 'Object';
  properties: { key: string, value: Serialization }[];
};

type Serialization = PrimitiveSerialization | BooleanSerialization | NumberSerialization | StringSerialization | DateSerialization | RegExpSerialization | ArrayBufferSerialization | TypedArraySerialization | MapSerialization | SetSerialization | ErrorSerialization | ArraySerialization | ObjectSerialization;

/**
 * This does not allow for circular references.
 * However, this cannot detect Proxy exotic objects or platform objects.
 */
const structuredSerializeInternal = (value: unknown, memory?: Memory): Serialization => {
  if (!memory) {
    memory = new Map();
  }
  if (memory.has(value)) {
    throw new TypeError('Cannot serialize a circular reference');
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
  let serialized: Serialization;
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
    const bufferSerialized = structuredSerializeInternal(buffer, memory) as ArrayBufferSerialization;
    if (bufferSerialized.type != 'ArrayBuffer') {
      throw new TypeError('ArrayBuffer serialization failed');
    }
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
        (serialized as { setData: unknown[] }).setData.push(serializedVal);
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
  return serialized;
};

export const structuredSerialize = (value: unknown): string => {
  const serialized = structuredSerializeInternal(value);
  return JSON.stringify(serialized);
};

const structuredDeserializeInternal = (serialized: Serialization): unknown => {
  let deep = false;
  let value: unknown;
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
  } else if (serialized.type == 'Boolean') {
    value = new Boolean(serialized.booleanData == 'true');
  } else if (serialized.type == 'Number') {
    value = new Number(Number(serialized.numberData));
  } else if (serialized.type == 'String') {
    value = new String(serialized.stringData);
  } else if (serialized.type == 'Date') {
    value = new Date(serialized.dateData);
  } else if (serialized.type == 'RegExp') {
    value = new RegExp(serialized.originalSource, serialized.originalFlags);
  } else if (serialized.type == 'ArrayBuffer') {
    const size = serialized.arrayBufferByteLength;
    const data = new Uint8Array(size);
    const dataParts = serialized.arrayBufferData.split(',');
    for (let i = 0; i < dataParts.length; i++) {
      data[i] = Number(dataParts[i]);
    }
    value = data.buffer;
  } else if (serialized.type == 'ArrayBufferView') {
    const typedArrayName = serialized.typedArrayName;
    const typedArrayByteOffset = serialized.typedArrayByteOffset;
    const typedArrayByteLength = serialized.typedArrayByteLength;
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
    const arrayBuffer = structuredDeserializeInternal(serialized.arrayBufferSerialized) as ArrayBuffer;
    const typedArray = new typedArrayConstructor(arrayBuffer, typedArrayByteOffset, typedArrayByteLength);
    value = typedArray;
  } else if (serialized.type == 'Map') {
    value = new Map();
    deep = true;
  } else if (serialized.type == 'Set') {
    value = new Set();
    deep = true;
  } else if (serialized.type == 'Array') {
    value = new Array(serialized.length);
    deep = true;
  } else if (serialized.type == 'Object') {
    value = {};
    deep = true;
  } else if (serialized.type == 'Error') {
    let errorConstructor = Error;
    switch (serialized.name) {
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
    const error = new errorConstructor(serialized.message);
    error.name = serialized.name;
    value = error;
  }

  if (deep) {
    if (serialized.type == 'Map') {
      for (const { key: serializedKey, value: serializedValue } of serialized.mapData) {
        const deserializedKey = structuredDeserializeInternal(serializedKey);
        const deserializedValue = structuredDeserializeInternal(serializedValue);
        (value as Map<unknown, unknown>).set(deserializedKey, deserializedValue);
      }
    } else if (serialized.type == 'Set') {
      for (const serializedValue of serialized.setData) {
        const deserializedValue = structuredDeserializeInternal(serializedValue);
        (value as Set<unknown>).add(deserializedValue);
      }
    } else if (serialized.type == 'Array' || serialized.type == 'Object') {
      for (const { key, value: serializedValue } of serialized.properties) {
        const deserializedValue = structuredDeserializeInternal(serializedValue);
        Reflect.set((value as object), key, deserializedValue);
      }
    }
  }

  return value;
};

export const structuredDeserialize = (serializedJson: string): unknown => {
  const serialized = JSON.parse(serializedJson) as Serialization;
  return structuredDeserializeInternal(serialized);
};
