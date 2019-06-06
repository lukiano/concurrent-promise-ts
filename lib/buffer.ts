import {done} from './util';

async function* futures<T, U>(source: AsyncIterable<T> | Iterable<T>, f: (t: T) => Promise<U>): AsyncIterable<Future<U>> {
  for await (const item of source) {
    yield new Future(f(item));
  }
}

export async function* buffer<T, U>(source: AsyncIterable<T> | Iterable<T>, f: (t: T) => Promise<U>, concurrency: number, backPressure: boolean): AsyncIterable<U> {
  const sourceIterator = futures(source, f)[Symbol.asyncIterator]();
  const bufferedIterator = new Buffer(sourceIterator, concurrency, backPressure);
  try {
    while (true) {
      const result = await bufferedIterator.next();
      if (result.done) {
        return result.value;
      }
      yield result.value;
    }
  } finally {
    await sourceIterator.return!();
  }
}

/**
 * A successful value given by a job.
 */

class Success<T> {
  constructor(public readonly result: IteratorResult<T>) {}
}

/**
 * A job failure.
 */
class Failure {
  constructor(public readonly err: unknown) {}
}

/**
 * Promise wrapper that enables concurrency.
 */
class Future<T> {
  constructor(public readonly promise: Promise<T>) {}

  async result(): Promise<IteratorResult<T>> {
    const value = await this.promise;
    return {
      done: false,
      value
    };
  }
}

/**
 * Storage of data requested to a source iterator.
 */
class Buffer<T> {

  private readonly _buffer: Array<Success<T> | Failure | Promise<IteratorResult<Future<T>>>> = [];

  private _promisesInFlight = 0;
  private _valuesStored = 0;
  private _finished = false;

  constructor(
    private readonly _sourceIterator: AsyncIterator<Future<T>>,
    private readonly _concurrency: number,
    private readonly _backPressure: boolean) {
    this._fill();
  }

  /**
   * Get the next result from the buffer.
   * @private
   */
  async next(): Promise<IteratorResult<T>> {
    const value = this._buffer.shift()!;
    this._fill();
    if (value instanceof Promise) {
      const result: IteratorResult<Future<T>> = await value;
      if (result.done) {
        return done();
      }
      return result.value.result();
    }
    // If not a promise, then it is a stored result.
    this._valuesStored--;
    if (value instanceof Success) {
      return value.result;
    }
    throw value.err;
  }

  /**
   * Eagerly fill buffer with elements from source iterator.
   * @private
   */
  private _fill(): void {
    while (!this._finished && this._inFlight() < this._concurrency) {
      const promise = this._sourceIterator.next();
      this._buffer.push(promise);
      this._sanitisePromise(promise);
    }
  }

  /**
   * When the promise resolves / rejects, replace the slot with the results, so we don't hold promises forever.
   * @param promise the promise to sanitise.
   * @private
   */
  private async _sanitisePromise(promise: Promise<IteratorResult<Future<T>>>): Promise<void> {
    this._promisesInFlight++;
    let resolvedValue: Success<T> | Failure;
    try {
      const result = await promise;
      let futureResult: IteratorResult<T>;
      if (result.value) {
        futureResult = await result.value.result();
      } else {
        this._finished = true;
        futureResult = done();
      }
      resolvedValue = new Success(futureResult);
    } catch (err) {
      this._finished = true;
      resolvedValue = new Failure(err);
    }
    const i = this._buffer.indexOf(promise);
    if (i >= 0) {
      this._valuesStored++;
      this._buffer[i] = resolvedValue;
    }

    this._promisesInFlight--;
    this._fill(); // if backpressure is disabled we can request more data.

  }

  /**
   * Return the number of jobs currently in flight.
   * @private
   */
  private _inFlight(): number {
    return this._backPressure ? this._promisesInFlight + this._valuesStored : this._promisesInFlight;
  }

}
