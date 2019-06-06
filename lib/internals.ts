/**
 * A successful value given by a job.
 */
class Success<T> {
  constructor(public readonly value: IteratorResult<T>) {}
}

/**
 * A job failure.
 */
class Failure {
  constructor(public readonly err: unknown) {}
}

export class Processor<T, U> {

  private readonly _buffer: Array<Success<U> | Failure | Promise<IteratorResult<U>>> = [];
  private readonly _sourceIterator: AsyncIterator<T> | Iterator<T>;

  private _promisesInFlight = 0;
  private _valuesStored = 0;
  private _finished = false;

  constructor(ait: AsyncIterable<T> | undefined,
    it: Iterable<T> | undefined,
    private readonly _f: (t: T) => Promise<U>,
    private readonly _concurrency: number,
    private readonly _backPressure: boolean) {
    this._sourceIterator = ait ? ait[Symbol.asyncIterator]() : it![Symbol.iterator]();
  }

  /**
   * Execute generator function and return its iterator.
   */
  run(): AsyncIterator<U> {
    return this._generator()[Symbol.asyncIterator]();
  }

  private async *_generator(): AsyncIterable<U> {
    this._fillBuffer();

    try {
      while (this._buffer.length > 0) {
        const result = await this._getOneFromBuffer();
        if (result.done) {
          return result.value; // return to finish the generator.
        }
        try {
          yield result.value;
        } catch (e) { // yield may throw an error if Iterator#throw is called.
          if (this._sourceIterator.throw) {
            await this._sourceIterator.throw(e);
          }
        }

        this._fillBuffer(); // request more data since we freed a slot.
      }
    } finally {
      if (this._sourceIterator.return) {
        await this._sourceIterator.return();
      }
    }
  }

  /**
   * Get the next result from the buffer.
   * @private
   */
  private async _getOneFromBuffer(): Promise<IteratorResult<U>> {
    const value = this._buffer.shift()!;
    if (value instanceof Promise) {
      return value;
    }
    // If not a promise, then it is a stored result.
    this._valuesStored--;
    if (value instanceof Success) {
      return value.value;
    }
    throw value.err;
  }

  /**
   * Process the next element from the source iterator and apply function F.
   * @private
   */
  private async _next(): Promise<IteratorResult<U>> {
    const result = await this._sourceIterator.next();
    if (result.done) {
      return result as any as IteratorResult<U>; // casting needed as IteratorResult<U> interface is wrong in the value field.
    }
    return {
      done: false,
      value: await this._f(result.value)
    };
  }

  /**
   * Return the number of jobs currently in flight.
   * @private
   */
  private _inFlight(): number {
    return this._backPressure ? this._promisesInFlight + this._valuesStored : this._promisesInFlight;
  }

  /**
   * Replace the promise in the buffer with the result of such promise to avoid storing promises that may never be requested.
   * @param promise the promise to be replaced.
   * @param result the resulting value of the promise once it was fulfilled.
   * @private
   */
  private _replaceWithResult(promise: Promise<IteratorResult<U>>, result: Success<U> | Failure): void {
    const i = this._buffer.indexOf(promise);
    if (i >= 0) {
      this._valuesStored++;
      this._buffer[i] = result;
    }
  }

  /**
   * Eagerly fill buffer with elements from source iterator.
   * @private
   */
  private _fillBuffer(): void {
    while (!this._finished && this._inFlight() < this._concurrency) {
      this._promisesInFlight++;
      const promise = this._next();
      this._buffer.push(promise);

      promise.then((result) => {
        this._promisesInFlight--;
        if (result.done) {
          // source iterator finished successfully.
          this._finished = true;
        }
        this._replaceWithResult(promise, new Success(result));
        this._fillBuffer(); // if backpressure is disabled we can request more data.
      }, (err) => {
        // source iterator finished with an error.
        this._finished = true;
        this._promisesInFlight--;
        this._replaceWithResult(promise, new Failure(err));
      });
    }
  }

}
