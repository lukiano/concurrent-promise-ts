/**
 * Future resolution of a promise returned by calling `next()`
 * when no values where ready to return at the moment the method was called.
 */
type DeferredPromise<T> = {
  resolve: (t: IteratorResult<T>) => void;
  reject: (err: unknown) => void;
};

/**
 * A successful value given by a job.
 */
class Success<T> {
  constructor(public readonly value: T) {}
}

/**
 * A job failure.
 */
class Failure {
  constructor(public readonly err: unknown) {}
}

/**
 * @return true if t is not null nor undefined.
 * @param t a possibly undefined value.
 */
function defined<T>(t: T | null | undefined): t is T {
  return t !== undefined && t !== null;
}

function buildResult<T>(done: boolean, value?: T): IteratorResult<T> {
  return {done, value: value as any as T};
}

export class Queue<T, U> implements AsyncIterator<U> {

  private _jobsInProgress = 0;
  private readonly _resultsReadyToBeConsumed: Array<Success<U> | Failure> = [];
  private readonly _waitingConsumers: Array<DeferredPromise<U>> = [];
  private readonly _valuesPassedByArgument = Array<any>();
  private _producerFinished = false;

  constructor(private readonly _ait: AsyncIterator<T> | undefined,
    private readonly _it: Iterator<T> | undefined,
    private readonly _f: (t: T) => Promise<U>,
    private readonly _concurrency: number,
    private readonly _backPressure: boolean) {
    if (!this._backPressure) {
      this._tryToFireMoreWork();
    }
  }

  next(value?: any): Promise<IteratorResult<U>> {
    return this._doNext(value);
  }

  // finish iterator and ignore remaining results
  return(value?: any): Promise<IteratorResult<U>> {
    this._producerFinished = true;
    return this._doNext(value)
      .then((result) => this._doReturn(result, value))
      .then((result) => buildResult(true, value !== undefined ? value : result.value));
  }

  throw(value?: any): Promise<IteratorResult<U>> {
    return this._doThrow(value).then(() => this.next());
  }

  private _doReturn(result: IteratorResult<U>, value?: any): Promise<IteratorResult<U>> {
    if (this._ait && this._ait.return) {
      return this._ait.return(value).then(() => result);
    }
    if (this._it && this._it.return) {
      this._it.return(value);
    }
    return Promise.resolve(result);
  }

  private _doThrow(value?: any): Promise<any> {
    if (this._ait && this._ait.throw) {
      return this._ait.throw(value);
    }
    if (this._it && this._it.throw) {
      try {
        return Promise.resolve(this._it.throw(value));
      } catch (err) {
        return Promise.reject(err);
      }
    }
    return Promise.resolve();
  }

  private _doNext(value?: any): Promise<IteratorResult<U>> {
    if (this._resultsReadyToBeConsumed.length > 0) {
      const result = this._resultsReadyToBeConsumed.shift()!;
      this._valuesPassedByArgument.push(value);
      this._tryToFireMoreWork();
      if (result instanceof Success) {
        return Promise.resolve(buildResult(false, result.value));
      }
      return Promise.reject(result.err);
    }
    if (this._producerFinished && this._jobsInProgress === 0) {
      return Promise.resolve(buildResult(true));
    }
    this._valuesPassedByArgument.push(value);
    return new Promise<IteratorResult<U>>((resolve, reject) => {
      this._waitingConsumers.push({resolve, reject});
      this._tryToFireMoreWork();
    });
  }

  private _tryToFireMoreWork(): void {
    const resultsWaitingToBeConsumed = this._backPressure
      ? this._resultsReadyToBeConsumed.length + this._jobsInProgress
      : this._jobsInProgress;
    if (resultsWaitingToBeConsumed < this._concurrency && !this._producerFinished) {
      this._startOneJob(this._valuesPassedByArgument.shift());
    }
  }

  private _startOneJob(value: any): void {
    this._jobsInProgress++;
    const next = this._ait ? this._ait.next(value) : Promise.resolve(this._it!.next(value));
    next
      .then((result) => this._processResult(result), (err) => {
        this._jobsInProgress--;
        this._producerError(err);
      });
  }

  private _processResult(result: IteratorResult<T>): void {
    if (defined(result.value)) {
      this._processDefinedResult(result);
    } else {
      this._jobsInProgress--;
      this._addResult(buildResult<U>(result.done, undefined));
      this._tryToFireMoreWork();
    }
  }

  private _processDefinedResult(result: IteratorResult<T>): void {
    this._f(result.value).then((newValue) => {
      this._jobsInProgress--;
      this._addResult(buildResult(result.done, newValue));
      this._tryToFireMoreWork();
    }, (err) => {
      this._jobsInProgress--;
      this._producerError(err);
    });
  }

  private _addResult(result: IteratorResult<U>): void {
    if (this._waitingConsumers.length > 0) {
      this._giveResultToConsumer(result);
    } else {
      if (defined(result.value)) {
        this._resultsReadyToBeConsumed.push(new Success(result.value));
      }
      if (result.done) {
        this._producerHasFinished();
      }
    }
  }

  private _giveResultToConsumer(result: IteratorResult<U>): void {
    if (result.done) {
      this._producerHasFinished();
      if (this._jobsInProgress > 0) {
        if (defined(result.value)) {
          result.done = false;
        } else {
          return;
        }
      }
    }
    if (this._waitingConsumers.length === 0) {
      return;
    }
    const waitingConsumer = this._waitingConsumers.shift()!;
    waitingConsumer.resolve(result);
    if (this._producerFinished && this._waitingConsumers.length > 0 && this._jobsInProgress === 0) {
      this._producerHasFinished();
    }
  }

  private _producerError(err: unknown): void {
    if (this._waitingConsumers.length > 0) {
      const waitingConsumer = this._waitingConsumers.shift()!;
      waitingConsumer.reject(err);
    } else {
      this._resultsReadyToBeConsumed.push(new Failure(err));
    }
    this._producerHasFinished();
  }

  private _producerHasFinished(): void {
    this._producerFinished = true;
    if (this._jobsInProgress === 0) {
      this._resolveWaitingConsumers();
    }
  }

  private _resolveWaitingConsumers(): void {
    while (this._waitingConsumers.length > 0) {
      const waitingConsumer = this._waitingConsumers.shift()!;
      waitingConsumer.resolve(buildResult(true));
    }
  }

}
