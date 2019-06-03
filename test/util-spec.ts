import {errorIterator, _execute} from '../lib/util';

import * as chaiAsPromised from 'chai-as-promised';
import * as chai from 'chai';
import * as util from 'util';

chai.use(chaiAsPromised);

function delay(ms: number): Promise<void> {
  return util.promisify(setTimeout)(ms);
}

const tenNumbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

describe('errorIterator', () => {

  it('fails on #next()', async () => {
    const error = new Error('boom');
    const it = errorIterator(error);
    await chai.expect(it.next()).to.be.rejectedWith(error);
  });

  it('fails on #return()', async () => {
    const error = new Error('boom');
    const it = errorIterator(error);
    await chai.expect(it.return!()).to.be.rejectedWith(error);
  });

  it('fails on #throw()', async () => {
    const error = new Error('boom');
    const it = errorIterator(error);
    await chai.expect(it.throw!()).to.be.rejectedWith(error);
  });

  it('fails on #throw() with custom error', async () => {
    const error = new Error('boom');
    const throwError = new Error('another boom');
    const it = errorIterator(error);
    await chai.expect(it.throw!(throwError)).to.be.rejectedWith(throwError);
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
      chai.expect.fail('Expected asynchronous generator iteration to fail');
    }
    chai.expect(actualValues.sort((a, b) => a - b)).to.deep.equal([0, 1, 2, 3, 4]);
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

    chai.expect(actualValues.sort((a, b) => a - b)).to.deep.equal(tenNumbers);
  });

  it('supports eager return consumer', async () => {
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
    const eagerReturnConsumer = await it.return!(42);
    chai.expect(eagerReturnConsumer).to.deep.equal({done: true, value: 0});
  });

  it('supports eager throwing consumer', async () => {
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
    const it = _execute(numberGenerator(), f, concurrency, false);
    await delay(1);
    const eagerReturnConsumer = await it.throw!(error);
    chai.expect(eagerReturnConsumer).to.deep.equal({done: false, value: 0});
  });

});
