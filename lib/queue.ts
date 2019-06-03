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
    if (!this._backPressure) {
      this._tryToFireMoreWork();
    }
    if (!this._ait && !this._it) {
      throw new Error('Iterator not set');
    }
  }

  next(value?: any): Promise<IteratorResult<U>> {
    return this._doNext(value);
  }

  // finish iterator and ignore remaining results
  async return(value?: U): Promise<IteratorResult<U>> {
    this._producerFinished = true;
    const result = await this._doNext(value, true);
    return buildResult(true, value !== undefined ? value : result.value);
  }

  throw(_e?: any): Promise<IteratorResult<U>> {
    // We don't pass the throw to the original generator.
    // throw does not finish the iteration.
    return this.next();
  }

  private _doNext(value?: any, returnCalled = false): Promise<IteratorResult<U>> {
    if (this._resultsReadyToConsume.length > 0) {
      const result = this._resultsReadyToConsume.shift()!;
      this._nextValues.push(value);
      this._tryToFireMoreWork(returnCalled);
      if (result instanceof Success) {
        return Promise.resolve(buildResult(false, result.value));
      } else {
        return Promise.reject(result.err);
      }
    }
    if (this._producerFinished && this._producersInProgress === 0) {
      return Promise.resolve(buildResult(true));
    }
    return new Promise<IteratorResult<U>>((resolve, reject) => {
      this._waitingConsumers.push({resolve, reject});
      this._nextValues.push(value);
      this._tryToFireMoreWork(returnCalled);
    });
  }

  private _tryToFireMoreWork(returnCalled = false): void {
    const resultsWaitingToBeConsumed = this._backPressure
      ? this._resultsReadyToConsume.length + this._producersInProgress
      : this._producersInProgress;
    if (resultsWaitingToBeConsumed < this._concurrency && !this._producerFinished) {
      this._startWork(this._nextValues.shift(), returnCalled);
      // setImmediate(() => this._tryToFireMoreWork());
    }
  }

  private async _startWork(value: any, returnCalled: boolean): Promise<void> {
    this._producersInProgress++;
    try {
      const result = this._ait
          ? await (returnCalled && this._ait.return ? this._ait.return(value) : this._ait.next(value))
          : (returnCalled && this._it!.return ? this._it!.return(value) : this._it!.next(value));
      if (defined(result.value)) {
        const newValue = await this._f(result.value);
        this._producersInProgress--;
        this._addResult(buildResult(result.done, newValue));
      } else {
        this._producersInProgress--;
        this._addResult(buildResult<U>(result.done, undefined));
      }
    } catch (err) {
      this._producersInProgress--;
      this._producerError(err);
    } finally {
      this._tryToFireMoreWork();
    }
  }

  private _addResult(result: IteratorResult<U>): void {
    if (this._waitingConsumers.length > 0) {
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
      const waitingConsumer = this._waitingConsumers.shift()!;
      waitingConsumer.resolve(result);
      if (this._producerFinished && this._waitingConsumers.length > 0 && this._producersInProgress === 0) {
        this._producerHasFinished();
      }
      return;
    } else {
      if (defined(result.value)) {
        this._resultsReadyToConsume.push(new Success(result.value));
      }
      if (result.done) {
        this._producerHasFinished();
      }
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
      while (this._waitingConsumers.length > 0) {
        const waitingConsumer = this._waitingConsumers.shift()!;
        waitingConsumer.resolve(buildResult(true));
      }
    }
  }

}
