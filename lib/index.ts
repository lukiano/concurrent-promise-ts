(Symbol as any).asyncIterator = Symbol.asyncIterator || Symbol.for('asyncIterator');

export function all<T, U>(it: Iterable<T> | AsyncIterable<T>, f: (t: T) => U, _concurrency = 32): Promise<Array<U>> {
  if (isIterable(it)) {
      return Promise.all(Array.from(it).map(f));
  }
  if (isAsyncIterable(it)) {

  }
  return Promise.reject(new Error('Unrecognized source of data'));
}

export function generate<T, U>(it: Iterable<T> | AsyncIterable<T>, f: (t: T) => U, _concurrency = 32): AsyncIterable<U> {
    return {
        [Symbol.asyncIterator](): AsyncIterator<U> {

        }
    }
}

function isAsyncIterable<T>(it: any): it is AsyncIterable<T> {
  return typeof it[Symbol.asyncIterator] === 'function';
}

function isIterable<T>(it: any): it is Iterable<T> {
    return typeof it[Symbol.iterator] === 'function';
}
