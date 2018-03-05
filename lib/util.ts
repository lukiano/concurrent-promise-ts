export interface AsyncIterator<T> {
  next(value?: any): Promise<IteratorResult<T>>;
  return?(value?: any): Promise<IteratorResult<T>>;
  throw?(e?: any): Promise<IteratorResult<T>>;
}

export interface AsyncIterable<T> {
  [Symbol.asyncIterator](): AsyncIterator<T>;
}

export function buildResult<T>(done: boolean, value?: T): IteratorResult<T> {
  return {done, value: value as any as T};
}

export function isAsyncIterable<T>(it: any): it is AsyncIterable<T> {
  return it && typeof it[Symbol.asyncIterator] === 'function';
}

export function retrieveIterator<T>(ait: AsyncIterable<T>): AsyncIterator<T> {
  return ait[Symbol.asyncIterator]();
}

export function makeIterator<T>(f: () => AsyncIterator<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: f
  };
}

export function isIterable<T>(it: any): it is Iterable<T> {
  return it && typeof it[Symbol.iterator] === 'function';
}

export function iterable2asyncIterable<T>(it: Iterable<T>): AsyncIterable<T> {
  return makeIterator(() => {
    const iterator = it[Symbol.iterator]();
    return {
      next: (value?: any) => {
        try {
          return Promise.resolve(iterator.next(value));
        } catch (err) {
          return Promise.reject(err);
        }
      },
      return: (value?: T) => {
        if (iterator.return) {
          try {
            return Promise.resolve(iterator.return(value));
          } catch (err) {
            return Promise.reject(err);
          }
        }
        return Promise.resolve(buildResult(true, value));
      },
      throw: (e?: Error) => {
        if (iterator.throw) {
          try {
            return Promise.resolve(iterator.throw(e));
          } catch (err) {
            return Promise.reject(err);
          }
        }
        return e ? Promise.reject(e) : Promise.resolve(buildResult(true));
      }
    };
  });
}


export function accumulate<U>(ait: AsyncIterator<U>, results: Array<U>): Promise<void> {
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

export function errorIterator(err: Error): AsyncIterable<never> {
  return makeIterator(() => {
    return {
      next: () => Promise.reject(err),
      return: () => Promise.reject(err),
      throw: (e?: Error) => e ? Promise.reject(e) : Promise.reject(err)
    };
  });
}

export function defined<T>(t: T | null | undefined): t is T {
  return t !== undefined && t !== null;
}
