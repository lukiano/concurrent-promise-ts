import {isAsyncIterable, isIterable, iterable2asyncIterable} from './util';
import {Queue} from './queue';

(Symbol as any).asyncIterator = Symbol.asyncIterator || Symbol.for('asyncIterator');

export function all<T, U>(it: Iterable<T> | AsyncIterable<T>, f: (t: T) => Promise<U>, concurrency = 32, backPressure = false): Promise<Array<U>> {
  const gen = generate(it, f, concurrency, backPressure);
  const results = new Array<U>();
  return accumulate(gen[Symbol.asyncIterator](), results).then(() => results);
}

function accumulate<U>(ait: AsyncIterator<U>, results: Array<U>): Promise<void> {
  return ait.next().then((result) => {
    if (result.value) {
      results.push(result.value);
    }
    if (!result.done) {
      return accumulate(ait, results);
    }
    return Promise.resolve();
  });
}

export function generate<T, U>(it: Iterable<T> | AsyncIterable<T>, f: (t: T) => Promise<U>, concurrency: number, backPressure: boolean): AsyncIterable<U> {
  if (isIterable(it)) {
    it = iterable2asyncIterable(it);
  }
  if (isAsyncIterable(it)) {
    return {
      [Symbol.asyncIterator](): AsyncIterator<U> {
        const gen = it as AsyncIterable<T>;
        return new Queue(gen[Symbol.asyncIterator](), f, concurrency, backPressure);
      }
    };
  }
  // Return failure iterator
  return {
    [Symbol.asyncIterator](): AsyncIterator<U> {
      return {
        next: () => Promise.reject(new Error('Unrecognized source of data'))
      };
    }
  };
}
