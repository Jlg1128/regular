var shared = require('@vue/shared');

const ITERATE_KEY = Symbol('iterate' );

const reactiveMap = new WeakMap();
const shallowReactiveMap = new WeakMap();
const readonlyMap = new WeakMap();
const shallowReadonlyMap = new WeakMap();


function isReactive(value) {
  if (isReadonly(value)) {
      return isReactive(value["__v_raw" /* ReactiveFlags.RAW */]);
  }
  return !!(value && value["__v_isReactive" /* ReactiveFlags.IS_REACTIVE */]);
}
function isReadonly(value) {
  return !!(value && value["__v_isReadonly" /* ReactiveFlags.IS_READONLY */]);
}

function isShallow(value) {
    return !!(value && value["__v_isShallow" /* ReactiveFlags.IS_SHALLOW */]);
}

function targetTypeMap(rawType) {
  switch (rawType) {
      case 'Object':
      case 'Array':
          return 1 /* TargetType.COMMON */;
      case 'Map':
      case 'Set':
      case 'WeakMap':
      case 'WeakSet':
          return 2 /* TargetType.COLLECTION */;
      default:
          return 0 /* TargetType.INVALID */;
  }
}
function getTargetType(value) {
  return value["__v_skip" /* ReactiveFlags.SKIP */] || !Object.isExtensible(value)
      ? 0 /* TargetType.INVALID */
      : targetTypeMap(shared.toRawType(value));
}

function createReactiveObject(target, isReadonly, baseHandlers, collectionHandlers, proxyMap) {
  if (!shared.isObject(target)) {
      {
          console.warn(`value cannot be made reactive: ${String(target)}`);
      }
      return target;
  }
  // target is already a Proxy, return it.
  // exception: calling readonly() on a reactive object
  if (target["__v_raw" /* ReactiveFlags.RAW */] &&
      !(isReadonly && target["__v_isReactive" /* ReactiveFlags.IS_REACTIVE */])) {
      return target;
  }
  // target already has corresponding Proxy
  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
      return existingProxy;
  }
  // only specific value types can be observed.
  const targetType = getTargetType(target);
  if (targetType === 0 /* TargetType.INVALID */) {
      return target;
  }
  const proxy = new Proxy(target, targetType === 2 /* TargetType.COLLECTION */ ? collectionHandlers : baseHandlers);
  proxyMap.set(target, proxy);
  return proxy;
}
function toRaw(observed) {
  const raw = observed && observed["__v_raw" /* ReactiveFlags.RAW */];
  return raw ? toRaw(raw) : observed;
}
const toReactive = (value) => shared.isObject(value) ? reactive(value) : value;
const toReadonly = (value) => shared.isObject(value) ? readonly(value) : value;
const toShallow = (value) => value;
const getProto = (v) => Reflect.getPrototypeOf(v);
function get(target, key, isReadonly = false, isShallow = false) {
  // #1772: readonly(reactive(Map)) should return readonly + reactive version
  // of the value
  target = target["__v_raw" /* ReactiveFlags.RAW */];
  const rawTarget = toRaw(target);
  const rawKey = toRaw(key);
  if (!isReadonly) {
      if (key !== rawKey) {
        // ❌
          // track(rawTarget, "get" /* TrackOpTypes.GET */, key);
      }
      // ❌
      // track(rawTarget, "get" /* TrackOpTypes.GET */, rawKey);
  }
  const { has } = getProto(rawTarget);
  const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive;
  if (has.call(rawTarget, key)) {
      return wrap(target.get(key));
  }
  else if (has.call(rawTarget, rawKey)) {
      return wrap(target.get(rawKey));
  }
  else if (target !== rawTarget) {
      // #3602 readonly(reactive(Map))
      // ensure that the nested reactive `Map` can do tracking for itself
      target.get(key);
  }
}
function has(key, isReadonly = false) {
  const target = this["__v_raw" /* ReactiveFlags.RAW */];
  const rawTarget = toRaw(target);
  const rawKey = toRaw(key);
  if (!isReadonly) {
      if (key !== rawKey) {
          // track(rawTarget, "has" /* TrackOpTypes.HAS */, key);
      }
      // track(rawTarget, "has" /* TrackOpTypes.HAS */, rawKey);
  }
  return key === rawKey
      ? target.has(key)
      : target.has(key) || target.has(rawKey);
}
function size(target, isReadonly = false) {
  target = target["__v_raw" /* ReactiveFlags.RAW */];
  // !isReadonly && track(toRaw(target), "iterate" /* TrackOpTypes.ITERATE */, ITERATE_KEY);
  return Reflect.get(target, 'size', target);
}
function add(value) {
  value = toRaw(value);
  const target = toRaw(this);
  const proto = getProto(target);
  const hadKey = proto.has.call(target, value);
  if (!hadKey) {
      target.add(value);
      // trigger(target, "add" /* TriggerOpTypes.ADD */, value, value);
  }
  return this;
}
function set(key, value) {
  value = toRaw(value);
  const target = toRaw(this);
  const { has, get } = getProto(target);
  let hadKey = has.call(target, key);
  if (!hadKey) {
      key = toRaw(key);
      hadKey = has.call(target, key);
  }
  else {
      checkIdentityKeys(target, has, key);
  }
  const oldValue = get.call(target, key);
  target.set(key, value);
  // if (!hadKey) {
  //     trigger(target, "add" /* TriggerOpTypes.ADD */, key, value);
  // }
  // else if (shared.hasChanged(value, oldValue)) {
  //     trigger(target, "set" /* TriggerOpTypes.SET */, key, value, oldValue);
  // }
  return this;
}
function deleteEntry(key) {
  const target = toRaw(this);
  const { has, get } = getProto(target);
  let hadKey = has.call(target, key);
  if (!hadKey) {
      key = toRaw(key);
      hadKey = has.call(target, key);
  }
  else {
      checkIdentityKeys(target, has, key);
  }
  const oldValue = get ? get.call(target, key) : undefined;
  // forward the operation before queueing reactions
  const result = target.delete(key);
  // if (hadKey) {
  //     trigger(target, "delete" /* TriggerOpTypes.DELETE */, key, undefined, oldValue);
  // }
  return result;
}
function clear() {
  const target = toRaw(this);
  const hadItems = target.size !== 0;
  const oldTarget = shared.isMap(target)
          ? new Map(target)
          : new Set(target)
      ;
  // forward the operation before queueing reactions
  const result = target.clear();
  // if (hadItems) {
  //     trigger(target, "clear" /* TriggerOpTypes.CLEAR */, undefined, undefined, oldTarget);
  // }
  return result;
}
function createForEach(isReadonly, isShallow) {
  return function forEach(callback, thisArg) {
      const observed = this;
      const target = observed["__v_raw" /* ReactiveFlags.RAW */];
      const rawTarget = toRaw(target);
      const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive;
      // !isReadonly && track(rawTarget, "iterate" /* TrackOpTypes.ITERATE */, ITERATE_KEY);
      return target.forEach((value, key) => {
          // important: make sure the callback is
          // 1. invoked with the reactive map as `this` and 3rd arg
          // 2. the value received should be a corresponding reactive/readonly.
          return callback.call(thisArg, wrap(value), wrap(key), observed);
      });
  };
}
function createIterableMethod(method, isReadonly, isShallow) {
  return function (...args) {
      const target = this["__v_raw" /* ReactiveFlags.RAW */];
      const rawTarget = toRaw(target);
      const targetIsMap = shared.isMap(rawTarget);
      const isPair = method === 'entries' || (method === Symbol.iterator && targetIsMap);
      const isKeyOnly = method === 'keys' && targetIsMap;
      const innerIterator = target[method](...args);
      const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive;
      // !isReadonly &&
      //     track(rawTarget, "iterate" /* TrackOpTypes.ITERATE */, isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);
      // return a wrapped iterator which returns observed versions of the
      // values emitted from the real iterator
      return {
          // iterator protocol
          next() {
              const { value, done } = innerIterator.next();
              return done
                  ? { value, done }
                  : {
                      value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
                      done
                  };
          },
          // iterable protocol
          [Symbol.iterator]() {
              return this;
          }
      };
  };
}
function createReadonlyMethod(type) {
  return function (...args) {
      {
          const key = args[0] ? `on key "${args[0]}" ` : ``;
          console.warn(`${shared.capitalize(type)} operation ${key}failed: target is readonly.`, toRaw(this));
      }
      return type === "delete" /* TriggerOpTypes.DELETE */ ? false : this;
  };
}
function createInstrumentations() {
  const mutableInstrumentations = {
      get(key) {
          return get(this, key);
      },
      get size() {
          return size(this);
      },
      has,
      add,
      set,
      delete: deleteEntry,
      clear,
      forEach: createForEach(false, false)
  };
  const shallowInstrumentations = {
      get(key) {
          return get(this, key, false, true);
      },
      get size() {
          return size(this);
      },
      has,
      add,
      set,
      delete: deleteEntry,
      clear,
      forEach: createForEach(false, true)
  };
  const readonlyInstrumentations = {
      get(key) {
          return get(this, key, true);
      },
      get size() {
          return size(this, true);
      },
      has(key) {
          return has.call(this, key, true);
      },
      add: createReadonlyMethod("add" /* TriggerOpTypes.ADD */),
      set: createReadonlyMethod("set" /* TriggerOpTypes.SET */),
      delete: createReadonlyMethod("delete" /* TriggerOpTypes.DELETE */),
      clear: createReadonlyMethod("clear" /* TriggerOpTypes.CLEAR */),
      forEach: createForEach(true, false)
  };
  const shallowReadonlyInstrumentations = {
      get(key) {
          return get(this, key, true, true);
      },
      get size() {
          return size(this, true);
      },
      has(key) {
          return has.call(this, key, true);
      },
      add: createReadonlyMethod("add" /* TriggerOpTypes.ADD */),
      set: createReadonlyMethod("set" /* TriggerOpTypes.SET */),
      delete: createReadonlyMethod("delete" /* TriggerOpTypes.DELETE */),
      clear: createReadonlyMethod("clear" /* TriggerOpTypes.CLEAR */),
      forEach: createForEach(true, true)
  };
  const iteratorMethods = ['keys', 'values', 'entries', Symbol.iterator];
  iteratorMethods.forEach(method => {
      mutableInstrumentations[method] = createIterableMethod(method, false, false);
      readonlyInstrumentations[method] = createIterableMethod(method, true, false);
      shallowInstrumentations[method] = createIterableMethod(method, false, true);
      shallowReadonlyInstrumentations[method] = createIterableMethod(method, true, true);
  });
  return [
      mutableInstrumentations,
      readonlyInstrumentations,
      shallowInstrumentations,
      shallowReadonlyInstrumentations
  ];
}
const [mutableInstrumentations, readonlyInstrumentations, shallowInstrumentations, shallowReadonlyInstrumentations] = /* #__PURE__*/ createInstrumentations();
function createInstrumentationGetter(isReadonly, shallow) {
  const instrumentations = shallow
      ? isReadonly
          ? shallowReadonlyInstrumentations
          : shallowInstrumentations
      : isReadonly
          ? readonlyInstrumentations
          : mutableInstrumentations;
  return (target, key, receiver) => {
      if (key === "__v_isReactive" /* ReactiveFlags.IS_REACTIVE */) {
          return !isReadonly;
      }
      else if (key === "__v_isReadonly" /* ReactiveFlags.IS_READONLY */) {
          return isReadonly;
      }
      else if (key === "__v_raw" /* ReactiveFlags.RAW */) {
          return target;
      }
      return Reflect.get(shared.hasOwn(instrumentations, key) && key in target
          ? instrumentations
          : target, key, receiver);
  };
}
const readonlyGet = /*#__PURE__*/ createGetter(true);

const mutableCollectionHandlers = {
  get: /*#__PURE__*/ createInstrumentationGetter(false, false)
};
const readonlyCollectionHandlers = {
  get: /*#__PURE__*/ createInstrumentationGetter(true, false)
};
const readonlyHandlers = {
  get: readonlyGet,
  set(target, key) {
      {
          warn(`Set operation on key "${String(key)}" failed: target is readonly.`, target);
      }
      return true;
  },
  deleteProperty(target, key) {
      {
          warn(`Delete operation on key "${String(key)}" failed: target is readonly.`, target);
      }
      return true;
  }
};

const get$1 = /*#__PURE__*/ createGetter();
const set$1 = /*#__PURE__*/ createSetter();

const mutableHandlers = {
  get: get$1,
  set: set$1,
  deleteProperty,
  has: has$1,
  ownKeys
};
function isRef(r) {
  return !!(r && r.__v_isRef === true);
}
const arrayInstrumentations = /*#__PURE__*/ createArrayInstrumentations();
const isNonTrackableKeys = /*#__PURE__*/ shared.makeMap(`__proto__,__v_isRef,__isVue`);
const builtInSymbols = new Set(
/*#__PURE__*/
Object.getOwnPropertyNames(Symbol)
    // ios10.x Object.getOwnPropertyNames(Symbol) can enumerate 'arguments' and 'caller'
    // but accessing them on Symbol leads to TypeError because Symbol is a strict mode
    // function
    .filter(key => key !== 'arguments' && key !== 'caller')
    .map(key => Symbol[key])
    .filter(shared.isSymbol));
function createArrayInstrumentations() {
    const instrumentations = {};
    ['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
        instrumentations[key] = function (...args) {
            const arr = toRaw(this);
            // for (let i = 0, l = this.length; i < l; i++) {
            //     track(arr, "get" /* TrackOpTypes.GET */, i + '');
            // }
            // we run the method using the original args first (which may be reactive)
            const res = arr[key](...args);
            if (res === -1 || res === false) {
                // if that didn't work, run it again using raw values.
                return arr[key](...args.map(toRaw));
            }
            else {
                return res;
            }
        };
    });
    ['push', 'pop', 'shift', 'unshift', 'splice'].forEach(key => {
        instrumentations[key] = function (...args) {
            // pauseTracking();
            const res = toRaw(this)[key].apply(this, args);
            // resetTracking();
            return res;
        };
    });
    return instrumentations;
}
function hasOwnProperty(key) {
    const obj = toRaw(this);
    // track(obj, "has" /* TrackOpTypes.HAS */, key);
    return obj.hasOwnProperty(key);
}


function createGetter(isReadonly = false, shallow = false) {
  return function get(target, key, receiver) {
      if (key === "__v_isReactive" /* ReactiveFlags.IS_REACTIVE */) {
          return !isReadonly;
      }
      else if (key === "__v_isReadonly" /* ReactiveFlags.IS_READONLY */) {
          return isReadonly;
      }
      else if (key === "__v_isShallow" /* ReactiveFlags.IS_SHALLOW */) {
          return shallow;
      }
      else if (key === "__v_raw" /* ReactiveFlags.RAW */ &&
          receiver ===
              (isReadonly
                  ? shallow
                      ? shallowReadonlyMap
                      : readonlyMap
                  : shallow
                      ? shallowReactiveMap
                      : reactiveMap).get(target)) {
          return target;
      }
      const targetIsArray = shared.isArray(target);
      if (!isReadonly) {
          if (targetIsArray && shared.hasOwn(arrayInstrumentations, key)) {
              return Reflect.get(arrayInstrumentations, key, receiver);
          }
          if (key === 'hasOwnProperty') {
              return hasOwnProperty;
          }
      }
      const res = Reflect.get(target, key, receiver);
      if (shared.isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
          return res;
      }
      // if (!isReadonly) {
      //     track(target, "get" /* TrackOpTypes.GET */, key);
      // }
      if (shallow) {
          return res;
      }
      if (isRef(res)) {
          // ref unwrapping - skip unwrap for Array + integer key.
          return targetIsArray && shared.isIntegerKey(key) ? res : res.value;
      }
      if (shared.isObject(res)) {
          // Convert returned value into a proxy as well. we do the isObject check
          // here to avoid invalid value warning. Also need to lazy access readonly
          // and reactive here to avoid circular dependency.
          // ❌
          // return isReadonly ? readonly(res) : reactive(res);
          return reactive(res);
      }
      return res;
  };
}
function createSetter(shallow = false) {
  return function set(target, key, value, receiver) {
      let oldValue = target[key];
      if (isReadonly(oldValue) && isRef(oldValue) && !isRef(value)) {
          return false;
      }
      if (!shallow) {
          if (!isShallow(value) && !isReadonly(value)) {
              oldValue = toRaw(oldValue);
              value = toRaw(value);
          }
          if (!shared.isArray(target) && isRef(oldValue) && !isRef(value)) {
              oldValue.value = value;
              return true;
          }
      }
      const hadKey = shared.isArray(target) && shared.isIntegerKey(key)
          ? Number(key) < target.length
          : shared.hasOwn(target, key);
      const result = Reflect.set(target, key, value, receiver);
      // don't trigger if target is something up in the prototype chain of original
      // ❌
      // if (target === toRaw(receiver)) {
      //     if (!hadKey) {
      //         trigger(target, "add" /* TriggerOpTypes.ADD */, key, value);
      //     }
      //     else if (shared.hasChanged(value, oldValue)) {
      //         trigger(target, "set" /* TriggerOpTypes.SET */, key, value, oldValue);
      //     }
      // }
      return result;
  };
}
function deleteProperty(target, key) {
  const hadKey = shared.hasOwn(target, key);
  const oldValue = target[key];
  const result = Reflect.deleteProperty(target, key);
  // ❌
  // if (result && hadKey) {
      // trigger(target, "delete" /* TriggerOpTypes.DELETE */, key, undefined, oldValue);
  // }
  return result;
}
function has$1(target, key) {
  const result = Reflect.has(target, key);
  // ❌
  // if (!shared.isSymbol(key) || !builtInSymbols.has(key)) {
  //     track(target, "has" /* TrackOpTypes.HAS */, key);
  // }
  return result;
}
function ownKeys(target) {
  // track(target, "iterate" /* TrackOpTypes.ITERATE */, shared.isArray(target) ? 'length' : ITERATE_KEY);
  return Reflect.ownKeys(target);
}

function readonly(target) {
  return createReactiveObject(target, true, readonlyHandlers, readonlyCollectionHandlers, readonlyMap);
}

function reactive(target) {
  // if trying to observe a readonly proxy, return the readonly version.
  if (isReadonly(target)) {
      return target;
  }
  return createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers, reactiveMap);
}


module.exports = {
  reactive,
  readonly,
}