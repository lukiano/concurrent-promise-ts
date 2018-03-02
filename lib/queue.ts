import {buildResult} from './util';

type Consumer<T> = {
  resolve: (t: IteratorResult<T>) => void;
  reject: (err: Error) => void;
};

class Success<T> {
  constructor(public readonly value: T) {}
}

class Failure {
  constructor(public readonly err: Error) {}
}

type Try<T> = Success<T> | Failure;

export class Queue<T, U> implements AsyncIterator<U> {

  private _producersInProgress = 0;
  private readonly _resultsReadyToConsume = new Array<Try<U>>();
  private readonly _waitingConsumers = new Array<Consumer<U>>();
  private readonly _nextValues = Array<any>();
  private _producerFinished = false;
  private _logEnabled = false;

  constructor(private readonly _ait: AsyncIterator<T>,
    private readonly _f: (t: T) => Promise<U>,
    private readonly _concurrency: number,
    private readonly _backPressure: boolean) {
    if (this._concurrency <= 0) {
      throw new Error('Invalid concurrency value');
    }
    if (!this._backPressure) {
      this._tryToFireMoreWork();
    }
  }

  next(value?: any): Promise<IteratorResult<U>> {
    return this._doNext(value);
  }

  // finish iterator and ignore remaining results
  return?(value?: U): Promise<IteratorResult<U>> {
    this._producerFinished = true;
    return this._doNext(value).then((result) => buildResult(true, result.value ? result.value : value));
  }

  throw?(_e?: any): Promise<IteratorResult<U>> {
    // We don't pass the throw to the original generator.
    // throw does not finish the iteration.
    return this.next();
  }

  private _invarianceCheck(): void {
    if (this._resultsReadyToConsume.length > 0 && this._waitingConsumers.length > 0) {
      this._producerError(new Error('Invariance failed'));
    }
  }

  private _doNext(value?: any): Promise<IteratorResult<U>> {
    this._invarianceCheck();

    if (this._resultsReadyToConsume.length > 0) {
      const result = this._resultsReadyToConsume.shift()!;
      this._log('I will consume', result);
      this._nextValues.push(value);
      this._tryToFireMoreWork();
      if (result instanceof Success) {
        return Promise.resolve(buildResult(false, result.value));
      } else {
        return Promise.reject(result.err);
      }
    }
    if (this._producerFinished && this._producersInProgress === 0) {
      this._log('I want to consume but producer finished is true');
      return Promise.resolve(buildResult(true));
    }
    this._log('I want to consume but there is nothing to consume');
    return new Promise<IteratorResult<U>>((resolve, reject) => {
      this._waitingConsumers.push({resolve, reject});
      this._nextValues.push(value);
      this._tryToFireMoreWork();
    });
  }

  private _tryToFireMoreWork(): void {
    const resultsWaitingToBeConsumed = this._backPressure
      ? this._resultsReadyToConsume.length + this._producersInProgress
      : this._producersInProgress;
    if (resultsWaitingToBeConsumed < this._concurrency && !this._producerFinished) {
      this._log('starting work');
      this._startWork(this._nextValues.shift());
      setImmediate(() => this._tryToFireMoreWork());
    }
  }

  private _startWork(value?: any): void {
    this._producersInProgress++;
    this._ait.next(value).then((result) => {
      this._log('received value from source', result);
      if (defined(result.value)) {
        return this._f(result.value).then((newValue) => buildResult(result.done, newValue));
      } else {
        return buildResult(result.done, result.value);
      }
    }).then((result: IteratorResult<U>) => {
      this._producersInProgress--;
      this._addResult(result);
      this._tryToFireMoreWork();
    }, (err: Error) => {
      this._producersInProgress--;
      this._producerError(err);
      this._tryToFireMoreWork();
    });
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
      this._log('returning result to waiting consumer', result);
      waitingConsumer.resolve(result);
      return;
    }
    if (defined(result.value)) {
      this._log('adding result to ready array', result);
      this._resultsReadyToConsume.push(new Success(result.value));
    }
    if (result.done) {
      this._producerHasFinished();
    }

  }

  private _producerError(err: Error): void {
    if (this._waitingConsumers.length > 0) {
      this._log('returning error to waiting consumer', err.message);
      const waitingConsumer = this._waitingConsumers.shift()!;
      waitingConsumer.reject(err);
    } else {
      this._log('adding error to ready array', err.message);
      this._resultsReadyToConsume.push(new Failure(err));
    }
    this._producerHasFinished();
    this._log(`Producer or mapper function failed with ${err.message}`);
  }

  private _producerHasFinished(): void {
    this._log('producer finished');
    this._producerFinished = true;
    if (this._producersInProgress === 0) {
      while (this._waitingConsumers.length > 0) {
        const waitingConsumer = this._waitingConsumers.shift()!;
        waitingConsumer.resolve(buildResult(true));
      }
    }
  }

  private _log(message?: any, ...optionalParams: Array<any>): void {
    if (this._logEnabled) {
      console.log(message, ...optionalParams);
    }
  }
}

function defined<T>(t: T | null | undefined): t is T {
  return t !== undefined && t !== null;
}
