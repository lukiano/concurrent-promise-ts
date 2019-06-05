import {buildResult, defined} from './util';

type Consumer<T> = {
  resolve: (t: IteratorResult<T>) => void;
  reject: (err: unknown) => void;
};

class Success<T> {
  constructor(public readonly value: T) {}
}

class Failure {
  constructor(public readonly err: unknown) {}
}

type Try<T> = Success<T> | Failure;

export class Queue<T, U> implements AsyncIterator<U> {

  private _producersInProgress = 0;
  private readonly _resultsReadyToConsume = new Array<Try<U>>();
  private readonly _waitingConsumers = new Array<Consumer<U>>();
  private readonly _nextValues = Array<any>();
  private _producerFinished = false;

  constructor(private readonly _ait: AsyncIterator<T> | undefined,
    private readonly _it: Iterator<T> | undefined,
    private readonly _f: (t: T) => Promise<U>,
    private readonly _concurrency: number,
    private readonly _backPressure: boolean) {
    if (!this._ait && !this._it) {
      throw new Error('Iterator not set');
    }
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
    if (this._resultsReadyToConsume.length > 0) {
      return this._returnResultReadyToConsume(value);
    }
    if (this._producerFinished && this._producersInProgress === 0) {
      return Promise.resolve(buildResult(true));
    }
    return new Promise<IteratorResult<U>>((resolve, reject) => {
      this._waitingConsumers.push({resolve, reject});
      this._nextValues.push(value);
      this._tryToFireMoreWork();
    });
  }

  private _returnResultReadyToConsume(value?: any): Promise<IteratorResult<U>> {
    const result = this._resultsReadyToConsume.shift()!;
    this._nextValues.push(value);
    this._tryToFireMoreWork();
    if (result instanceof Success) {
      return Promise.resolve(buildResult(false, result.value));
    }
    return Promise.reject(result.err);
  }

  private _tryToFireMoreWork(): void {
    const resultsWaitingToBeConsumed = this._backPressure
      ? this._resultsReadyToConsume.length + this._producersInProgress
      : this._producersInProgress;
    if (resultsWaitingToBeConsumed < this._concurrency && !this._producerFinished) {
      this._startWork(this._nextValues.shift());
      // setImmediate(() => this._tryToFireMoreWork());
    }
  }

  private _startWork(value: any): Promise<void> {
    this._producersInProgress++;
    const next = this._ait ? this._ait.next(value) : Promise.resolve(this._it!.next(value));
    return next
      .then((result) => this._processResult(result), (err) => {
        this._producersInProgress--;
        this._producerError(err);
      })
      .then(() => {
        this._tryToFireMoreWork();
      });
  }

  private _processResult(result: IteratorResult<T>): Promise<void> {
    if (defined(result.value)) {
      return this._processDefinedResult(result);
    } else {
      this._producersInProgress--;
      this._addResult(buildResult<U>(result.done, undefined));
      return Promise.resolve();
    }
  }

  private _processDefinedResult(result: IteratorResult<T>): Promise<void> {
    return this._f(result.value).then((newValue) => {
      this._producersInProgress--;
      this._addResult(buildResult(result.done, newValue));
    }, (err) => {
      this._producersInProgress--;
      this._producerError(err);
    });
  }

  private _addResult(result: IteratorResult<U>): void {
    if (this._waitingConsumers.length > 0) {
      this._giveResultToConsumer(result);
    } else {
      if (defined(result.value)) {
        this._resultsReadyToConsume.push(new Success(result.value));
      }
      if (result.done) {
        this._producerHasFinished();
      }
    }
  }

  private _giveResultToConsumer(result: IteratorResult<U>): void {
    if (result.done) {
      this._producerHasFinished();
      if (this._producersInProgress > 0) {
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
    if (this._producerFinished && this._waitingConsumers.length > 0 && this._producersInProgress === 0) {
      this._producerHasFinished();
    }
  }

  private _producerError(err: unknown): void {
    if (this._waitingConsumers.length > 0) {
      const waitingConsumer = this._waitingConsumers.shift()!;
      waitingConsumer.reject(err);
    } else {
      this._resultsReadyToConsume.push(new Failure(err));
    }
    this._producerHasFinished();
  }

  private _producerHasFinished(): void {
    this._producerFinished = true;
    if (this._producersInProgress === 0) {
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
