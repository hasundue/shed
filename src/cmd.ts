import type { ConstructorSpy } from "@std/testing/mock";
import * as std from "@std/testing/mock";

export interface CommandSpy<Command extends string | URL>
  extends
    Disposable,
    ConstructorSpy<
      Deno.Command,
      [command: Command, options?: Deno.CommandOptions]
    > {
}

export interface CommandStub<Command extends string | URL>
  extends CommandSpy<Command> {
  fake: typeof Deno.Command;
}

const CommandOriginal = Deno.Command;

class CommandDummy extends CommandOriginal {
  #output: Deno.CommandOutput = {
    code: 0,
    stdout: new Uint8Array(),
    stderr: new Uint8Array(),
    success: true,
    signal: null,
  };
  override output() {
    return Promise.resolve(this.#output);
  }
  override outputSync() {
    return this.#output;
  }
  override spawn() {
    return new Deno.ChildProcess();
  }
}

const spies = new Map<
  string,
  ConstructorSpy<
    Deno.Command,
    [command: string | URL, options?: Deno.CommandOptions]
  >
>();

export function stub<Command extends string | URL>(
  command: Command,
  fake: typeof Deno.Command = CommandDummy,
): CommandStub<Command> {
  const spy = std.spy(fake);
  spies.set(command.toString(), spy);
  Object.defineProperties(spy, {
    fake: {
      enumerable: true,
      value: fake,
    },
    name: {
      value: "Deno.Command",
    },
    [Symbol.dispose]: {
      value() {
        spies.delete(command.toString());
      },
    },
  });
  return spy as unknown as CommandStub<Command>;
}

export function spy<Command extends string | URL>(
  command: Command,
): CommandSpy<Command> {
  return stub(command, CommandOriginal);
}

const CommandProxy: typeof Deno.Command = new Proxy(CommandOriginal, {
  construct(target, args) {
    const [command, options] = args as ConstructorParameters<
      typeof Deno.Command
    >;
    const spy = spies.get(command.toString());
    if (spy) {
      return new spy(command, options);
    } else {
      return new target(command, options);
    }
  },
});

export function restore() {
  Deno.Command = CommandOriginal;
}

export function mock(): Disposable {
  Deno.Command = CommandProxy;
  return {
    [Symbol.dispose]() {
      restore();
    },
  };
}

export function use<T>(fn: () => T): T {
  mock();
  try {
    return fn();
  } finally {
    restore();
  }
}