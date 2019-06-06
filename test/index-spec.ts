import {all, errorIterator, execute} from '../lib';

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

const tenNumbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

describe('all', () => {

  it('with no delay', async () => {
    const actualValues = await all([1, 2, 3, 4, 5, 6], ((n) => Promise.resolve(n)), 3);
    expect(actualValues).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('with 50ms delay', async () => {
    const actualValues = await all([1, 2, 3, 4, 5, 6], ((n) => delay(50).then(() => n)), 3);
    expect(actualValues).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('with default concurrency', async () => {
    const actualValues = await all([1, 2, 3, 4, 5, 6], ((n) => delay(50).then(() => n)));
    expect(actualValues).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('does not swallow errors', async () => {
    const error = new Error('boom 1');
    const f = async (n: number) => {
      if (n === 5) {
        throw error;
      }
      await delay(50);
      return n;
    };
    const promise = all([1, 2, 3, 4, 5, 6], f, 3);
    await expect(promise).rejects.toBe(error);
  });

  it('does not swallow errors at full concurrency', async () => {
    const error = new Error('boom 2');
    const f = async (n: number) => {
      await delay(50);
      if (n === 5) {
        throw error;
      }
      return n;
    };
    const promise = all([1, 2, 3, 4, 5, 6], f);
    await expect(promise).rejects.toBe(error);
  });

  it('fails with negative concurrency argument', async () => {
    const promise = all([1, 2, 3, 4, 5, 6], (n) => Promise.resolve(n), -1);
    await expect(promise).rejects.toThrow('Invalid concurrency value');
  });

  it('fails with invalid concurrency argument', async () => {
    const promise = all([1, 2, 3, 4, 5, 6], (n) => Promise.resolve(n), NaN);
    await expect(promise).rejects.toThrow('Invalid concurrency value');
  });

});

describe('execute', () => {

  it('with no delay', async () => {
    const actualValues = new Array<number>();
    for await (const value of execute([1, 2, 3, 4, 5, 6], ((n) => Promise.resolve(n)), 3, false)) {
      actualValues.push(value);
    }
    expect(actualValues).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('with 50ms delay', async () => {
    const actualValues = new Array<number>();
    for await (const value of execute([1, 2, 3, 4, 5, 6], ((n) => delay(50).then(() => n)), 3, false)) {
      actualValues.push(value);
    }
    expect(actualValues).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('with default concurrency', async () => {
    const actualValues = new Array<number>();
    for await (const value of execute([1, 2, 3, 4, 5, 6], ((n) => delay(50).then(() => n)))) {
      actualValues.push(value);
    }
    expect(actualValues).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('respects concurrency maximum value', async () => {
    const actualValues = new Array<number>();
    const concurrency = 17;
    let inFlight = 0;
    const values = [...Array(100).keys()];
    let exceededLimit = false;
    const f = async (n: number) => {
      if (inFlight > concurrency) {
        exceededLimit = true;
      }
      inFlight++;
      await delay(Math.floor(Math.random() * 50));
      inFlight--;
      return n;
    };
    for await (const value of execute(values, f, concurrency, false)) {
      actualValues.push(value);
    }
    expect(actualValues.sort((a, b) => a - b)).toEqual(values);
    expect(exceededLimit).toBe(false);
  });

  it('achieves optimum concurrency', async () => {
    const actualValues = new Array<number>();
    const concurrency = 17;
    let inFlight = 0;
    const deviationAllowed = 3;
    const values = [...Array(100).keys()];
    let concurrencyReached = false;
    let concurrencyReduced = false;
    const f = async (n: number) => {
      inFlight++;
      if (inFlight === concurrency) {
        concurrencyReached = true;
      }
      if (concurrencyReached && inFlight < (concurrency - deviationAllowed)) {
        concurrencyReduced = true;
      }
      await delay(Math.floor(Math.random() * 50));
      inFlight--;
      return n;
    };
    for await (const value of execute(values, f, concurrency, false)) {
      actualValues.push(value);
    }
    expect(actualValues.sort((a, b) => a - b)).toEqual(values);
    expect(concurrencyReached).toBe(true);
    expect(concurrencyReduced).toBe(false);
  });

  it('exercises back pressure', async () => {
    const concurrency = 1;
    const actualValues = new Array<number>();
    async function* numberGenerator(): AsyncIterable<number> {
      for (const value of tenNumbers) {
        await delay(50);
        yield value;
      }
    }
    let inFlight = 0;
    let tooMuchPressure = false;
    const f = async (n: number) => {
      if (inFlight > 1) {
        tooMuchPressure = true;
      }
      inFlight++;
      await delay(50);
      inFlight--;
      return n;
    };
    for await (const value of execute(numberGenerator(), f, concurrency, true)) {
      actualValues.push(value);
    }
    await delay(1);
    expect(actualValues.sort((a, b) => a - b)).toEqual(tenNumbers);
    expect(tooMuchPressure).toBe(false);
  });

  it('back pressure does not swallow errors', async () => {
    const concurrency = 1;
    const error = new Error('boom 3');
    const actualValues = new Array<number>();
    async function* numberGenerator(): AsyncIterable<number> {
      for (const value of tenNumbers) {
        await delay(50);
        if (value === 5) {
          throw error;
        }
        yield value;
      }
    }
    const f = async (n: number) => {
      await delay(50);
      return n;
    };
    try {
      for await (const value of execute(numberGenerator(), f, concurrency, true)) {
        actualValues.push(value);
      }
      fail('Expected asynchronous generator iteration to fail');
    } catch (err) {
      if (err !== error) {
        throw err;
      }
    }
    expect(actualValues.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('handles undefined arguments', async () => {
    try {
      for await (const _ignored of execute(undefined as any as Array<number>, ((n) => delay(100).then(() => n)), 3, false)) {
      }
      fail('Expected asynchronous generator iteration to fail');
    } catch (err) {
      if (err.message !== 'Unrecognized source of data') {
        throw err;
      }
    }
  });

  it('handles invalid arguments', async () => {
    try {
      for await (const _ignored of execute(42 as any as Array<number>, ((n) => delay(100).then(() => n)), 3, false)) {
      }
      fail('Expected asynchronous generator iteration to fail');
    } catch (err) {
      if (err.message !== 'Unrecognized source of data') {
        throw err;
      }
    }
  });

  it('supports 1-value iterator', async () => {
    const ait = {
      [Symbol.asyncIterator]: () => {
        return {
          next: () => Promise.resolve({done: true, value: 42}),
          return: () => Promise.resolve({done: true, value: 42}),
          throw: (e?: Error) => Promise.reject(e)
        };
      }
    };
    const f = async (n: number) => {
      await delay(50);
      return n;
    };
    const it = execute(ait, f);
    await delay(1);
    for await (const value of it) {
      expect(value).toEqual(42);
    }
  });

  it('exercises break with back pressure', async () => {
    const concurrency = 2;
    const actualValues = new Array<number>();
    let lastStatementReached = false;
    async function* numberGenerator(): AsyncIterable<number> {
      try {
        for (const value of tenNumbers) {
          await delay(50);
          yield value;
        }
      } finally {
        lastStatementReached = true;
      }
    }
    let inFlight = 0;
    let tooMuchPressure = false;
    const f = async (n: number) => {
      if (inFlight > 1) {
        tooMuchPressure = true;
      }
      inFlight++;
      await delay(50);
      inFlight--;
      return n;
    };
    for await (const value of execute(numberGenerator(), f, concurrency, true)) {
      actualValues.push(value);
      if (value === 5) {
        break;
      }
    }
    await delay(1);
    expect(lastStatementReached).toBe(true);
    expect(tooMuchPressure).toBe(false);
  });

});

describe('errorIterator', () => {

  it('fails on #next()', async () => {
    const error = new Error('boom 4');
    const it = errorIterator(error);
    await expect(it.next()).rejects.toBe(error);
  });

  it('fails on #return()', async () => {
    const error = new Error('boom 5');
    const it = errorIterator(error);
    await expect(it.return!()).rejects.toBe(error);
  });

  it('fails on #throw()', async () => {
    const error = new Error('boom 6');
    const it = errorIterator(error);
    await expect(it.throw!()).rejects.toBe(error);
  });

  it('fails on #throw() with custom error', async () => {
    const error = new Error('boom 7');
    const throwError = new Error('another boom');
    const it = errorIterator(error);
    await expect(it.throw!(throwError)).rejects.toBe(throwError);
  });

});

function _execute<T, U>(it: Iterable<T> | AsyncIterable<T>, f: (t: T) => Promise<U>, concurrency: number, backPressure: boolean): AsyncIterator<U> {
  const iterable = execute(it, f, concurrency, backPressure);
  return iterable[Symbol.asyncIterator]();
}

describe('executeOnce', () => {

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
    await expect(it.return!()).resolves.toEqual({done: true, value: undefined});
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
    await expect(it.return!()).resolves.toEqual({done: true, value: undefined});
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
    await expect(it.return!()).resolves.toEqual({done: true, value: undefined});
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
    await expect(it.return!()).resolves.toEqual({done: true, value: undefined});
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
    await expect(it.return!()).resolves.toEqual({done: true, value: undefined});
    await delay(100);
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
    await expect(it.next()).resolves.toEqual({done: false, value: 42});
    await expect(it.next()).resolves.toEqual({done: false, value: 84});
    await expect(it.next()).rejects.toThrow(error);
  });

  it('supports throwing producer (delayed consumer)', async () => {
    const concurrency = 5;
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
    await expect(promise1).resolves.toEqual({done: false, value: 42});
    await expect(promise2).resolves.toEqual({done: false, value: 84});
    await expect(promise3).rejects.toThrow(error);
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
    await expect(promise1).resolves.toEqual({done: false, value: 42});
    await expect(promise2).resolves.toEqual({done: false, value: 84});
    await expect(promise3).rejects.toThrow(error);
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
    await expect(promise1).resolves.toEqual({done: false, value: 42});
    await expect(promise2).rejects.toThrow(error);
  });

  it('supports eager throwing consumer (unhandled)', async () => {
    const concurrency = 5;
    const error = new Error('boom 13');
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
    const error = new Error('boom 14');
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
    const error = new Error('boom 15');
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
    const error = new Error('boom 16');
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
    const error = new Error('boom 17');
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
    const error = new Error('boom 18');
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
