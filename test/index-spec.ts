import {all, execute, AsyncIterable} from '../lib';
import {retrieveIterator} from '../lib/util';

import * as chaiAsPromised from 'chai-as-promised';
import * as chai from 'chai';

chai.use(chaiAsPromised);

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

describe('all', () => {

  it('with no delay', async () => {
    const actualValues = await all([1, 2, 3, 4, 5, 6], ((n) => Promise.resolve(n)), 3);
    chai.expect(actualValues).to.deep.equal([1, 2, 3, 4, 5, 6]);
  });

  it('with 100ms delay', async () => {
    const actualValues = await all([1, 2, 3, 4, 5, 6], ((n) => delay(100).then(() => n)), 3);
    chai.expect(actualValues).to.deep.equal([1, 2, 3, 4, 5, 6]);
  });

  it('with default concurrency', async () => {
    const actualValues = await all([1, 2, 3, 4, 5, 6], ((n) => delay(100).then(() => n)));
    chai.expect(actualValues).to.deep.equal([1, 2, 3, 4, 5, 6]);
  });

  it('does not swallow errors', async () => {
    const error = new Error('boom');
    const f = async (n: number) => {
      if (n === 5) {
        throw error;
      }
      await delay(100);
      return n;
    };
    const promise = all([1, 2, 3, 4, 5, 6], f, 3);
    await chai.expect(promise).to.be.rejectedWith(error);
  });

  it('fails with invalid concurrency argument', async () => {
    const promise = all([1, 2, 3, 4, 5, 6], (n) => Promise.resolve(n), -1);
    await chai.expect(promise).to.be.rejectedWith(Error, 'Invalid concurrency value');
  });


});

describe('execute', () => {

  it('with no delay', async () => {
    const actualValues = new Array<number>();
    for await (const value of execute([1, 2, 3, 4, 5, 6], ((n) => Promise.resolve(n)), 3, false)) {
      actualValues.push(value);
    }
    chai.expect(actualValues).to.deep.equal([1, 2, 3, 4, 5, 6]);
  });

  it('with 100ms delay', async () => {
    const actualValues = new Array<number>();
    for await (const value of execute([1, 2, 3, 4, 5, 6], ((n) => delay(100).then(() => n)), 3, false)) {
      actualValues.push(value);
    }
    chai.expect(actualValues).to.deep.equal([1, 2, 3, 4, 5, 6]);
  });

  it('with default concurrency', async () => {
    const actualValues = new Array<number>();
    for await (const value of execute([1, 2, 3, 4, 5, 6], ((n) => delay(100).then(() => n)))) {
      actualValues.push(value);
    }
    chai.expect(actualValues).to.deep.equal([1, 2, 3, 4, 5, 6]);
  });

  it('respects concurrency maximum value', async () => {
    const actualValues = new Array<number>();
    const concurrency = 17;
    let inFlight = 0;
    const hundredNumbers = Array.apply(null, {length: 100}).map(Function.call, Number);
    let exceededLimit = false;
    const f = async (n: number) => {
      if (inFlight > concurrency) {
        exceededLimit = true;
      }
      inFlight++;
      await delay(Math.floor(Math.random() * 500));
      inFlight--;
      return n;
    };
    for await (const value of execute(hundredNumbers, f, concurrency, false)) {
      actualValues.push(value);
    }
    chai.expect(actualValues.sort((a, b) => a - b)).to.deep.equal(hundredNumbers);
    chai.expect(exceededLimit).to.be.false;
  });

  it('achieves optimum concurrency', async () => {
    const actualValues = new Array<number>();
    const concurrency = 17;
    let inFlight = 0;
    const deviationAllowed = 3;
    const hundredNumbers = Array.apply(null, {length: 100}).map(Function.call, Number);
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
      await delay(Math.floor(Math.random() * 500));
      inFlight--;
      return n;
    };
    for await (const value of execute(hundredNumbers, f, concurrency, false)) {
      actualValues.push(value);
    }
    chai.expect(actualValues.sort((a, b) => a - b)).to.deep.equal(hundredNumbers);
    chai.expect(concurrencyReached).to.be.true;
    chai.expect(concurrencyReduced).to.be.false;
  });

  it('exercises back pressure', async () => {
    const tenNumbers = Array.apply(null, {length: 10}).map(Function.call, Number);
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
      await delay(100);
      inFlight--;
      return n;
    };
    for await (const value of execute(numberGenerator(), f, concurrency, true)) {
      actualValues.push(value);
    }
    await delay(300);
    chai.expect(actualValues.sort((a, b) => a - b)).to.deep.equal(tenNumbers);
    chai.expect(tooMuchPressure).to.be.false;
  });

  it('back pressure does not swallow errors', async () => {
    const tenNumbers = Array.apply(null, {length: 10}).map(Function.call, Number);
    const concurrency = 1;
    const error = new Error('boom');
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
      await delay(100);
      return n;
    };
    try {
      for await (const value of execute(numberGenerator(), f, concurrency, true)) {
        actualValues.push(value);
      }
      chai.expect.fail('Expected asynchronous generator iteration to fail');
    } catch (err) {
      if (err.message !== 'boom') {
        throw err;
      }
    }
    chai.expect(actualValues.sort((a, b) => a - b)).to.deep.equal([0, 1, 2, 3, 4]);
  });

  it('ahead of time does not swallow errors', async () => {
    const tenNumbers = Array.apply(null, {length: 10}).map(Function.call, Number);
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
    const gen = execute(numberGenerator(), f, concurrency, false);
    const it = retrieveIterator(gen);
    await delay(1000);
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
      chai.expect.fail('Expected asynchronous generator iteration to fail');
    }
    chai.expect(actualValues.sort((a, b) => a - b)).to.deep.equal([0, 1, 2, 3, 4]);
  });

  it('supports eager consumers', async () => {
    const tenNumbers = Array.apply(null, {length: 10}).map(Function.call, Number);
    const concurrency = 5;
    const actualValues = new Array<number>();
    async function* numberGenerator(): AsyncIterable<number> {
      for (const value of tenNumbers) {
        await delay(50);
        yield value;
      }
    }
    const f = async (n: number) => {
      await delay(100);
      return n;
    };
    const gen = execute(numberGenerator(), f, concurrency, false);
    const it = retrieveIterator(gen);
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

    chai.expect(actualValues.sort((a, b) => a - b)).to.deep.equal(tenNumbers);
  });

  it('supports eager return consumer', async () => {
    const tenNumbers = Array.apply(null, {length: 10}).map(Function.call, Number);
    const concurrency = 5;
    async function* numberGenerator(): AsyncIterable<number> {
      for (const value of tenNumbers) {
        await delay(50);
        yield value;
      }
    }
    const f = async (n: number) => {
      await delay(100);
      return n;
    };
    const gen = execute(numberGenerator(), f, concurrency, false);
    const it = retrieveIterator(gen);
    await delay(300);
    const eagerReturnConsumer = await it.return!(42);
    chai.expect(eagerReturnConsumer).to.deep.equal({done: true, value: 0});
  });

  it('supports eager throwing consumer', async () => {
    const tenNumbers = Array.apply(null, {length: 10}).map(Function.call, Number);
    const concurrency = 5;
    const error = new Error('boom');
    async function* numberGenerator(): AsyncIterable<number> {
      for (const value of tenNumbers) {
        await delay(50);
        yield value;
      }
    }
    const f = async (n: number) => {
      await delay(100);
      return n;
    };
    const gen = execute(numberGenerator(), f, concurrency, false);
    const it = retrieveIterator(gen);
    await delay(300);
    const eagerReturnConsumer = await it.throw!(error);
    chai.expect(eagerReturnConsumer).to.deep.equal({done: false, value: 0});
  });

  it('handles invalid arguments', async () => {
    try {
      for await (const _ignored of execute(undefined as any as Array<number>, ((n) => delay(100).then(() => n)), 3, false)) {
      }
      chai.expect.fail('Expected asynchronous generator iteration to fail');
    } catch (err) {
      if (err.message !== 'Unrecognized source of data') {
        throw err;
      }
    }
  });

});
