import {Queue} from './queue';

export function _execute<T, U>(it: Iterable<T> | AsyncIterable<T>, f: (t: T) => Promise<U>, concurrency: number, backPressure: boolean): AsyncIterator<U> {
  if (concurrency <= 0) {
    return errorIterator(new Error('Invalid concurrency value'));
  }

  if (isIterable(it)) {
    return new Queue(undefined, it[Symbol.iterator](), f, concurrency, backPressure);
  } else if (isAsyncIterable(it)) {
    return new Queue(it[Symbol.asyncIterator](), undefined, f, concurrency, backPressure);
  }

  // Return failure iterator
  return errorIterator(new Error('Unrecognized source of data'));
}

export function buildResult<T>(done: boolean, value?: T): IteratorResult<T> {
  return {done, value: value as any as T};
}

export function isAsyncIterable<T>(it: any): it is AsyncIterable<T> {
  return it && typeof it[Symbol.asyncIterator] === 'function';
}

export function makeIterator<T>(f: () => AsyncIterator<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: f
  };
}

export function isIterable<T>(it: any): it is Iterable<T> {
  return it && typeof it[Symbol.iterator] === 'function';
}

export async function accumulate<U>(ait: AsyncIterator<U>, results: Array<U>): Promise<void> {
  const result = await ait.next();
  if (result.value) {
    results.push(result.value);
  }
  if (!result.done) {
    return accumulate(ait, results);
  }
}

export function errorIterator(err: Error): AsyncIterator<never> {
  return {
    next: () => Promise.reject(err),
    return: () => Promise.reject(err),
    throw: (e?: Error) => e ? Promise.reject(e) : Promise.reject(err)
  };
}

export function defined<T>(t: T | null | undefined): t is T {
  return t !== undefined && t !== null;
}
