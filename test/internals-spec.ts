import {deepEqual, equal, fail, rejects} from 'node:assert';
import {describe, it} from 'node:test';

import {buffer} from '../lib/buffer';

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

const tenNumbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function _execute<T, U>(it: Iterable<T> | AsyncIterable<T>, f: (t: T) => Promise<U>, concurrency: number, backPressure: boolean): AsyncIterator<U> {
  return buffer(it, f, concurrency, backPressure)[Symbol.asyncIterator]();
}

describe('Processor', () => {

  it('ahead of time does not swallow errors', async () => {
    const concurrency = 10;
    const error = new Error('boom 8');
    const actualValues = new Array<number>();
    async function* numberGenerator(): AsyncIterable<number> {
      for (const value of tenNumbers) {
        await delay(50);
        yield value;
      }
    }
    const f = async (n: number) => {
      await delay(100);
      if (n === 5) {
        throw error;
      }
      return n;
    };
    const it = _execute(numberGenerator(), f, concurrency, false);
    await delay(1);
    let failed = false;
    let finished = false;
    while (!failed && !finished) {
      try {
        const value = await it.next();
        finished = value.done || false;
        if (value.value !== undefined) {
          actualValues.push(value.value);
        }
      } catch {
        failed = true;
      }
    }
    if (!failed) {
      fail('Expected asynchronous generator iteration to fail');
    }
    deepEqual(actualValues.sort((a, b) => a - b), [0, 1, 2, 3, 4]);
  });

  it('supports eager consumers', async () => {
    const concurrency = 5;
    const actualValues = new Array<number>();
    async function* numberGenerator(): AsyncIterable<number> {
      for (const value of tenNumbers) {
        await delay(50);
        yield value;
      }
    }
    const f = async (n: number) => {
      await delay(50);
      return n;
    };
    const it = _execute(numberGenerator(), f, concurrency, false);
    const eagerConsumers = new Array<Promise<IteratorResult<number>>>();
    for (let i = 0; i < 20; i++) {
      eagerConsumers.push(it.next());
    }
    const results = await Promise.all(eagerConsumers);
    results.forEach((result) => {
      if (result.value !== undefined) {
        actualValues.push(result.value);
      }
    });

    deepEqual(actualValues.sort((a, b) => a - b), tenNumbers);
  });

  it('supports eager return consumer with a value', async () => {
    const concurrency = 5;
    async function* numberGenerator(): AsyncIterable<number> {
      for (const value of tenNumbers) {
        await delay(50);
        yield value;
      }
    }
    const f = async (n: number) => {
      await delay(50);
      return n;
    };
    const it = _execute(numberGenerator(), f, concurrency, false);
    await delay(1);
    deepEqual(await it.next(), {done: false, value: 0});
    deepEqual(await it.return!(42), {done: true, value: 42});
  });

  it('supports eager return consumer with no value', async () => {
    const concurrency = 5;
    async function* numberGenerator(): AsyncIterable<number> {
      for (const value of tenNumbers) {
        await delay(50);
        yield value;
      }
    }
    const f = async (n: number) => {
      await delay(50);
      return n;
    };
    const it = _execute(numberGenerator(), f, concurrency, false);
    await delay(1);
    deepEqual(await it.next(), {done: false, value: 0});
    deepEqual(await it.return!(), {done: true, value: undefined});
  });

  it('supports eager return consumer with backpressure', async () => {
    const concurrency = 2;
    let lastStatementReached = false;
    async function* numberGenerator(): AsyncIterable<number> {
      try {
        for (const value of tenNumbers) {
          await delay(10);
          yield value;
        }
      } finally {
        lastStatementReached = true;
      }
    }
    const f = async (n: number) => {
      await delay(1000);
      return n;
    };
    const it = _execute(numberGenerator(), f, concurrency, true);
    await delay(10);
    deepEqual(await it.next(), {done: false, value: 0});
    await delay(100);
    deepEqual(await it.return!(), {done: true, value: undefined});
    await delay(100);
    equal(lastStatementReached, true);
  });

  it('supports eager return consumer with regular generator', async () => {
    const concurrency = 2;
    let lastStatementReached = false;
    function* numberGenerator(): Iterable<number> {
      try {
        for (const value of tenNumbers) {
          yield value;
        }
      } finally {
        lastStatementReached = true;
      }
    }
    const f = async (n: number) => {
      await delay(1000);
      return n;
    };
    const it = _execute(numberGenerator(), f, concurrency, true);
    await delay(10);
    deepEqual(await it.next(), {done: false, value: 0});
    await delay(100);
    deepEqual(await it.return!(), {done: true, value: undefined});
    await delay(100);
    equal(lastStatementReached, true);
  });

  it('supports throwing producer', async () => {
    const concurrency = 5;
    const error = new Error('boom 9');
    async function* numberGenerator(): AsyncIterable<number> {
      await delay(50);
      yield 42;
      await delay(50);
      yield 84;
      await delay(50);
      throw error;
    }
    const f = async (n: number) => {
      return n;
    };
    const it = _execute(numberGenerator(), f, concurrency, true);
    await delay(1);
    deepEqual(await it.next(), {done: false, value: 42});
    deepEqual(await it.next(), {done: false, value: 84});
    await rejects(it.next(), error);
  });

  it('supports throwing producer (delayed consumer)', async () => {
    const concurrency = 1;
    const error = new Error('boom 10');
    async function* numberGenerator(): AsyncIterable<number> {
      yield 42;
      yield 84;
      throw error;
    }
    const f = async (n: number) => {
      await delay(n);
      return n;
    };
    const it = _execute(numberGenerator(), f, concurrency, true);
    await delay(1);
    const promise1 = it.next();
    const promise2 = it.next();
    const promise3 = it.next();
    deepEqual(await promise1, {done: false, value: 42});
    deepEqual(await promise2, {done: false, value: 84});
    await rejects(promise3, error);
  });

  it('supports throwing producer (delayed consumer, no backpressure)', async () => {
    const concurrency = 5;
    const error = new Error('boom 11');
    async function* numberGenerator(): AsyncIterable<number> {
      await delay(10);
      yield 42;
      await delay(10);
      yield 84;
      await delay(10);
      throw error;
    }
    const f = async (n: number) => {
      if (n === 84) {
        await delay(100);
      }
      return n;
    };
    const it = _execute(numberGenerator(), f, concurrency, false);
    await delay(1);
    const promise1 = it.next();
    const promise2 = it.next();
    const promise3 = it.next();
    deepEqual(await promise1, {done: false, value: 42});
    deepEqual(await promise2, {done: false, value: 84});
    await rejects(promise3, error);
  });

  it('supports eager throwing producer (delayed consumer, no backpressure)', async () => {
    const concurrency = 5;
    const error = new Error('boom 12');
    async function* numberGenerator(): AsyncIterable<number> {
      yield 42;
      throw error;
    }
    const f = async (n: number) => {
      return n;
    };
    const it = _execute(numberGenerator(), f, concurrency, false);
    await delay(1);
    const promise1 = it.next();
    await delay(50);
    const promise2 = it.next();
    deepEqual(await promise1, {done: false, value: 42});
    await rejects(promise2, error);
  });

});
