import {all, generate} from '../lib';

import * as chai from 'chai';

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

});
