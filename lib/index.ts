import {enqueue} from './queue';
import {accumulate, empty, isAsyncIterable, isIterable, shield} from './util';

/**
 * Read all the values from the (a)synchronous iterator, apply the `f` function to each of them, and store the results into an array.
 * @template {T} type of the values returned by the source iterator.
 * @template {U} type of the values returned by the this iterator. The `f` function must return values of the same type.
 * @param {Iterable<T> | AsyncIterable<T>} source the (a)synchronous iterator to read the source values from.
 * @param {(t: T) => Promise<U>} f a function that will be applied to each value received from the iterator.
 * If it fails for any value, the returning promise will be rejected with the corresponding error.
 * @param {number} concurrency the maximum number of jobs running at a time.
 * A job is the concatenation of requesting a value to the source iterator plus calling the function `f` with that value.
 * @returns {Promise<Array<U>>} An array with the values resulting from applying the function `f` to each value of the iterator.
 * The values in the array will be in the same order as the iterator returned them.
 */
export async function all<T, U>(source: Iterable<T> | AsyncIterable<T> | Promise<T | Iterable<T>> | T, f: (t: T) => Promise<U | Iterable<U>> | AsyncIterable<U>, concurrency = 32): Promise<Array<U>> {
  return accumulate(execute(source, f, concurrency, false));
}

/**
 * Returns a new asynchronous iterable that has `it` as source and applies the function `f` to each value of `it`, as being requested.
 * @template {T} type of the values returned by the source iterator.
 * @template {U} type of the values returned by the this iterator. The `f` function must return values of the same type.
 * @param {Iterable<T> | AsyncIterable<T>} source the source iterator that provides values.
 * @param {(t: T) => Promise<U>} f a function that will be applied to each value of the source iterator.
 * @param {number} concurrency the maximum number of jobs running at a time.
 * A job is the concatenation of requesting a value to the source iterator plus calling the function `f` with that value.
 * @param {boolean} backPressure if `concurrency` number of results are waiting to be consumed by the user,
 * no more values will be requested from the source iterator.
 * @returns {AsyncIterable<U>}
 */
export function execute<T, U>(source: Iterable<T> | AsyncIterable<T> | Promise<T | Iterable<T>> | T, f: (t: T) => Promise<U | Iterable<U>> | AsyncIterable<U>, concurrency = 32, backPressure = false): AsyncIterable<U> {
  if (Number.isNaN(concurrency) || !Number.isSafeInteger(concurrency) || concurrency <= 0) {
    throw new Error('Invalid concurrency value');
  }

  if (source === null || source === undefined) {
    return enqueue(empty<T>(), f, concurrency, backPressure);
  }
  if (isIterable(source) || isAsyncIterable(source)) {
    return enqueue(source, f, concurrency, backPressure);
  }
  return enqueue(shield(source), f, concurrency, backPressure);
}
