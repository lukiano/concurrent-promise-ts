import {Processor} from './internals';

/**
 * Returns a new asynchronous iterator that has `it` as source and applies the function `f` to each value of `it`, as being requested.
 * @template {T} type of the values returned by the source iterator.
 * @template {U} type of the values returned by the this iterator. The `f` function must return values of the same type.
 * @param {Iterable<T> | AsyncIterable<T>} it the source iterator that provides values.
 * @param {(t: T) => Promise<U>} f a function that will be applied to each value of the source iterator.
 * @param {number} concurrency the maximum number of jobs running at a time.
 * A job is the concatenation of requesting a value to the source iterator plus calling the function `f` with that value.
 * @param {boolean} backPressure if `concurrency` number of results are waiting to be consumed by the user,
 * no more values will be requested from the source iterator.
 * @returns {AsyncIterator<U>}
 */
function executeOnce<T, U>(it: Iterable<T> | AsyncIterable<T>, f: (t: T) => Promise<U>, concurrency: number, backPressure: boolean): AsyncIterator<U> {
  backPressure = Boolean(backPressure);

  if (Number.isNaN(concurrency) || !Number.isSafeInteger(concurrency) || concurrency <= 0) {
    return errorIterator(new Error('Invalid concurrency value'));
  }

  if (it) {
    if (isIterable(it)) {
      return new Processor(undefined, it, f, concurrency, backPressure).run();
    } else if (isAsyncIterable(it)) {
      return new Processor(it, undefined, f, concurrency, backPressure).run();
    }
  }

  return errorIterator(new Error('Unrecognized source of data'));
}

/**
 * Checks that an object has a method on Symbol.asyncIterator that returns an iterator.
 * @param {any} it the object to check if it conforms to the AsyncIterable spec.
 * @returns true if `it` has method on Symbol.asyncIterator that returns an iterator.
 */
function isAsyncIterable<T>(it: any): it is AsyncIterable<T> {
  return typeof it[Symbol.asyncIterator] === 'function';
}

/**
 * Checks that an object has a method on Symbol.iterator that returns an iterator.
 * @param {any} it the object to check if it conforms to the Iterable spec.
 * @returnss true if `it` has method on Symbol.iterator that returns an iterator.
 */
function isIterable<T>(it: any): it is Iterable<T> {
  return typeof it[Symbol.iterator] === 'function';
}

/**
 * Read all the values produced by the asynchronous iterator into an array and return it.
 * @template {U} type of the values returned by the source iterator.
 * @param {AsyncIterator<U>} ait iterator to read the values from.
 * @param {Array<U>} results an array where the values of the iterator will be stored into.
 * The values will be added to the array in the same order that they are received from the iterator.
 * @returns {Promise<Array<U>>} a promise fulfilled with the `results` array after all the values of the iterator have been added to it, or rejected by any error produced by the source iterator.
 */
function accumulate<U>(ait: AsyncIterator<U>, results: Array<U>): Promise<Array<U>> {
  return ait.next().then((result) => {
    if (result.done) {
      return results;
    }
    results.push(result.value);
    return accumulate(ait, results);
  });
}

/**
 * Creates an asynchronous generator that always fails with the given error value.
 * @param {Error} err the error value to be returned by the asynchronous generator.
 * @returns {AsyncIterator}
 */
export function errorIterator(err: Error): AsyncIterator<never> {
  return {
    next: () => Promise.reject(err),
    return: () => Promise.reject(err),
    throw: (e?: Error) => Promise.reject(e || err)
  };
}


/**
 * Read all the values from the (a)synchronous iterator, apply the `f` function to each of them, and store the results into an array.
 * @template {T} type of the values returned by the source iterator.
 * @template {U} type of the values returned by the this iterator. The `f` function must return values of the same type.
 * @param {Iterable<T> | AsyncIterable<T>} it the (a)synchronous iterator to read the source values from.
 * @param {(t: T) => Promise<U>} f a function that will be applied to each value received from the iterator.
 * If it fails for any value, the returning promise will be rejected with the corresponding error.
 * @param {number} concurrency the maximum number of jobs running at a time.
 * A job is the concatenation of requesting a value to the source iterator plus calling the function `f` with that value.
 * @returns {Promise<Array<U>>} An array with the values resulting from applying the function `f` to each value of the iterator.
 * The values in the array will be in the same order as the iterator returned them.
 */
export function all<T, U>(it: Iterable<T> | AsyncIterable<T>, f: (t: T) => Promise<U>, concurrency = 32): Promise<Array<U>> {
  const results: Array<U> = [];
  const ait = executeOnce(it, f, concurrency, false);
  return accumulate(ait, results);
}

/**
 * Returns a new asynchronous iterable that has `it` as source and applies the function `f` to each value of `it`, as being requested.
 * @template {T} type of the values returned by the source iterator.
 * @template {U} type of the values returned by the this iterator. The `f` function must return values of the same type.
 * @param {Iterable<T> | AsyncIterable<T>} it the source iterator that provides values.
 * @param {(t: T) => Promise<U>} f a function that will be applied to each value of the source iterator.
 * @param {number} concurrency the maximum number of jobs running at a time.
 * A job is the concatenation of requesting a value to the source iterator plus calling the function `f` with that value.
 * @param {boolean} backPressure if `concurrency` number of results are waiting to be consumed by the user,
 * no more values will be requested from the source iterator.
 * @returns {AsyncIterable<U>}
 */
export function execute<T, U>(it: Iterable<T> | AsyncIterable<T>, f: (t: T) => Promise<U>, concurrency = 32, backPressure = false): AsyncIterable<U> {
  return {
    [Symbol.asyncIterator]: () => executeOnce(it, f, concurrency, backPressure)
  };
}
