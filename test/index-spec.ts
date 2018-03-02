import {all, generate} from '../lib';

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

});

describe('generate', () => {

  it('with no delay', async () => {
    const actualValues = new Array<number>();
    for await (const value of generate([1, 2, 3, 4, 5, 6], ((n) => Promise.resolve(n)), 3, false)) {
      actualValues.push(value);
    }
    chai.expect(actualValues).to.deep.equal([1, 2, 3, 4, 5, 6]);
  });

  it('with 100ms delay', async () => {
    const actualValues = new Array<number>();
    for await (const value of generate([1, 2, 3, 4, 5, 6], ((n) => delay(100).then(() => n)), 3, false)) {
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
    for await (const value of generate(hundredNumbers, f, concurrency, false)) {
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
    for await (const value of generate(hundredNumbers, f, concurrency, false)) {
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
    for await (const value of generate(numberGenerator(), f, concurrency, true)) {
      actualValues.push(value);
    }
    await delay(300);
    chai.expect(actualValues.sort((a, b) => a - b)).to.deep.equal(tenNumbers);
    chai.expect(tooMuchPressure).to.be.false;
  });

});
