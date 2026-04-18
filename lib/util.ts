/**
 * Checks that an object has a method on Symbol.asyncIterator that returns an iterator.
 * @param {any} it the object to check if it conforms to the AsyncIterable spec.
 * @returns true if `it` has method on Symbol.asyncIterator that returns an iterator.
 */
export function isAsyncIterable<T>(it: unknown): it is AsyncIterable<T> {
  return (
    typeof it === "object" &&
    it !== null &&
    Symbol.asyncIterator in it &&
    typeof it[Symbol.asyncIterator] === "function"
  );
}

/**
 * Checks that an object has a method on Symbol.iterator that returns an iterator.
 * @param {any} it the object to check if it conforms to the Iterable spec.
 * @returnss true if `it` has method on Symbol.iterator that returns an iterator.
 */
export function isIterable<T>(it: unknown): it is Iterable<T> {
  return (
    typeof it === "object" &&
    it !== null &&
    Symbol.iterator in it &&
    typeof it[Symbol.iterator] === "function"
  );
}

/**
 * Read all the values produced by the asynchronous iterator into an array and return it.
 * @template {U} type of the values returned by the source iterator.
 * @param {AsyncIterator<U>} ait iterator to read the values from.
 * @returns {Promise<Array<U>>} a promise fulfilled with the an array after all the values of the iterator have been added to it, or rejected by any error produced by the source iterator.
 */
export async function accumulate<U>(ait: AsyncIterable<U>): Promise<Array<U>> {
  const results: Array<U> = [];
  for await (const value of ait) {
    results.push(value);
  }
  return results;
}

export function done<T>(): IteratorResult<T> {
  return {
    done: true,
    value: undefined,
  };
}
