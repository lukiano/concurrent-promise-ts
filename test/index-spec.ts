import {deepEqual, equal, fail, rejects, throws} from 'node:assert';
import {describe, it} from 'node:test';

import {all, execute} from '../lib';

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

function wait<T>(ms: number, t: T): Promise<T> {
  return delay(ms).then(() => t);
}

const tenNumbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

describe('all', () => {

  it('handles undefined arguments', async () => {
    throws(() => all(undefined as unknown as Array<number>, () => delay(100)), /Unrecognized source of data/);
  });

  it('handles plain values', async () => {
    const actualValues = await all([42], ((n) => wait(100, n + 1)), 3);
    deepEqual(actualValues, [43]);
  });

  it('handles plain promises', async () => {
    const actualValues = await all(wait(100, 42), ((n) => wait(100, n + 1)), 3);
    deepEqual(actualValues, [43]);
  });

  it('handles promises that return arrays', async () => {
    const actualValues = await all(wait(100, [42, 44]), ((n) => wait(100, n + 1)), 3);
    deepEqual(actualValues, [43, 45]);
  });

  it('with no delay', async () => {
    const actualValues = await all([1, 2, 3, 4, 5, 6], ((n) => Promise.resolve(n)), 3);
    deepEqual(actualValues, [1, 2, 3, 4, 5, 6]);
  });

  it('with iterables', async () => {
    const actualValues = await all([1, 2, 3, 4, 5, 6], ((n) => Promise.resolve([n, n])), 3);
    deepEqual(actualValues, [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });

  it('with 50ms delay', async () => {
    const actualValues = await all([1, 2, 3, 4, 5, 6], ((n) => wait(50, n)), 3);
    deepEqual(actualValues, [1, 2, 3, 4, 5, 6]);
  });

  it('with delayed async iterables', async () => {
    async function* f(n: number): AsyncIterable<number> {
      await delay(n * 10);
      yield n;
    }
    const actualValues = await all([1, 2, 3, 4, 5, 6], f);
    deepEqual(actualValues, [1, 2, 3, 4, 5, 6]);
  });

  it('with default concurrency', async () => {
    const actualValues = await all([1, 2, 3, 4, 5, 6], ((n) => wait(50, n)));
    deepEqual(actualValues, [1, 2, 3, 4, 5, 6]);
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
    await rejects(promise, error);
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
    await rejects(promise, error);
  });

  it('fails with negative concurrency argument', async () => {
    const promise = all([1, 2, 3, 4, 5, 6], (n) => Promise.resolve(n), -1);
    await rejects(promise, /Invalid concurrency value/);
  });

  it('fails with invalid concurrency argument', async () => {
    const promise = all([1, 2, 3, 4, 5, 6], (n) => Promise.resolve(n), NaN);
    await rejects(promise, /Invalid concurrency value/);
  });

  it('with empty sources', async () => {
    const actualValues = await all([], ((n) => wait(50, n)));
    deepEqual(actualValues, []);
  });

});

describe('execute', () => {

  it('with no delay', async () => {
    const actualValues = new Array<number>();
    for await (const value of execute([1, 2, 3, 4, 5, 6], ((n) => Promise.resolve(n)), 3, false)) {
      actualValues.push(value);
    }
    deepEqual(actualValues, [1, 2, 3, 4, 5, 6]);
  });

  it('with 50ms delay', async () => {
    const actualValues = new Array<number>();
    for await (const value of execute([1, 2, 3, 4, 5, 6], ((n) => wait(50, n)), 3, false)) {
      actualValues.push(value);
    }
    deepEqual(actualValues, [1, 2, 3, 4, 5, 6]);
  });

  it('with default concurrency', async () => {
    const actualValues = new Array<number>();
    for await (const value of execute([1, 2, 3, 4, 5, 6], ((n) => wait(50, n)))) {
      actualValues.push(value);
    }
    deepEqual(actualValues, [1, 2, 3, 4, 5, 6]);
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
    deepEqual(actualValues.sort((a, b) => a - b), values);
    equal(exceededLimit, false);
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
    deepEqual(actualValues.sort((a, b) => a - b), values);
    equal(concurrencyReached, true);
    equal(concurrencyReduced, false);
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
    deepEqual(actualValues.sort((a, b) => a - b), tenNumbers);
    equal(tooMuchPressure, false);
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
    deepEqual(actualValues.sort((a, b) => a - b), [0, 1, 2, 3, 4]);
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
      equal(value, 42);
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
    equal(lastStatementReached, true);
    equal(tooMuchPressure, false);
  });

});
