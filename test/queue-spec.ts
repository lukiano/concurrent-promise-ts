import * as chaiAsPromised from 'chai-as-promised';
import * as chai from 'chai';

import {Queue} from '../lib/queue';

chai.use(chaiAsPromised);

describe('Queue', () => {

  it('requires iterator', () => {
    chai.expect(() => new Queue(undefined, undefined, async () => {}, 1, false)).to.throw('Iterator not set');
  });

});
