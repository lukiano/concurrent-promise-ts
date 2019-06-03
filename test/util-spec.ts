import {errorIterator, _execute} from '../lib/util';

import * as util from 'util';

function delay(ms: number): Promise<void> {
  return util.promisify(setTimeout)(ms);
}

const tenNumbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

describe('errorIterator', () => {

  it('fails on #next()', async () => {
    const error = new Error('boom');
    const it = errorIterator(error);
    await expect(it.next()).rejects.toBe(error);
  });

  it('fails on #return()', async () => {
    const error = new Error('boom');
    const it = errorIterator(error);
    await expect(it.return!()).rejects.toBe(error);
  });

  it('fails on #throw()', async () => {
    const error = new Error('boom');
    const it = errorIterator(error);
    await expect(it.throw!()).rejects.toBe(error);
  });

  it('fails on #throw() with custom error', async () => {
    const error = new Error('boom');
    const throwError = new Error('another boom');
    const it = errorIterator(error);
    await expect(it.throw!(throwError)).rejects.toBe(throwError);
  });

});

describe('_execute', () => {

  it('ahead of time does not swallow errors', async () => {
    const concurrency = 10;
    const error = new Error('boom');
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
        finished = value.done;
        if (value.value !== undefined) {
          actualValues.push(value.value);
        }
      } catch (err) {
        failed = true;
      }
    }
    if (!failed) {
      fail('Expected asynchronous generator iteration to fail');
    }
    expect(actualValues.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
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

    expect(actualValues.sort((a, b) => a - b)).toEqual(tenNumbers);
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
    await expect(it.next()).resolves.toEqual({done: false, value: 0});
    await expect(it.return!(42)).resolves.toEqual({done: true, value: 42});
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
    await expect(it.next()).resolves.toEqual({done: false, value: 0});
    await expect(it.return!()).resolves.toEqual({done: true, value: 1});
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
    await expect(it.next()).resolves.toEqual({done: false, value: 0});
    await delay(100);
    await expect(it.return!()).resolves.toEqual({done: true, value: 1});
    await delay(100);
    expect(lastStatementReached).toBe(true);
  });

  it('supports eager return consumer with asynchronous iterator', async () => {
    const concurrency = 2;
    function numberGenerator(): AsyncIterable<number> {
      const ait: AsyncIterator<number> = {
        async next(): Promise<IteratorResult<number>> {
          return {
            done: false,
            value: 1
          };
        }
      };
      return {
        [Symbol.asyncIterator]: () => {
          return ait;
        }
      };
    }
    const f = async (n: number) => {
      await delay(1000);
      return n;
    };
    const it = _execute(numberGenerator(), f, concurrency, true);
    await delay(10);
    await expect(it.next()).resolves.toEqual({done: false, value: 1});
    await delay(100);
    await expect(it.return!()).resolves.toEqual({done: true, value: 1});
    await delay(100);
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
    await expect(it.next()).resolves.toEqual({done: false, value: 0});
    await delay(100);
    await expect(it.return!()).resolves.toEqual({done: true, value: 1});
    await delay(100);
    expect(lastStatementReached).toBe(true);
  });

  it('supports eager return consumer with regular iterator', async () => {
    const concurrency = 2;
    const f = async (n: number) => {
      await delay(1000);
      return n;
    };
    const it = _execute(tenNumbers, f, concurrency, true);
    await delay(10);
    await expect(it.next()).resolves.toEqual({done: false, value: 0});
    await delay(100);
    await expect(it.return!()).resolves.toEqual({done: true, value: 1});
    await delay(100);
  });

  it('supports throwing producer', async () => {
    const concurrency = 5;
    const error = new Error('boom');
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
    await expect(it.next()).resolves.toEqual({done: false, value: 42});
    await expect(it.next()).resolves.toEqual({done: false, value: 84});
    await expect(it.next()).rejects.toThrow(error);
  });

  it('supports throwing producer (delayed consumer)', async () => {
    const concurrency = 5;
    const error = new Error('boom');
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
    await expect(promise1).rejects.toThrow(error); // first promise fails as the failure is the first value to return since it doesn't go through the 'f' function
    await expect(promise2).resolves.toEqual({done: false, value: 42});
    await expect(promise3).resolves.toEqual({done: false, value: 84});
  });

  it('supports throwing producer (delayed consumer, no backpressure)', async () => {
    const concurrency = 5;
    const error = new Error('boom');
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
    await expect(promise1).resolves.toEqual({done: false, value: 42});
    await expect(promise2).rejects.toThrow(error);
    await expect(promise3).resolves.toEqual({done: false, value: 84});
  });

  it('supports eager throwing producer (delayed consumer, no backpressure)', async () => {
    const concurrency = 5;
    const error = new Error('boom');
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
    await expect(promise1).resolves.toEqual({done: false, value: 42});
    await expect(promise2).rejects.toThrow(error);
  });

  it('supports eager throwing consumer (unhandled)', async () => {
    const concurrency = 5;
    const error = new Error('boom');
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
    const it = _execute(numberGenerator(), f, concurrency, true);
    await delay(1);
    await expect(it.next()).resolves.toEqual({done: false, value: 0});
    await expect(it.throw!(error)).rejects.toThrow(error);
  });

  it('supports eager throwing consumer (handled)', async () => {
    const concurrency = 5;
    const error = new Error('boom');
    let errorCaught = false;
    async function* numberGenerator(): AsyncIterable<number> {
      try {
        for (const value of tenNumbers) {
          await delay(50);
          yield value;
        }
      } catch (err) {
        errorCaught = true;
      }
    }
    const f = async (n: number) => {
      await delay(50);
      return n;
    };
    const it = _execute(numberGenerator(), f, concurrency, true);
    await delay(1);
    await expect(it.next()).resolves.toEqual({done: false, value: 0});
    await it.throw!(error);
    expect(errorCaught).toBe(true);
  });

  it('supports eager throwing consumer with regular generator (unhandled)', async () => {
    const concurrency = 5;
    const error = new Error('boom');
    function* numberGenerator(): Iterable<number> {
      for (const value of tenNumbers) {
        yield value;
      }
    }
    const f = async (n: number) => {
      await delay(50);
      return n;
    };
    const it = _execute(numberGenerator(), f, concurrency, true);
    await delay(1);
    await expect(it.next()).resolves.toEqual({done: false, value: 0});
    await expect(it.throw!(error)).rejects.toThrow(error);
  });

  it('supports eager throwing consumer with regular generator (handled)', async () => {
    const concurrency = 5;
    const error = new Error('boom');
    let errorCaught = false;
    function* numberGenerator(): Iterable<number> {
      try {
        for (const value of tenNumbers) {
          yield value;
        }
      } catch (err) {
        errorCaught = true;
      }
    }
    const f = async (n: number) => {
      await delay(50);
      return n;
    };
    const it = _execute(numberGenerator(), f, concurrency, true);
    await delay(1);
    await expect(it.next()).resolves.toEqual({done: false, value: 0});
    await expect(it.throw!(error)).resolves.toEqual({done: false, value: 1});
    expect(errorCaught).toBe(true);
  });

  it('supports eager throwing consumer with regular iterator', async () => {
    const concurrency = 5;
    const error = new Error('boom');
    const f = async (n: number) => {
      await delay(50);
      return n;
    };
    const it = _execute(tenNumbers, f, concurrency, true);
    await delay(1);
    await expect(it.next()).resolves.toEqual({done: false, value: 0});
    await expect(it.throw!(error)).resolves.toEqual({done: false, value: 1});
  });

  it('supports eager throwing consumer with asynchronous iterator', async () => {
    const concurrency = 5;
    const error = new Error('boom');
    const f = async (n: number) => {
      await delay(50);
      return n;
    };
    function numberGenerator(): AsyncIterable<number> {
      const ait: AsyncIterator<number> = {
        async next(): Promise<IteratorResult<number>> {
          return {
            done: false,
            value: 1
          };
        }
      };
      return {
        [Symbol.asyncIterator]: () => {
          return ait;
        }
      };
    }
    const it = _execute(numberGenerator(), f, concurrency, true);
    await delay(1);
    await expect(it.next()).resolves.toEqual({done: false, value: 1});
    await expect(it.throw!(error)).resolves.toEqual({done: false, value: 1});
  });

});
