import {accumulate, errorIterator, isAsyncIterable, isIterable, iterable2asyncIterable} from './util';
import {Queue} from './queue';

(Symbol as any).asyncIterator = Symbol.asyncIterator || Symbol.for('asyncIterator');

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
  const gen = execute(it, f, concurrency, backPressure);
  return accumulate(gen[Symbol.asyncIterator](), results).then(() => results);
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
  if (concurrency <= 0) {
    return errorIterator(new Error('Invalid concurrency value'));
  }

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
  return errorIterator(new Error('Unrecognized source of data'));
}
