import {accumulate, _execute, makeIterator} from './util';

/**
 *
 * @param {Iterable<T> | AsyncIterable<T>} it
 * @param {(t: T) => Promise<U>} f
 * @param {number} concurrency
 * @param {boolean} backPressure
 * @returns {Promise<Array<U>>}
 */
export function all<T, U>(it: Iterable<T> | AsyncIterable<T>, f: (t: T) => Promise<U>, concurrency = 32, backPressure = false): Promise<Array<U>> {
  const results = new Array<U>();
  const ait = _execute(it, f, concurrency, backPressure);
  return accumulate(ait, results);
}

/**
 *
 * @param {Iterable<T> | AsyncIterable<T>} it
 * @param {(t: T) => Promise<U>} f
 * @param {number} concurrency
 * @param {boolean} backPressure
 * @returns {AsyncIterable<U>}
 */
export function execute<T, U>(it: Iterable<T> | AsyncIterable<T>, f: (t: T) => Promise<U>, concurrency = 32, backPressure = false): AsyncIterable<U> {
  return makeIterator(() => _execute(it, f, concurrency, backPressure));
}
