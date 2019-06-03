import {Queue} from '../lib/queue';

describe('Queue', () => {

  it('requires iterator', () => {
    expect(() => new Queue(undefined, undefined, async () => {}, 1, false)).toThrow('Iterator not set');
  });

});
