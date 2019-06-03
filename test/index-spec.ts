import * as chaiAsPromised from 'chai-as-promised';
import * as chai from 'chai';
import * as util from 'util';

import {all, execute} from '../lib';
import {makeIterator} from '../lib/util';

chai.use(chaiAsPromised);

function delay(ms: number): Promise<void> {
  return util.promisify(setTimeout)(ms);
}

const tenNumbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

describe('all', () => {

  it('with no delay', async () => {
    const actualValues = await all([1, 2, 3, 4, 5, 6], ((n) => Promise.resolve(n)), 3);
    chai.expect(actualValues).to.deep.equal([1, 2, 3, 4, 5, 6]);
  });

  it('with 50ms delay', async () => {
    const actualValues = await all([1, 2, 3, 4, 5, 6], ((n) => delay(50).then(() => n)), 3);
    chai.expect(actualValues).to.deep.equal([1, 2, 3, 4, 5, 6]);
  });

  it('with default concurrency', async () => {
    const actualValues = await all([1, 2, 3, 4, 5, 6], ((n) => delay(50).then(() => n)));
    chai.expect(actualValues).to.deep.equal([1, 2, 3, 4, 5, 6]);
  });

  it('does not swallow errors', async () => {
    const error = new Error('boom');
    const f = async (n: number) => {
      if (n === 5) {
        throw error;
      }
      await delay(50);
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

  it('with 50ms delay', async () => {
    const actualValues = new Array<number>();
    for await (const value of execute([1, 2, 3, 4, 5, 6], ((n) => delay(50).then(() => n)), 3, false)) {
      actualValues.push(value);
    }
    chai.expect(actualValues).to.deep.equal([1, 2, 3, 4, 5, 6]);
  });

  it('with default concurrency', async () => {
    const actualValues = new Array<number>();
    for await (const value of execute([1, 2, 3, 4, 5, 6], ((n) => delay(50).then(() => n)))) {
      actualValues.push(value);
    }
    chai.expect(actualValues).to.deep.equal([1, 2, 3, 4, 5, 6]);
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
    chai.expect(actualValues.sort((a, b) => a - b)).to.deep.equal(values);
    chai.expect(exceededLimit).to.be.false;
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
    chai.expect(actualValues.sort((a, b) => a - b)).to.deep.equal(values);
    chai.expect(concurrencyReached).to.be.true;
    chai.expect(concurrencyReduced).to.be.false;
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
    chai.expect(actualValues.sort((a, b) => a - b)).to.deep.equal(tenNumbers);
    chai.expect(tooMuchPressure).to.be.false;
  });

  it('back pressure does not swallow errors', async () => {
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
      await delay(50);
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

  it('supports 1-value iterator', async () => {
    const ait = makeIterator(() => {
      return {
        next: () => Promise.resolve({done: true, value: 42}),
        return: () => Promise.resolve({done: true, value: 42}),
        throw: (e?: Error) => Promise.reject(e)
      };
    });
    const f = async (n: number) => {
      await delay(50);
      return n;
    };
    const it = execute(ait, f);
    await delay(1);
    for await (const value of it) {
      chai.expect(value).to.equal(42);
    }
  });

});
