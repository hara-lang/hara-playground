import { readAll } from "./reader.js";
import { Environment, HaraRuntimeError, asName, formatValue, isNode, isTruthy, keywordKey } from "./evaluator-core.js";
import { createBuiltins } from "./evaluator-builtins.js";

export class HaraRuntime {
  constructor({ onStdout = () => {}, onEffect = () => {} } = {}) {
    this.onStdout = onStdout;
    this.onEffect = onEffect;
    this.currentNamespace = "user";
    this.namespaces = new Map();
    this.builtins = createBuiltins(this);
    this.ensureNamespace("user");
  }

  reset() {
    this.currentNamespace = "user";
    this.namespaces.clear();
    this.ensureNamespace("user");
  }

  ensureNamespace(name) {
    if (!this.namespaces.has(name)) this.namespaces.set(name, new Environment());
    return this.namespaces.get(name);
  }

  setNamespace(name) {
    this.currentNamespace = name || "user";
    this.ensureNamespace(this.currentNamespace);
    return this.currentNamespace;
  }

  writeStdout(text) {
    this.onStdout(text);
    return null;
  }

  emitEffect(effect) {
    this.onEffect(effect);
    return effect;
  }

  resolveSymbol(name, env) {
    if (env?.has(name)) return env.get(name);
    if (name.includes("/")) {
      const [namespace, local] = name.split(/\/(.+)/);
      const namespaceEnv = this.namespaces.get(namespace);
      if (namespaceEnv?.has(local)) return namespaceEnv.get(local);
    }
    const current = this.ensureNamespace(this.currentNamespace);
    if (current.has(name)) return current.get(name);
    if (this.builtins.has(name)) return this.builtins.get(name);
    throw new HaraRuntimeError(`Unable to resolve symbol '${name}'`, { symbol: name, namespace: this.currentNamespace });
  }

  define(name, value) {
    this.ensureNamespace(this.currentNamespace).set(name, value);
    return value;
  }

  async evaluateSource(source, namespace = this.currentNamespace) {
    this.currentNamespace = namespace || "user";
    this.ensureNamespace(this.currentNamespace);
    let result = null;
    for (const form of readAll(source)) result = await this.evaluate(form, null);
    return result;
  }

  async evaluate(form, env) {
    if (isNode(form, "symbol")) return this.resolveSymbol(form.name, env);
    if (isNode(form, "keyword")) return `:${form.name}`;
    if (isNode(form, "vector")) {
      const output = [];
      for (const item of form.items) output.push(await this.evaluate(item, env));
      return output;
    }
    if (isNode(form, "map")) {
      const output = {};
      for (const [keyForm, valueForm] of form.entries) {
        const key = await this.evaluate(keyForm, env);
        output[keywordKey(key)] = await this.evaluate(valueForm, env);
      }
      return output;
    }
    if (!isNode(form, "list")) return form;
    if (form.items.length === 0) return [];

    const [head, ...args] = form.items;
    if (isNode(head, "symbol")) {
      switch (head.name) {
        case "quote": return this.quote(args[0]);
        case "do": return this.evaluateDo(args, env);
        case "if": return this.evaluateIf(args, env);
        case "when": return this.evaluateWhen(args, env);
        case "let": return this.evaluateLet(args, env);
        case "def": return this.evaluateDef(args, env);
        case "defn": return this.evaluateDefn(args, env);
        case "fn": return this.evaluateFn(args, env);
        case "ns": return this.evaluateNs(args);
        case "and": return this.evaluateAnd(args, env);
        case "or": return this.evaluateOr(args, env);
        default: break;
      }
    }

    const callable = await this.evaluate(head, env);
    const values = [];
    for (const arg of args) values.push(await this.evaluate(arg, env));
    return this.applyCallable(callable, values);
  }

  quote(form) {
    if (isNode(form, "symbol")) return form.name;
    if (isNode(form, "keyword")) return `:${form.name}`;
    if (isNode(form, "list") || isNode(form, "vector")) return form.items.map((item) => this.quote(item));
    if (isNode(form, "map")) return Object.fromEntries(form.entries.map(([key, value]) => [keywordKey(this.quote(key)), this.quote(value)]));
    return form;
  }

  async evaluateDo(forms, env) {
    let result = null;
    for (const form of forms) result = await this.evaluate(form, env);
    return result;
  }

  async evaluateIf(args, env) {
    if (args.length < 2 || args.length > 3) throw new HaraRuntimeError("if expects two or three forms");
    return isTruthy(await this.evaluate(args[0], env))
      ? this.evaluate(args[1], env)
      : args.length === 3 ? this.evaluate(args[2], env) : null;
  }

  async evaluateWhen(args, env) {
    if (args.length < 1) throw new HaraRuntimeError("when expects a condition");
    return isTruthy(await this.evaluate(args[0], env)) ? this.evaluateDo(args.slice(1), env) : null;
  }

  async evaluateLet(args, env) {
    if (args.length < 2 || !isNode(args[0], "vector")) throw new HaraRuntimeError("let expects a binding vector and body");
    const bindings = args[0].items;
    if (bindings.length % 2 !== 0) throw new HaraRuntimeError("let requires an even number of binding forms");
    const local = new Environment(env);
    for (let index = 0; index < bindings.length; index += 2) {
      local.set(asName(bindings[index], "binding"), await this.evaluate(bindings[index + 1], local));
    }
    return this.evaluateDo(args.slice(1), local);
  }

  async evaluateDef(args, env) {
    if (args.length !== 2) throw new HaraRuntimeError("def expects a name and value");
    const name = asName(args[0], "definition");
    const value = await this.evaluate(args[1], env);
    this.define(name, value);
    return { type: "var", name: `${this.currentNamespace}/${name}` };
  }

  evaluateDefn(args, env) {
    if (args.length < 3) throw new HaraRuntimeError("defn expects a name, parameter vector and body");
    const name = asName(args[0], "function");
    const closure = this.createClosure(args[1], args.slice(2), env, name);
    this.define(name, closure);
    return { type: "var", name: `${this.currentNamespace}/${name}` };
  }

  evaluateFn(args, env) {
    if (args.length < 2) throw new HaraRuntimeError("fn expects a parameter vector and body");
    return this.createClosure(args[0], args.slice(1), env, null);
  }

  createClosure(paramsForm, body, env, name) {
    if (!isNode(paramsForm, "vector")) throw new HaraRuntimeError("Function parameters must be a vector");
    const names = paramsForm.items.map((item) => asName(item, "parameter"));
    const ampersand = names.indexOf("&");
    if (ampersand >= 0 && ampersand !== names.length - 2) throw new HaraRuntimeError("Variadic marker '&' must precede the final parameter");
    return {
      type: "closure",
      name,
      params: ampersand >= 0 ? names.slice(0, ampersand) : names,
      rest: ampersand >= 0 ? names[names.length - 1] : null,
      body,
      env,
      namespace: this.currentNamespace
    };
  }

  evaluateNs(args) {
    if (args.length < 1) throw new HaraRuntimeError("ns expects a namespace name");
    const name = asName(args[0], "namespace");
    this.currentNamespace = name;
    this.ensureNamespace(name);
    return name;
  }

  async evaluateAnd(args, env) {
    let result = true;
    for (const form of args) {
      result = await this.evaluate(form, env);
      if (!isTruthy(result)) return result;
    }
    return result;
  }

  async evaluateOr(args, env) {
    for (const form of args) {
      const result = await this.evaluate(form, env);
      if (isTruthy(result)) return result;
    }
    return null;
  }

  async applyCallable(callable, args) {
    if (typeof callable === "function") return callable(...args);
    if (!callable || callable.type !== "closure") throw new HaraRuntimeError(`${formatValue(callable)} is not callable`);
    if (!callable.rest && args.length !== callable.params.length) {
      throw new HaraRuntimeError(`${callable.name || "fn"} expects ${callable.params.length} arguments, received ${args.length}`);
    }
    if (callable.rest && args.length < callable.params.length) {
      throw new HaraRuntimeError(`${callable.name || "fn"} expects at least ${callable.params.length} arguments, received ${args.length}`);
    }
    const local = new Environment(callable.env);
    callable.params.forEach((name, index) => local.set(name, args[index]));
    if (callable.rest) local.set(callable.rest, args.slice(callable.params.length));
    const previousNamespace = this.currentNamespace;
    this.currentNamespace = callable.namespace;
    try {
      return await this.evaluateDo(callable.body, local);
    } finally {
      this.currentNamespace = previousNamespace;
    }
  }
}


export { HaraRuntimeError, formatValue } from "./evaluator-core.js";
