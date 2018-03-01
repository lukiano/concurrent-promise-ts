import {all} from '../lib';

import * as chai from 'chai';

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

describe('all', () => {
  it('', () => {
    return all([1, 2, 3, 4, 5, 6], ((n) => delay(100).then(() => n)), 3)
      .then((values) => {
        chai.expect(values).to.deep.equal([1, 2, 3, 4, 5, 6]);
      });
  });
});
