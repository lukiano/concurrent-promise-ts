import {errorIterator, iterable2asyncIterable, retrieveIterator} from '../lib/util';

import * as chaiAsPromised from 'chai-as-promised';
import * as chai from 'chai';
import {SinonTyped} from 'sinon-typed';

chai.use(chaiAsPromised);

describe('errorIterator', () => {

  it('fails on #next()', async () => {
    const error = new Error('boom');
    const it = retrieveIterator(errorIterator(error));
    await chai.expect(it.next()).to.be.rejectedWith(error);
  });

  it('fails on #return()', async () => {
    const error = new Error('boom');
    const it = retrieveIterator(errorIterator(error));
    await chai.expect(it.return!()).to.be.rejectedWith(error);
  });

  it('fails on #throw()', async () => {
    const error = new Error('boom');
    const it = retrieveIterator(errorIterator(error));
    await chai.expect(it.throw!()).to.be.rejectedWith(error);
  });

  it('fails on #throw() with custom error', async () => {
    const error = new Error('boom');
    const throwError = new Error('another boom');
    const it = retrieveIterator(errorIterator(error));
    await chai.expect(it.throw!(throwError)).to.be.rejectedWith(throwError);
  });

});

describe('iterable2asyncIterable', () => {

  it('forwards #next()', async () => {
    const iteratorStub = SinonTyped.stub<Iterator<number>>();
    iteratorStub.stubMethod('next').withArgs(4).returns(6);
    const iterable = {
      [Symbol.iterator]: () => iteratorStub.object
    };
    const it = retrieveIterator(iterable2asyncIterable(iterable));
    await chai.expect(it.next(4)).to.eventually.equal(6);
  });

  it('catches #next() errors', async () => {
    const iteratorStub = SinonTyped.stub<Iterator<number>>();
    const error = new Error('boom');
    iteratorStub.stubMethod('next').withArgs(4).throws(error);
    const iterable = {
      [Symbol.iterator]: () => iteratorStub.object
    };
    const it = retrieveIterator(iterable2asyncIterable(iterable));
    await chai.expect(it.next(4)).to.be.rejectedWith(error);
  });

  it('forwards #return()', async () => {
    const iteratorStub = SinonTyped.stub<Iterator<number>>();
    iteratorStub.stubMethod('return').withArgs(5).returns(7);
    const iterable = {
      [Symbol.iterator]: () => iteratorStub.object
    };
    const it = retrieveIterator(iterable2asyncIterable(iterable));
    await chai.expect(it.return!(5)).to.eventually.equal(7);
  });

  it('returns value if #return() is not defined', async () => {
    const iteratorStub = SinonTyped.stub<Iterator<number>>();
    const iterable = {
      [Symbol.iterator]: () => iteratorStub.object
    };
    const it = retrieveIterator(iterable2asyncIterable(iterable));
    await chai.expect(it.return!(5)).to.eventually.deep.equal({done: true, value: 5});
  });

  it('catches #return() errors', async () => {
    const iteratorStub = SinonTyped.stub<Iterator<number>>();
    const error = new Error('boom');
    iteratorStub.stubMethod('return').withArgs(5).throws(error);
    const iterable = {
      [Symbol.iterator]: () => iteratorStub.object
    };
    const it = retrieveIterator(iterable2asyncIterable(iterable));
    await chai.expect(it.return!(5)).to.be.rejectedWith(error);
  });

  it('forwards #throw()', async () => {
    const iteratorStub = SinonTyped.stub<Iterator<number>>();
    const throwError = new Error('another boom');
    iteratorStub.stubMethod('throw').withArgs(throwError).returns(8);
    const iterable = {
      [Symbol.iterator]: () => iteratorStub.object
    };
    const it = retrieveIterator(iterable2asyncIterable(iterable));
    await chai.expect(it.throw!(throwError)).to.eventually.equal(8);
  });

  it('catches #throw() errors', async () => {
    const iteratorStub = SinonTyped.stub<Iterator<number>>();
    const error = new Error('boom');
    const throwError = new Error('another boom');
    iteratorStub.stubMethod('throw').withArgs(throwError).throws(error);
    const iterable = {
      [Symbol.iterator]: () => iteratorStub.object
    };
    const it = retrieveIterator(iterable2asyncIterable(iterable));
    await chai.expect(it.throw!(throwError)).to.be.rejectedWith(error);
  });

  it('rethrows error if #throw() is not defined', async () => {
    const iteratorStub = SinonTyped.stub<Iterator<number>>();
    const throwError = new Error('another boom');
    const iterable = {
      [Symbol.iterator]: () => iteratorStub.object
    };
    const it = retrieveIterator(iterable2asyncIterable(iterable));
    await chai.expect(it.throw!(throwError)).to.be.rejectedWith(throwError);
  });

  it('finished iterator if #throw() is not defined', async () => {
    const iteratorStub = SinonTyped.stub<Iterator<number>>();
    const iterable = {
      [Symbol.iterator]: () => iteratorStub.object
    };
    const it = retrieveIterator(iterable2asyncIterable(iterable));
    await chai.expect(it.throw!()).to.eventually.deep.equal({done: true, value: undefined});
  });

});
